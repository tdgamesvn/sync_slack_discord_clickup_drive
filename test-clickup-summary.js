const axios = require('axios');
const fs = require('fs');
require('dotenv').config({ path: 'e:/TDC_App/TDGAMES_App/Sync_Slack_Discord_ClickUp_Drive/.env' });

const CLICKUP_API_TOKEN = process.env.CLICKUP_API_TOKEN;

const api = axios.create({
    baseURL: 'https://api.clickup.com/api/v2',
    headers: { Authorization: CLICKUP_API_TOKEN },
});

async function run() {
    try {
        console.log("Fetching ClickUp structure...\n");
        const teamsRes = await api.get('/team');
        const teams = teamsRes.data.teams;

        for (const team of teams) {
            console.log(`Workspace: ${team.name} (ID: ${team.id})`);

            const spacesRes = await api.get(`/team/${team.id}/space`);
            const spaces = spacesRes.data.spaces;

            for (const space of spaces) {
                console.log(`  └─ Space: ${space.name} (ID: ${space.id})`);

                const foldersRes = await api.get(`/space/${space.id}/folder`);
                const folders = foldersRes.data.folders;

                for (const folder of folders) {
                    console.log(`      └─ Folder: ${folder.name} (ID: ${folder.id})`);

                    const listsRes = await api.get(`/folder/${folder.id}/list`);
                    const lists = listsRes.data.lists;

                    for (const list of lists) {
                        console.log(`          └─ List: ${list.name} (ID: ${list.id})`);
                        // Optionally fetch a few tasks
                        const tasksRes = await api.get(`/list/${list.id}/task?archived=false&page=0&subtasks=false`);
                        const tasks = tasksRes.data.tasks;
                        console.log(`              └─ Tasks: ${tasks.length} (fetching max 100 per page)`);
                        for (let i = 0; i < Math.min(tasks.length, 3); i++) {
                            console.log(`                  - [${tasks[i].status.status}] ${tasks[i].name}`);
                        }
                    }
                }

                // lists without folders
                const folderlessListsRes = await api.get(`/space/${space.id}/list`);
                const folderlessLists = folderlessListsRes.data.lists;
                if (folderlessLists && folderlessLists.length > 0) {
                    for (const list of folderlessLists) {
                        console.log(`      └─ (Folderless) List: ${list.name} (ID: ${list.id})`);
                        const tasksRes = await api.get(`/list/${list.id}/task?archived=false&page=0&subtasks=false`);
                        const tasks = tasksRes.data.tasks;
                        console.log(`          └─ Tasks: ${tasks.length} (fetching max 100 per page)`);
                        for (let i = 0; i < Math.min(tasks.length, 3); i++) {
                            console.log(`              - [${tasks[i].status.status}] ${tasks[i].name}`);
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.error("Error:", err.response ? err.response.data : err.message);
    }
}

run();
