const config = require('../config');
const { getListMappings, findSyncConfigByPlatformId } = require('../nocodb');
const { postMessage } = require('../platforms/slack-api');
const nocodb = require('../nocodb');
const axios = require('axios');

/**
 * Get/set reminder timestamps via NocoDB Settings table.
 * Title format: "reminder_{taskId}" → Value = ISO timestamp of last reminder.
 */
async function getLastReminded(taskId) {
    try {
        const settings = await nocodb.getSettings(`(Title,eq,reminder_${taskId})`);
        if (settings && settings.length > 0) {
            return new Date(settings[0].Value).getTime();
        }
    } catch {
        // ignore
    }
    return 0;
}

async function setLastReminded(taskId) {
    try {
        await nocodb.upsertSetting(`reminder_${taskId}`, new Date().toISOString());
    } catch (err) {
        console.error(`[Reminders] Failed to save reminder timestamp for ${taskId}:`, err.message);
    }
}

async function checkReviewReminders() {
    console.log('[Cron] Checking for 24h CLIENT_REVIEW reminders...');
    try {
        const mappings = await getListMappings();
        const now = Date.now();
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

        for (const mapping of mappings) {
            const listId = mapping.ClickUp_List_ID;
            if (!listId) continue;

            try {
                // Fetch all tasks in the list (including subtasks)
                const res = await axios.get(`https://api.clickup.com/api/v2/list/${listId}/task?subtasks=true`, {
                    headers: { Authorization: config.CLICKUP_API_TOKEN }
                });

                const tasks = res.data.tasks || [];
                for (const task of tasks) {
                    const status = task.status?.status || '';
                    const isReviewStatus = status.toUpperCase() === 'CLIENT_REVIEW' || status.toLowerCase() === 'client review';

                    if (isReviewStatus) {
                        const timeSinceUpdate = now - parseInt(task.date_updated, 10);

                        if (timeSinceUpdate > TWENTY_FOUR_HOURS) {
                            // Check if we already reminded them in the last 24h
                            const lastReminded = await getLastReminded(task.id);
                            if (now - lastReminded > TWENTY_FOUR_HOURS) {

                                // 1. Find the slack channel and thread
                                const configs = await findSyncConfigByPlatformId('clickup', task.id);
                                const slackConfig = configs.find(c => c.Slack_Thread_TS && c.Status && c.Status.toLowerCase() === 'active');

                                if (slackConfig) {
                                    // 2. Extract USERS TO TAG (REVIEW) from NocoDB mapping
                                    let finalTagString = mapping.Slack_Review_User_IDs || '';

                                    if (finalTagString) {
                                        console.log(`[Reminder] Sending 24h reminder for task ${task.id} to Slack thread ${slackConfig.Slack_Thread_TS}`);
                                        await postMessage(
                                            slackConfig.Slack_Channel_ID,
                                            slackConfig.Slack_Thread_TS,
                                            `${finalTagString}`
                                        );

                                        // Mark as reminded (persisted to NocoDB)
                                        await setLastReminded(task.id);
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (listErr) {
                console.error(`[Reminders] Failed to fetch tasks for list ${listId}:`, listErr.message);
            }
        }

    } catch (err) {
        console.error('[Cron] Error checking review reminders:', err.message);
    }
}

module.exports = { checkReviewReminders };
