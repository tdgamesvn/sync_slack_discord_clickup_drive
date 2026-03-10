const { upsertPMTaskTracking, findListMapping, findPMTrackingConfig } = require('../nocodb');

/**
 * Handle PM Finance Tracking for tasks.
 * Uses independent PM_Tracking_Configs table (supports Space/Folder/List matching).
 * Falls back to ListMappings.Job_Type for backward compatibility.
 */
async function handlePMTracking(task_id, taskDeet, listId, currentStatus) {
    const listMapping = await findListMapping(listId);

    // 1. Try independent PM Tracking Config (Space → Folder → List matching)
    let pmConfig = null;
    if (taskDeet) {
        pmConfig = await findPMTrackingConfig(taskDeet);
    }

    const jobType = pmConfig?.Job_Type || listMapping?.Job_Type;

    if (!jobType) return listMapping; // No PM tracking configured

    // Check if the relevant config is paused
    if (pmConfig && pmConfig.Enabled === 'Paused') {
        console.log(`[PM Tracking] Skipping task ${task_id} — PM config "${pmConfig.Title}" is paused.`);
        return listMapping;
    }
    if (!pmConfig && listMapping?.Enabled === 'Paused') {
        console.log(`[PM Tracking] Skipping task ${task_id} — list mapping is paused.`);
        return listMapping;
    }

    const taskData = {
        Task_ID: task_id,
        Task_Name: taskDeet?.name || 'Unknown Task',
        Status: currentStatus,
        Job_Type: jobType,
        Assignee: taskDeet?.assignees?.map(a => a.username).join(', ') || '',
        Task_URL: taskDeet?.url || '#',
        PM_Config_Title: pmConfig?.Title || '',
        Due_Date: taskDeet?.due_date ? new Date(parseInt(taskDeet.due_date)).toISOString().split('T')[0] : '',
        Closed_Date: taskDeet?.date_closed ? new Date(parseInt(taskDeet.date_closed)).toISOString().split('T')[0] : '',
    };

    await upsertPMTaskTracking(taskData);
    console.log(`[ClickUp -> NocoDB] Synced Task Tracking for ${task_id} (${pmConfig ? 'PM Config: ' + pmConfig.Title : 'ListMapping'})`);

    return listMapping; // Return for reuse by Slack/Discord handlers
}

module.exports = { handlePMTracking };
