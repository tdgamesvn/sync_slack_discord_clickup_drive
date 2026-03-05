const express = require('express');
const { getTask } = require('../platforms/clickup-api');
const { handleCommentSync } = require('../handlers/comment-sync');
const { handlePMTracking } = require('../handlers/pm-tracking');
const { handleSlackAutomation } = require('../handlers/slack-automation');

const router = express.Router();

/**
 * POST /webhook/clickup
 * Receives ClickUp webhook events and delegates to handler modules.
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

        // --- 1. Comment Sync (Forward to Slack/Discord) ---
        if (event === 'taskCommentPosted' || event === 'taskCommentUpdated') {
            await handleCommentSync(event, task_id, history_items);
        }

        // --- 2. Task Lifecycle (PM Tracking + Slack Automation) ---
        if (event === 'taskCreated' || event === 'taskUpdated' || event === 'taskDeleted') {
            try {
                let taskDeet = null;
                try {
                    taskDeet = await getTask(task_id);
                } catch (err) {
                    if (event === 'taskDeleted') {
                        console.log(`[ClickUp] Task ${task_id} deleted or inaccessible. Using fallback data.`);
                    } else {
                        throw err;
                    }
                }

                const listId = taskDeet?.list?.id || history_items?.[0]?.parent_id || '';
                const currentStatus = taskDeet?.status?.status || history_items?.[0]?.after?.status?.status || '';

                // 2a. PM Finance Tracking (returns listMapping for reuse)
                const listMapping = await handlePMTracking(task_id, taskDeet, listId, currentStatus);

                // 2b. Slack Auto-Threading
                await handleSlackAutomation(event, task_id, history_items, listMapping, taskDeet);

            } catch (err) {
                console.error('[ClickUp -> Handlers] Error:', err.message);
            }
        }

        res.sendStatus(200);
    } catch (err) {
        console.error('[ClickUp] Webhook error:', err);
        res.sendStatus(500);
    }
});

module.exports = router;
