require('dotenv').config();
const axios = require('axios');
const config = require('./src/config');

const api = axios.create({
    baseURL: `${config.NOCODB_URL}/api/v1`, // use v1 for schema APIs usually
    headers: { 'xc-token': config.NOCODB_API_TOKEN },
});

async function main() {
    try {
        console.log("Fetching tables...");
        const tablesRes = await api.get(`/db/meta/projects/${config.NOCODB_BASE_ID}/tables`);
        const existingTable = tablesRes.data.list.find(t => t.title === 'ListMappings');
        if (existingTable) {
            console.log("ListMappings table already exists. Exting.");
            return;
        }

        console.log("Creating ListMappings table...");
        const createRes = await api.post(`/db/meta/projects/${config.NOCODB_BASE_ID}/tables`, {
            title: "ListMappings",
            table_name: "ListMappings",
            columns: [
                { title: "List_ID", uidt: "SingleLineText" },
                { title: "Slack_Channel_ID", uidt: "SingleLineText" },
                { title: "Slack_Review_User_IDs", uidt: "SingleLineText" },
            ]
        });

        const tableId = createRes.data.id;
        console.log(`Created table with ID: ${tableId}`);

        // Add relations to Customers and Projects
        console.log("Adding relation to Customers...");
        const customersTable = tablesRes.data.list.find(t => t.title === 'Customers');
        if (customersTable) {
            await api.post(`/db/meta/tables/${tableId}/columns`, {
                title: "Customer_Id",
                uidt: "LinkToAnotherRecord",
                type: "bt",
                childId: tableId,
                parentId: customersTable.id,
                systemRules: "CASCADE"
            });
        }

        console.log("Adding relation to Projects...");
        const projectsTable = tablesRes.data.list.find(t => t.title === 'Projects');
        if (projectsTable) {
            await api.post(`/db/meta/tables/${tableId}/columns`, {
                title: "Project_Id",
                uidt: "LinkToAnotherRecord",
                type: "bt",
                childId: tableId,
                parentId: projectsTable.id,
                systemRules: "CASCADE"
            });
        }

        console.log('ListMappings schema setup complete!');
    } catch (err) {
        console.error("Error setting up ListMappings:", err.response?.data || err.message);
    }
}

main();
