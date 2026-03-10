const { sendMessage, createThread, archiveThread } = require('../platforms/discord-api');
const { createSyncConfig, findSyncConfigByPlatformId, deleteSyncConfig } = require('../nocodb');

/**
 * Handle Discord auto-threading automation for ClickUp tasks.
 * Mirrors slack-automation.js but for Discord channels.
 * - taskCreated: Create Discord thread + register sync config
 * - taskUpdated: Ping reviewers on CLIENT_REVIEW
 * - taskDeleted: Purge sync config (Discord threads can't be deleted via bot)
 */
async function handleDiscordAutomation(event, task_id, history_items, listMapping, taskDeet) {
    // --- taskDeleted: doesn't need listMapping, just sync config ---
    if (event === 'taskDeleted') {
        console.log(`[Discord Automation] Task ${task_id} deleted. Archiving thread...`);
        const configs = await findSyncConfigByPlatformId('clickup', task_id);
        const discordConfig = configs.find(c => c.Discord_Thread_ID && c.Status && c.Status.toLowerCase() === 'active');

        if (discordConfig) {
            try {
                await archiveThread(discordConfig.Discord_Thread_ID, '🔒 Task deleted on ClickUp. Thread archived.');
                console.log('[Discord Automation] Thread archived and locked.');
            } catch (e) {
                console.error('[Discord Automation] Failed to archive thread:', e.message);
            }
            await deleteSyncConfig(discordConfig.Id);
            console.log('[Discord Automation] Sync config removed.');
        }
        return;
    }

    if (!listMapping) return;

    // Skip if mapping is paused
    if (listMapping.Enabled === 'Paused') {
        console.log(`[Discord Automation] Skipping task ${task_id} — mapping is paused.`);
        return;
    }

    const discordChannelId = listMapping.Discord_Channel_ID;
    const discordReviewUsers = listMapping.Discord_Review_User_IDs;
    const customerId = typeof listMapping.Customer_Id === 'object' && listMapping.Customer_Id !== null
        ? listMapping.Customer_Id.Id : listMapping.Customer_Id;
    const projectId = typeof listMapping.Project_Id === 'object' && listMapping.Project_Id !== null
        ? listMapping.Project_Id.Id : listMapping.Project_Id;

    if (!discordChannelId) return; // No Discord channel configured

    const taskName = taskDeet?.name || history_items?.[0]?.after?.name || 'Unknown Task';
    const taskUrl = taskDeet?.url || '#';
    const currentStatus = taskDeet?.status?.status || history_items?.[0]?.after?.status?.status || '';

    // --- taskCreated: Create Discord thread ---
    if (event === 'taskCreated') {
        try {
            console.log(`[Discord Automation] Creating thread for task ${task_id} in channel ${discordChannelId}`);
            const result = await createThread(
                discordChannelId,
                `[${currentStatus.toUpperCase()}] ${taskName}`,
                `**[${currentStatus.toUpperCase()}]** [${taskName}](${taskUrl})`
            );

            await createSyncConfig({
                Title: `Auto-Sync: ${taskName}`,
                ClickUp_Task_ID: task_id,
                Discord_Thread_ID: result.threadId,
                Sync_ClickUp_To_Discord: true,
                Sync_Discord_To_ClickUp: true,
                Status: 'active',
                Customer_Id: customerId,
                Project_Id: projectId,
            });
            console.log(`[Discord Automation] Registered sync config for task ${task_id} (thread: ${result.threadId})`);
        } catch (err) {
            console.error('[Discord Automation] Failed to create thread:', err.message);
        }
    }

    // --- taskUpdated: Tag reviewers when status = CLIENT_REVIEW ---
    if (event === 'taskUpdated') {
        const historyItem = history_items?.[0];
        const fieldChanged = historyItem?.field === 'status';

        const isReviewStatus = currentStatus.toUpperCase() === 'CLIENT_REVIEW' || currentStatus.toLowerCase() === 'client review';
        if (isReviewStatus && fieldChanged && discordReviewUsers) {
            const configs = await findSyncConfigByPlatformId('clickup', task_id);
            const discordConfig = configs.find(c => c.Discord_Thread_ID);

            if (discordConfig) {
                try {
                    console.log(`[Discord Automation] Task ${task_id} moved to Review. Pinging users...`);
                    await sendMessage(
                        discordConfig.Discord_Thread_ID,
                        `🔔 **[${taskName}](${taskUrl})**\n${discordReviewUsers}`
                    );
                } catch (err) {
                    console.error('[Discord Automation] Failed to ping reviewers:', err.message);
                }
            }
        }
    }
}

module.exports = { handleDiscordAutomation };
