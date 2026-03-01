require('dotenv').config();
const axios = require('axios');
const { upsertPMTaskTracking } = require('./src/nocodb');
const config = require('./src/config');

const CLICKUP_API_TOKEN = config.CLICKUP_API_TOKEN;

const api = axios.create({
    baseURL: 'https://api.clickup.com/api/v2',
    headers: { Authorization: CLICKUP_API_TOKEN },
});

const LIST_IDS = {
    '901815849460': 'Art',
    '901816296143': 'Animation'
};

async function syncListTasks(listId, jobType) {
    console.log(`\nFetching tasks for List: ${jobType} (${listId})...`);
    try {
        let page = 0;
        let allTasks = [];
        let hasMore = true;

        // Fetch all active tasks (not archived)
        while (hasMore) {
            const res = await api.get(`/list/${listId}/task`, {
                params: {
                    page: page,
                    include_closed: true // true if we want completed tasks too
                }
            });

            const tasks = res.data.tasks || [];
            allTasks = allTasks.concat(tasks);

            if (tasks.length < 100) {
                hasMore = false;
            } else {
                page++;
            }
        }

        console.log(`Found ${allTasks.length} tasks in ${jobType}. Syncing to NocoDB...`);

        for (const task of allTasks) {
            try {
                const taskData = {
                    Task_ID: task.id,
                    Task_Name: task.name,
                    Status: task.status?.status || '',
                    Job_Type: jobType,
                    Assignee: task.assignees?.map(a => a.username).join(', ') || '',
                    Task_URL: task.url
                };

                await upsertPMTaskTracking(taskData);
                console.log(` - Upserted Task: ${task.name} (${task.id})`);
            } catch (upsertErr) {
                console.error(`   ❌ Failed to upsert ${task.id}:`, upsertErr.message);
            }
        }

    } catch (err) {
        console.error(`Error fetching tasks for list ${listId}:`, err.response?.data || err.message);
    }
}

async function runImport() {
    console.log("Starting Bulk Import from ClickUp to NocoDB PM Tracking...");
    for (const [listId, jobType] of Object.entries(LIST_IDS)) {
        await syncListTasks(listId, jobType);
    }
    console.log("\n✅ Bulk import completed!");
}

runImport();
