const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../config');
const { getListMappings, findSyncConfigByPlatformId } = require('../nocodb');
const { postMessage } = require('../platforms/slack-api');

const REMINDERS_FILE = path.join(__dirname, '../../.data_reminders.json');

function loadReminders() {
    try {
        if (fs.existsSync(REMINDERS_FILE)) {
            return JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8'));
        }
    } catch (err) {
        console.error('[Reminders] Error loading reminders data:', err.message);
    }
    return {};
}

function saveReminders(data) {
    try {
        fs.writeFileSync(REMINDERS_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('[Reminders] Error saving reminders data:', err.message);
    }
}

async function checkReviewReminders() {
    console.log('[Cron] Checking for 24h CLIENT_REVIEW reminders...');
    try {
        const mappings = await getListMappings();
        const reminders = loadReminders();
        const now = Date.now();
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
        let didRemind = false;

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
                            const lastReminded = reminders[task.id] || 0;
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

                                        // Mark as reminded
                                        reminders[task.id] = now;
                                        didRemind = true;
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

        if (didRemind) {
            saveReminders(reminders);
        }

    } catch (err) {
        console.error('[Cron] Error checking review reminders:', err.message);
    }
}

module.exports = { checkReviewReminders };
