require('dotenv').config();
const axios = require('axios');

const api = axios.create({
    baseURL: process.env.NOCODB_URL,
    headers: { 'xc-token': process.env.NOCODB_API_TOKEN },
});

async function main() {
    try {
        console.log("Fetching tables...");
        const tablesRes = await api.get(`/api/v1/db/meta/projects/${process.env.NOCODB_BASE_ID}/tables`);
        const table = tablesRes.data.list.find(t => t.title === 'PM_Tasks_Tracking');
        if (!table) {
            console.error("PM_Tasks_Tracking not found.");
            return;
        }

        console.log(`Table ID: ${table.id}`);

        // Fetch columns
        const tableRes = await api.get(`/api/v1/db/meta/tables/${table.id}`);
        const columns = tableRes.data.columns;

        // Find Cost column and modify to Decimal
        const costCol = columns.find(c => c.title === 'Cost');
        if (costCol) {
            console.log(`Modifying Cost col (ID: ${costCol.id}) to Decimal...`);
            await api.patch(`/api/v1/db/meta/columns/${costCol.id}`, { uidt: 'Decimal' });
            console.log("Cost modified.");
        }

        // Check if Currency exists
        const currencyCol = columns.find(c => c.title === 'Currency');
        if (!currencyCol) {
            console.log("Adding Currency column as SingleLineText...");
            await api.post(`/api/v1/db/meta/tables/${table.id}/columns`, {
                title: "Currency",
                column_name: "Currency",
                uidt: "SingleLineText"
            });
            console.log("Currency column added.");
        } else {
            console.log("Currency column already exists.");
        }

    } catch (err) {
        console.error("Error:", err.response?.data || err.message);
    }
}

main();
