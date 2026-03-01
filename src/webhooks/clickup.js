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

        // PM Finance Tracking & Slack Automation
        if (event === 'taskCreated' || event === 'taskUpdated' || event === 'taskDeleted') {
            try {
                const { getTask } = require('../platforms/clickup-api');
                const { postMessage, deleteMessage } = require('../platforms/slack-api');
                const { upsertPMTaskTracking, findListMapping, createSyncConfig, findSyncConfigByPlatformId, deleteSyncConfig } = require('../nocodb');

                const taskDeet = await getTask(task_id);
                const listId = taskDeet?.list?.id;
                const taskName = taskDeet?.name || 'Unknown Task';
                const taskUrl = taskDeet?.url || '#';
                const currentStatus = taskDeet?.status?.status || '';

                // --- 1. PM Finance Tracking (Art/Animation Lists) ---
                if (listId === '901815849460' || listId === '901816296143') {
                    const jobType = listId === '901815849460' ? 'Art' : 'Animation';

                    const taskData = {
                        Task_ID: task_id,
                        Task_Name: taskName,
                        Status: currentStatus,
                        Job_Type: jobType,
                        Assignee: taskDeet.assignees?.map(a => a.username).join(', ') || '',
                        Task_URL: taskUrl
                    };

                    await upsertPMTaskTracking(taskData);
                    console.log(`[ClickUp -> NocoDB] Synced Task Tracking for ${task_id}`);
                }

                // --- 2. Slack Auto-Threading Automation ---
                const listMapping = await findListMapping(listId);
                if (listMapping) {
                    const slackChannelId = listMapping.Slack_Channel_ID;
                    const slackReviewUsers = listMapping.Slack_Review_User_IDs;
                    const customerId = listMapping.Customer_Id;
                    const projectId = listMapping.Project_Id;

                    if (event === 'taskCreated' && slackChannelId) {
                        console.log(`[Slack Automation] Starting new thread for task ${task_id} in channel ${slackChannelId}`);
                        // 1. Send the parent message to Slack channel
                        const slackMsg = await postMessage(slackChannelId, null, `🆕 *New Task Created:*\n<${taskUrl}|${taskName}>`);

                        // 2. Register Two-Way Sync into NocoDB
                        await createSyncConfig({
                            Title: `Auto-Sync: ${taskName}`,
                            ClickUp_Task_ID: task_id,
                            Slack_Channel_ID: slackChannelId,
                            Slack_Thread_TS: slackMsg.ts,
                            Sync_ClickUp_To_Slack: true,
                            Sync_Slack_To_ClickUp: true,
                            Status: 'active',
                            Customer_Id: customerId,
                            Project_Id: projectId
                        });
                        console.log(`[Slack Automation] Registered sync config for task ${task_id}`);
                    }

                    if (event === 'taskUpdated') {
                        // Check if status changed to CLIENT_REVIEW
                        const isReviewStatus = currentStatus.toUpperCase() === 'CLIENT_REVIEW' || currentStatus.toLowerCase() === 'client review';

                        // We need the history payload to see if status ACTUALLY changed this exact webhook invocation, to prevent spam.
                        const historyItem = history_items?.[0];
                        const fieldChanged = historyItem?.field === 'status';

                        if (isReviewStatus && fieldChanged && slackReviewUsers) {
                            console.log(`[Slack Automation] Task ${task_id} moved to Review. Tagging users...`);
                            // Find the Slack thread to post into
                            const configs = await findSyncConfigByPlatformId('clickup', task_id);
                            const slackConfig = configs.find(c => c.Slack_Thread_TS);

                            if (slackConfig) {
                                await postMessage(
                                    slackConfig.Slack_Channel_ID,
                                    slackConfig.Slack_Thread_TS,
                                    `🔔 *Please review this task:* <${taskUrl}|${taskName}>\n${slackReviewUsers}`
                                );
                            }
                        }
                    }

                    if (event === 'taskDeleted') {
                        console.log(`[Slack Automation] Task ${task_id} deleted. Removing Slack thread...`);
                        const configs = await findSyncConfigByPlatformId('clickup', task_id);
                        const slackConfig = configs.find(c => c.Slack_Thread_TS && c.Status === 'active');

                        if (slackConfig) {
                            try {
                                // Delete the parent message on Slack (deletes the whole thread)
                                await deleteMessage(slackConfig.Slack_Channel_ID, slackConfig.Slack_Thread_TS);
                                console.log('[Slack Automation] Slack thread deleted.');
                            } catch (e) {
                                console.error('[Slack Automation] Failed to delete Slack thread:', e.message);
                            }
                            // Purge sync config
                            await deleteSyncConfig(slackConfig.Id);
                            console.log('[Slack Automation] Sync config removed.');
                        }
                    }
                }

            } catch (err) {
                console.error('[ClickUp -> Slack Automation / Tracking] Error:', err.message);
            }
        }

        res.sendStatus(200);
    } catch (err) {
        console.error('[ClickUp] Webhook error:', err);
        res.sendStatus(500);
    }
});

module.exports = router;
