const axios = require('axios');
const fs = require('fs');
require('dotenv').config({ path: 'e:/TDC_App/TDGAMES_App/Sync_Slack_Discord_ClickUp_Drive/.env' });

const NOCODB_URL = process.env.NOCODB_URL;
const NOCODB_API_TOKEN = process.env.NOCODB_API_TOKEN;
const NOCODB_BASE_ID = process.env.NOCODB_BASE_ID; // pjlxcpr5ih0q9y9

const api = axios.create({
    baseURL: NOCODB_URL,
    headers: { 'xc-token': NOCODB_API_TOKEN },
});

async function createTable() {
    try {
        console.log(`Creating table in Base ${NOCODB_BASE_ID}...`);

        const payload = {
            table_name: "PM_Tasks_Tracking",
            title: "PM_Tasks_Tracking",
            columns: [
                {
                    title: "Task_ID",
                    column_name: "Task_ID",
                    uidt: "SingleLineText",
                    pk: true
                },
                {
                    title: "Task_Name",
                    column_name: "Task_Name",
                    uidt: "SingleLineText"
                },
                {
                    title: "Job_Type",
                    column_name: "Job_Type",
                    uidt: "SingleSelect",
                    meta: {
                        options: [
                            { title: "Art", color: "#30a46c" },
                            { title: "Animation", color: "#4466ff" }
                        ]
                    }
                },
                {
                    title: "Status",
                    column_name: "Status",
                    uidt: "SingleSelect",
                    meta: {
                        options: [
                            { title: "new request", color: "#b5bcc2" },
                            { title: "in progess", color: "#f8ae00" },
                            { title: "fix", color: "#b660e0" },
                            { title: "lead_check", color: "#4466ff" },
                            { title: "client_review", color: "#f76808" },
                            { title: "approved", color: "#30a46c" },
                            { title: "cancelled", color: "#8d8d8d" },
                            { title: "Closed", color: "#008844" },
                            { title: "Other", color: "#999999" }
                        ]
                    }
                },
                {
                    title: "Assignee",
                    column_name: "Assignee",
                    uidt: "SingleLineText" // Or JSON/MultiSelect if multiple
                },
                {
                    title: "Task_URL",
                    column_name: "Task_URL",
                    uidt: "URL"
                },
                {
                    title: "Cost",
                    column_name: "Cost",
                    uidt: "Currency",
                    meta: {
                        currency_code: "USD"
                    }
                },
                {
                    title: "Payment_Status",
                    column_name: "Payment_Status",
                    uidt: "SingleSelect",
                    meta: {
                        options: [
                            { title: "Unpaid", color: "#FF4A3F" },
                            { title: "Advance Paid", color: "#f8ae00" },
                            { title: "Fully Paid", color: "#30a46c" }
                        ]
                    }
                },
                {
                    title: "Notes",
                    column_name: "Notes",
                    uidt: "LongText"
                }
            ]
        };

        const res = await api.post(`/api/v1/db/meta/projects/${NOCODB_BASE_ID}/tables`, payload);
        console.log("Table created successfully:", res.data.id);
        fs.writeFileSync('e:/TDC_App/TDGAMES_App/Sync_Slack_Discord_ClickUp_Drive/create-table-output.txt', JSON.stringify(res.data, null, 2));

    } catch (err) {
        console.error("Error creating table:", err.response ? err.response.data : err.message);
    }
}

createTable();
