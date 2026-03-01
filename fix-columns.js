require('dotenv').config();
const axios = require('axios');

const api = axios.create({
    baseURL: process.env.NOCODB_URL,
    headers: { 'xc-token': process.env.NOCODB_API_TOKEN },
});

async function fixColumns() {
    try {
        console.log("Fixing NocoDB SingleSelect columns to SingleLineText...");

        // Job_Type
        await api.patch('/api/v1/db/meta/columns/c47o872j6glm8jh', { uidt: 'SingleLineText' });
        // Status
        await api.patch('/api/v1/db/meta/columns/c2u0vi4lvspwsop', { uidt: 'SingleLineText' });
        // Payment_Status
        await api.patch('/api/v1/db/meta/columns/cubndbrf3burbdy', { uidt: 'SingleLineText' });

        console.log("✅ Columns updated successfully.");
    } catch (err) {
        console.error("❌ Failed:", err.response?.data || err.message);
    }
}

fixColumns();
