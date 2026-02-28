const crypto = require('crypto');
const express = require('express');
const axios = require('axios');
const config = require('../config');
const { handleIncomingMessage, isSyncedMessage } = require('../relay');

const router = express.Router();

/**
 * POST /webhook/clickup
 * Receives ClickUp webhook events for task comments.
 */
router.post('/', express.json(), async (req, res) => {
    try {
        const { event, task_id, history_items } = req.body;

        // ClickUp sends a webhook verification request
        if (req.body.webhook_id && !event) {
            console.log('[ClickUp] Webhook verification received');
            return res.status(200).json({});
        }

        console.log(`[ClickUp] Event: ${event} | Task: ${task_id}`);

        if (event === 'taskCommentPosted') {
            const item = history_items?.[0];
            if (!item) return res.sendStatus(200);

            const author = item.user?.username || item.user?.email || 'Unknown';
            const commentText = item.comment?.text_content || item.comment?.comment_text || '';
            const commentId = item.comment?.id || '';

            // Extract attachments from comment parts
            const attachments = [];
            if (item.comment?.comment && Array.isArray(item.comment.comment)) {
                for (const part of item.comment.comment) {
                    // Type "image"
                    if (part.type === 'image' && part.image) {
                        const img = part.image;
                        const url = img.url_w_host || img.url || img.thumbnail_large || img.thumbnail_small;
                        if (url) {
                            attachments.push({
                                url,
                                filename: decodeURIComponent(img.name || img.title || part.text || 'image.png'),
                            });
                        }
                    }
                    // Type "attachment"
                    if (part.type === 'attachment' && part.attachment) {
                        const att = part.attachment;
                        const url = att.url_w_host || att.url;
                        if (url) {
                            attachments.push({
                                url,
                                filename: att.title || att.name || 'file',
                            });
                        }
                    }
                    // Nested in attributes
                    if (part.attributes?.attachment) {
                        const att = part.attributes.attachment;
                        const url = att.url_w_host || att.url;
                        if (url) {
                            attachments.push({
                                url,
                                filename: att.title || att.name || 'file',
                            });
                        }
                    }
                }
            }

            console.log(`[ClickUp] Found ${attachments.length} attachments`);
            if (attachments.length > 0) {
                console.log(`[ClickUp] Attachment URLs:`, attachments.map(a => a.filename).join(', '));
            }

            // Determine if this is an attachment bounce from our bot
            let isAttachmentBounce = false;
            if (attachments.length > 0) {
                const allSynced = attachments.every(a => a.filename.startsWith('[SYNC] '));
                if (allSynced) {
                    let textWithoutFilenames = commentText;
                    for (const att of attachments) {
                        textWithoutFilenames = textWithoutFilenames.replace(att.filename, '').trim();
                    }
                    if (!textWithoutFilenames) {
                        isAttachmentBounce = true;
                    }
                }
            }

            // Skip if the comment was posted by our sync (check prefix or check bounce)
            const isSynced = isSyncedMessage(commentText) || isAttachmentBounce;
            if (isSynced) {
                console.log('[ClickUp] Skipping synced message or attachment bounce (loop prevention)');
                return res.sendStatus(200);
            }

            // Filter out text that is just the filename
            let cleanText = commentText;
            for (const att of attachments) {
                cleanText = cleanText.replace(att.filename, '').trim();
            }

            handleIncomingMessage({
                source: 'clickup',
                action: 'create',
                sourceId: task_id,
                sourceMessageId: commentId,
                author,
                text: cleanText || commentText,
                attachments,
            }).catch(err => console.error('[ClickUp] Relay error in create:', err));
        }

        if (event === 'taskCommentUpdated') {
            const item = history_items?.[0];
            if (!item) return res.sendStatus(200);

            const author = item.user?.username || item.user?.email || 'Unknown';
            const commentText = item.comment?.text_content || '';
            const commentId = item.comment?.id || '';

            if (isSyncedMessage(commentText) || commentText.startsWith('✏️')) {
                return res.sendStatus(200);
            }

            handleIncomingMessage({
                source: 'clickup',
                action: 'update',
                sourceId: task_id,
                sourceMessageId: commentId,
                author,
                text: commentText,
            }).catch(err => console.error('[ClickUp] Relay error in update:', err));
        }

        res.sendStatus(200);
    } catch (err) {
        console.error('[ClickUp] Webhook error:', err);
        res.sendStatus(500);
    }
});

module.exports = router;
