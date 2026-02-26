const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const { handleIncomingMessage, isSyncedMessage } = require('../relay');
const nocodb = require('../nocodb');

const router = express.Router();

/**
 * Verify Slack request signature.
 */
function verifySlackSignature(req) {
    const timestamp = req.headers['x-slack-request-timestamp'];
    const sig = req.headers['x-slack-signature'];
    if (!timestamp || !sig) return false;

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp)) > 300) return false;

    const sigBasestring = `v0:${timestamp}:${req.rawBody}`;
    const hmac = crypto.createHmac('sha256', config.SLACK_SIGNING_SECRET);
    hmac.update(sigBasestring);
    const expectedSig = `v0=${hmac.digest('hex')}`;

    try {
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
    } catch {
        return false;
    }
}

/**
 * Raw body parsing middleware for Slack.
 */
function rawBodyParser(req, res, next) {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
        req.rawBody = Buffer.concat(chunks).toString('utf8');
        try {
            req.body = JSON.parse(req.rawBody);
        } catch {
            req.body = {};
        }
        next();
    });
}

/**
 * POST /webhook/slack
 */
router.post('/', rawBodyParser, async (req, res) => {
    try {
        const { type, event, challenge } = req.body;

        // URL verification challenge
        if (type === 'url_verification') {
            console.log('[Slack] URL verification challenge received');
            return res.json({ challenge });
        }

        if (type !== 'event_callback' || !event) {
            return res.sendStatus(200);
        }

        console.log(`[Slack] Event: ${event.type} | subtype: ${event.subtype || 'none'} | user: ${event.user || 'N/A'} | bot_id: ${event.bot_id || 'N/A'} | thread_ts: ${event.thread_ts || 'none'} | channel: ${event.channel}`);

        // Skip events we don't care about
        const ignoredTypes = ['file_created', 'file_shared', 'file_change', 'file_public', 'reaction_added', 'reaction_removed'];
        if (ignoredTypes.includes(event.type)) {
            return res.sendStatus(200);
        }

        // Only process message events
        if (event.type !== 'message') {
            return res.sendStatus(200);
        }

        // Skip bot messages (loop prevention) - check bot_id first, then user ID
        if (event.bot_id) {
            console.log('[Slack] Skipping bot message (has bot_id)');
            return res.sendStatus(200);
        }
        if (event.user === config.SLACK_BOT_USER_ID) {
            console.log('[Slack] Skipping own bot message');
            return res.sendStatus(200);
        }

        // Only process thread messages (must have thread_ts)
        if (!event.thread_ts) {
            console.log('[Slack] Skipping non-thread message');
            return res.sendStatus(200);
        }

        // Skip synced messages (loop prevention)
        const msgText = event.text || event.message?.text || '';
        if (isSyncedMessage(msgText)) {
            console.log('[Slack] Skipping synced message (loop prevention)');
            return res.sendStatus(200);
        }

        // Handle message subtypes
        if (!event.subtype || event.subtype === 'file_share') {
            // New message or message with file
            const attachments = [];
            if (event.files && event.files.length > 0) {
                for (const f of event.files) {
                    attachments.push({
                        url: f.url_private,
                        filename: f.name || 'file',
                    });
                }
            }

            console.log(`[Slack] Processing CREATE from user ${event.user}: "${msgText.substring(0, 50)}" with ${attachments.length} files`);

            await handleIncomingMessage({
                source: 'slack',
                action: 'create',
                sourceId: event.thread_ts,
                sourceMessageId: event.ts,
                author: event.user || 'Unknown',
                text: msgText,
                attachments,
            });
        } else if (event.subtype === 'message_changed') {
            const msg = event.message;
            if (isSyncedMessage(msg?.text)) return res.sendStatus(200);
            if (msg?.bot_id) return res.sendStatus(200);

            await handleIncomingMessage({
                source: 'slack',
                action: 'update',
                sourceId: event.thread_ts || msg?.thread_ts,
                sourceMessageId: msg?.ts,
                author: msg?.user || 'Unknown',
                text: msg?.text || '',
            });
        } else if (event.subtype === 'message_deleted') {
            const msg = event.previous_message;
            if (msg?.bot_id) return res.sendStatus(200);

            await handleIncomingMessage({
                source: 'slack',
                action: 'delete',
                sourceId: event.thread_ts || msg?.thread_ts,
                sourceMessageId: msg?.ts || '',
                author: msg?.user || 'Unknown',
                text: msg?.text || '',
            });
        }

        res.sendStatus(200);
    } catch (err) {
        console.error('[Slack] Event error:', err);
        res.sendStatus(200);
    }
});

module.exports = router;
