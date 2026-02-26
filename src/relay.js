const nocodb = require('./nocodb');
const clickupApi = require('./platforms/clickup-api');
const slackApi = require('./platforms/slack-api');
const discordApi = require('./platforms/discord-api');
const { downloadFile, getFilenameFromUrl } = require('./utils/attachments');
const config = require('./config');

// Cache Slack user display names
const slackUserCache = new Map();

async function resolveAuthorName(source, rawAuthor) {
    let name = rawAuthor;

    // Resolve Slack user ID to display name
    if (source === 'slack' && rawAuthor && rawAuthor.startsWith('U')) {
        if (slackUserCache.has(rawAuthor)) {
            name = slackUserCache.get(rawAuthor);
        } else {
            try {
                name = await slackApi.getUserDisplayName(rawAuthor);
                slackUserCache.set(rawAuthor, name);
            } catch {
                name = rawAuthor;
            }
        }
    }

    // Check NocoDB NameMappings for custom override
    try {
        const customName = await nocodb.resolveDisplayName(source, name);
        return customName; // Returns original name if no mapping found
    } catch {
        return name;
    }
}

/**
 * Format message per target platform — NO platform tag, just name.
 */
function formatForPlatform(platform, displayName, text) {
    switch (platform) {
        case 'discord':
            return `**${displayName}**: ${text || ''}`;
        case 'slack':
            return `*${displayName}*: ${text || ''}`;
        case 'clickup':
            return `[${displayName}] ${text || ''}`;
        default:
            return `${displayName}: ${text || ''}`;
    }
}

/**
 * Check if a message was sent by our sync (loop prevention).
 */
function isSyncedMessage(text) {
    if (!text) return false;
    // Old formats
    if (text.startsWith('**[') && text.includes('—')) return true;
    if (/^[\u{1F7E0}\u{1F7E2}\u{1F7E3}] \*\*/u.test(text)) return true;
    // New formats: **name**: / *name*: / [name]
    if (/^\*\*[^*]+\*\*: /.test(text)) return true;   // Discord: **name**: 
    if (/^\*[^*]+\*: /.test(text)) return true;         // Slack: *name*: 
    if (/^\[[^\]]+\] /.test(text)) return true;          // ClickUp: [name] 
    // Formats with platform tag (old)
    if (/^\*\*[^*]+\*\* _\(/.test(text)) return true;
    if (/^\*[^*]+\* _\(/.test(text)) return true;
    return false;
}

/**
 * Central message relay engine.
 */
async function handleIncomingMessage({ source, action, sourceId, sourceMessageId, author, text, attachments = [] }) {
    const displayName = await resolveAuthorName(source, author);
    console.log(`[Relay] ${action.toUpperCase()} from ${source} | author: ${displayName} | text: "${(text || '').substring(0, 60)}..."`);

    const configs = await nocodb.findSyncConfigByPlatformId(source, sourceId);
    if (!configs.length) {
        console.log(`[Relay] No sync config found for ${source}:${sourceId}, skipping.`);
        return;
    }

    for (const syncConfig of configs) {
        if (syncConfig.Status !== 'active') continue;

        const targets = getTargets(source, syncConfig);
        const syncedTo = [];

        let fileBuffers = [];
        if (action === 'create' && attachments.length > 0) {
            fileBuffers = await downloadAttachments(attachments, source);
        }

        for (const target of targets) {
            try {
                if (action === 'create') {
                    const formatted = formatForPlatform(target.platform, displayName, text);
                    await forwardCreate(target, formatted, fileBuffers);
                } else if (action === 'update') {
                    const formatted = formatForPlatform(target.platform, displayName, `✏️ ${text}`);
                    await forwardCreate(target, formatted, []);
                } else if (action === 'delete') {
                    const delText = `🗑️ Deleted: ${(text || '').substring(0, 100)}`;
                    const formatted = formatForPlatform(target.platform, displayName, delText);
                    await forwardCreate(target, formatted, []);
                }
                syncedTo.push(target.platform);
                console.log(`[Relay] ✅ ${action} → ${target.platform}`);
            } catch (err) {
                console.error(`[Relay] ❌ ${action} → ${target.platform} failed:`, err.message);
            }
        }

        // Log to NocoDB with source platform info
        await nocodb.logMessage({
            syncConfigTitle: syncConfig.Title,
            source,
            sourceMessageId: sourceMessageId || '',
            author: displayName,
            content: text || `[${action}]`,
            syncedTo: syncedTo.join(', '),
            status: syncedTo.length > 0 ? 'success' : 'failed',
        });
    }
}

function getTargets(source, syncConfig) {
    const targets = [];
    if (source !== 'clickup' && syncConfig.ClickUp_Task_ID) {
        targets.push({ platform: 'clickup', taskId: syncConfig.ClickUp_Task_ID });
    }
    if (source !== 'slack' && syncConfig.Slack_Channel_ID && syncConfig.Slack_Thread_TS) {
        targets.push({ platform: 'slack', channelId: syncConfig.Slack_Channel_ID, threadTs: syncConfig.Slack_Thread_TS });
    }
    if (source !== 'discord' && syncConfig.Discord_Thread_ID) {
        targets.push({ platform: 'discord', threadId: syncConfig.Discord_Thread_ID });
    }
    return targets;
}

async function forwardCreate(target, text, fileBuffers) {
    switch (target.platform) {
        case 'clickup':
            await clickupApi.postComment(target.taskId, text, fileBuffers);
            break;
        case 'slack':
            await slackApi.postMessage(target.channelId, target.threadTs, text, fileBuffers);
            break;
        case 'discord':
            await discordApi.sendMessage(target.threadId, text, fileBuffers);
            break;
    }
}

async function downloadAttachments(attachments, source) {
    const results = [];
    for (const att of attachments) {
        try {
            const headers = {};
            if (source === 'slack') {
                headers.Authorization = `Bearer ${config.SLACK_BOT_TOKEN}`;
            }
            const { buffer } = await downloadFile(att.url, headers);
            results.push({ buffer, filename: att.filename || getFilenameFromUrl(att.url) });
        } catch (err) {
            console.error(`[Relay] Failed to download attachment: ${att.url}`, err.message);
        }
    }
    return results;
}

module.exports = { handleIncomingMessage, isSyncedMessage };
