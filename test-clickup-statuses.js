const axios = require('axios');
const fs = require('fs');
require('dotenv').config({ path: 'e:/TDC_App/TDGAMES_App/Sync_Slack_Discord_ClickUp_Drive/.env' });

const CLICKUP_API_TOKEN = process.env.CLICKUP_API_TOKEN;

const api = axios.create({
    baseURL: 'https://api.clickup.com/api/v2',
    headers: { Authorization: CLICKUP_API_TOKEN },
});

async function checkLists() {
    const listIds = ['901815849460', '901816296143'];
    let output = '';

    try {
        for (const listId of listIds) {
            output += `\n--- Checking List ID: ${listId} ---\n`;
            const listRes = await api.get(`/list/${listId}`);
            const list = listRes.data;

            output += `List Name: ${list.name}\n`;
            output += `Statuses:\n`;

            if (list.statuses && list.statuses.length > 0) {
                list.statuses.forEach(status => {
                    output += `  - ${status.status} (Color: ${status.color}, Type: ${status.type})\n`;
                });
            } else {
                output += `  No specific statuses found (might be inheriting from Folder/Space).\n`;
            }
        }

        fs.writeFileSync('e:/TDC_App/TDGAMES_App/Sync_Slack_Discord_ClickUp_Drive/list-statuses.txt', output, 'utf8');
        console.log("Done. Output written to list-statuses.txt");
    } catch (err) {
        console.error("Error:", err.response ? err.response.data : err.message);
    }
}

checkLists();
