const axios = require('axios');
const fs = require('fs');
require('dotenv').config({ path: 'e:/TDC_App/TDGAMES_App/Sync_Slack_Discord_ClickUp_Drive/.env' });

const CLICKUP_API_TOKEN = process.env.CLICKUP_API_TOKEN;

const api = axios.create({
    baseURL: 'https://api.clickup.com/api/v2',
    headers: { Authorization: CLICKUP_API_TOKEN },
});

async function checkFolder() {
    const spaceId = '90189735762';
    const folderId = '901812123617';
    let output = '';

    try {
        output += `Checking Folder ID: ${folderId} (Space ID: ${spaceId})...\n\n`;

        // Get Folder Details
        const folderRes = await api.get(`/folder/${folderId}`);
        const folder = folderRes.data;
        output += `Folder Name: ${folder.name}\n`;

        // Get Lists in Folder
        const listsRes = await api.get(`/folder/${folderId}/list`);
        const lists = listsRes.data.lists;

        output += `\nFound ${lists.length} List(s) in this Folder:\n`;

        for (const list of lists) {
            output += `  └─ List: ${list.name} (ID: ${list.id})\n`;

            // Get Tasks in List
            const tasksRes = await api.get(`/list/${list.id}/task?archived=false&page=0&subtasks=true`);
            const tasks = tasksRes.data.tasks;

            output += `      └─ Tasks: ${tasks.length} (fetching max 100 per page, including subtasks)\n`;
            for (let i = 0; i < tasks.length; i++) {
                const task = tasks[i];
                output += `          - [${task.status.status}] ${task.name} (ID: ${task.id})\n`;
                if (task.parent) {
                    output += `            └── Subtask of: ${task.parent}\n`;
                }
            }
        }
        fs.writeFileSync('e:/TDC_App/TDGAMES_App/Sync_Slack_Discord_ClickUp_Drive/folder-output.txt', output, 'utf8');
        console.log("Done. Output written to folder-output.txt");
    } catch (err) {
        console.error("Error:", err.response ? err.response.data : err.message);
    }
}

checkFolder();
