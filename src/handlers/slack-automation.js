const { postMessage, updateMessage, deleteMessage } = require('../platforms/slack-api');
const { createSyncConfig, findSyncConfigByPlatformId, deleteSyncConfig } = require('../nocodb');

/**
 * Handle Slack auto-threading automation for ClickUp tasks.
 * - taskCreated: Create Slack thread + register sync config
 * - taskUpdated: Update parent message status, tag reviewers
 * - taskDeleted: Delete Slack thread + purge sync config
 */
async function handleSlackAutomation(event, task_id, history_items, listMapping, taskDeet) {
    // --- taskDeleted: doesn't need listMapping, just sync config ---
    if (event === 'taskDeleted') {
        console.log(`[Slack Automation] Task ${task_id} deleted. Removing Slack thread...`);
        const configs = await findSyncConfigByPlatformId('clickup', task_id);
        const slackConfig = configs.find(c => c.Slack_Thread_TS && c.Status && c.Status.toLowerCase() === 'active');

        if (slackConfig) {
            try {
                await deleteMessage(slackConfig.Slack_Channel_ID, slackConfig.Slack_Thread_TS);
                console.log('[Slack Automation] Slack thread deleted.');
            } catch (e) {
                console.error('[Slack Automation] Failed to delete Slack thread:', e.message);
            }
            await deleteSyncConfig(slackConfig.Id);
            console.log('[Slack Automation] Sync config removed.');
        }
        return;
    }

    if (!listMapping) return;

    // Skip if mapping is paused
    if (listMapping.Enabled === 'Paused') {
        console.log(`[Slack Automation] Skipping task ${task_id} — mapping is paused.`);
        return;
    }

    const slackChannelId = listMapping.Slack_Channel_ID;
    const slackReviewUsers = listMapping.Slack_Review_User_IDs;
    const customerId = typeof listMapping.Customer_Id === 'object' && listMapping.Customer_Id !== null
        ? listMapping.Customer_Id.Id : listMapping.Customer_Id;
    const projectId = typeof listMapping.Project_Id === 'object' && listMapping.Project_Id !== null
        ? listMapping.Project_Id.Id : listMapping.Project_Id;

    const taskName = taskDeet?.name || history_items?.[0]?.after?.name || 'Unknown Task';
    const taskUrl = taskDeet?.url || '#';
    const currentStatus = taskDeet?.status?.status || history_items?.[0]?.after?.status?.status || '';

    // --- taskCreated: Create Slack thread ---
    if (event === 'taskCreated' && slackChannelId) {
        console.log(`[Slack Automation] Starting new thread for task ${task_id} in channel ${slackChannelId}`);
        const slackMsg = await postMessage(slackChannelId, null, `*[${currentStatus.toUpperCase()}]* <${taskUrl}|${taskName}>`);

        await createSyncConfig({
            Title: `Auto-Sync: ${taskName}`,
            ClickUp_Task_ID: task_id,
            Slack_Channel_ID: slackChannelId,
            Slack_Thread_TS: slackMsg.ts,
            Sync_ClickUp_To_Slack: true,
            Sync_Slack_To_ClickUp: true,
            Status: 'active',
            Customer_Id: customerId,
            Project_Id: projectId,
        });
        console.log(`[Slack Automation] Registered sync config for task ${task_id}`);
    }

    // --- taskUpdated: Update status + tag reviewers ---
    if (event === 'taskUpdated') {
        const historyItem = history_items?.[0];
        const fieldChanged = historyItem?.field === 'status';

        const configs = await findSyncConfigByPlatformId('clickup', task_id);
        const slackConfig = configs.find(c => c.Slack_Thread_TS);

        // Update parent message with new status
        if (fieldChanged && slackConfig) {
            try {
                await updateMessage(
                    slackConfig.Slack_Channel_ID,
                    slackConfig.Slack_Thread_TS,
                    `*[${currentStatus.toUpperCase()}]* <${taskUrl}|${taskName}>`
                );
                console.log(`[Slack Automation] Updated parent message status to ${currentStatus.toUpperCase()}`);
            } catch (err) {
                console.error('[Slack Automation] Failed to update parent message:', err.message);
            }
        }

        // Tag reviewers when status = CLIENT_REVIEW
        const isReviewStatus = currentStatus.toUpperCase() === 'CLIENT_REVIEW' || currentStatus.toLowerCase() === 'client review';
        if (isReviewStatus && fieldChanged && slackReviewUsers && slackConfig) {
            console.log(`[Slack Automation] Task ${task_id} moved to Review. Tagging users...`);
            await postMessage(
                slackConfig.Slack_Channel_ID,
                slackConfig.Slack_Thread_TS,
                `🔔 <${taskUrl}|${taskName}>\n${slackReviewUsers}`
            );
        }
    }
}

module.exports = { handleSlackAutomation };
