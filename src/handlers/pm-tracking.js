const { upsertPMTaskTracking, findListMapping } = require('../nocodb');

/**
 * Handle PM Finance Tracking for tasks in Art/Animation lists.
 * Uses ListMappings.Job_Type from NocoDB (no hardcoded list IDs).
 */
async function handlePMTracking(task_id, taskDeet, listId, currentStatus) {
    const listMapping = await findListMapping(listId);
    const jobType = listMapping?.Job_Type; // 'Art' or 'Animation' from NocoDB

    if (!jobType) return listMapping; // Return listMapping for reuse by other handlers

    const taskData = {
        Task_ID: task_id,
        Task_Name: taskDeet?.name || 'Unknown Task',
        Status: currentStatus,
        Job_Type: jobType,
        Assignee: taskDeet?.assignees?.map(a => a.username).join(', ') || '',
        Task_URL: taskDeet?.url || '#',
    };

    await upsertPMTaskTracking(taskData);
    console.log(`[ClickUp -> NocoDB] Synced Task Tracking for ${task_id}`);

    return listMapping; // Return for reuse
}

module.exports = { handlePMTracking };
