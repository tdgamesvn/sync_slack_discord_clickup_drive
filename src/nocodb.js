const axios = require('axios');
const config = require('./config');

const api = axios.create({
    baseURL: `${config.NOCODB_URL}/api/v2`,
    headers: {
        'xc-token': config.NOCODB_API_TOKEN,
        'Content-Type': 'application/json',
    },
});

// Table IDs cache
let tableIds = {};

async function getTableIds() {
    if (Object.keys(tableIds).length > 0) return tableIds;
    const res = await api.get(`/meta/bases/${config.NOCODB_BASE_ID}/tables`);
    for (const table of res.data.list) {
        tableIds[table.title] = table.id;
    }
    console.log('[NocoDB] Table IDs loaded:', Object.keys(tableIds).join(', '));
    return tableIds;
}

// ─── Customers ────────────────────────────────

async function getCustomers() {
    const ids = await getTableIds();
    const res = await api.get(`/tables/${ids.Customers}/records`, { params: { limit: 100 } });
    return res.data.list || [];
}

async function createCustomer(data) {
    const ids = await getTableIds();
    const res = await api.post(`/tables/${ids.Customers}/records`, data);
    return res.data;
}

async function deleteCustomer(rowId) {
    const ids = await getTableIds();
    const res = await api.delete(`/tables/${ids.Customers}/records`, { data: [{ Id: rowId }] });
    return res.data;
}

// ─── Projects ─────────────────────────────────

async function getProjects() {
    const ids = await getTableIds();
    const res = await api.get(`/tables/${ids.Projects}/records`, { params: { limit: 100 } });
    return res.data.list || [];
}

async function createProject(data) {
    const ids = await getTableIds();
    const res = await api.post(`/tables/${ids.Projects}/records`, data);
    return res.data;
}

async function deleteProject(rowId) {
    const ids = await getTableIds();
    const res = await api.delete(`/tables/${ids.Projects}/records`, { data: [{ Id: rowId }] });
    return res.data;
}

// ─── Account ──────────────────────────────────
async function getAccountByUsername(username) {
    const ids = await getTableIds();
    const res = await api.get(`/tables/${ids.Account}/records`, {
        params: { where: `(Username,eq,${username})`, limit: 1 }
    });
    return res.data.list && res.data.list.length > 0 ? res.data.list[0] : null;
}

// ─── List Mappings ───────────────────────────

async function getListMappings() {
    const ids = await getTableIds();
    const res = await api.get(`/tables/${ids.ListMappings}/records`, { params: { limit: 100 } });
    return res.data.list || [];
}

async function findListMapping(listId) {
    const mappings = await getListMappings();
    return mappings.find(m => m.List_ID === listId);
}

async function createListMapping(data) {
    const ids = await getTableIds();
    const res = await api.post(`/tables/${ids.ListMappings}/records`, data);
    return res.data;
}

async function deleteListMapping(rowId) {
    const ids = await getTableIds();
    const res = await api.delete(`/tables/${ids.ListMappings}/records`, { data: [{ Id: rowId }] });
    return res.data;
}

// ─── SyncConfigs ──────────────────────────────

async function getSyncConfigs(where) {
    const ids = await getTableIds();
    const params = { limit: 100 };
    if (where) params.where = where;
    const res = await api.get(`/tables/${ids.SyncConfigs}/records`, { params });
    return res.data.list || [];
}

async function findSyncConfigByPlatformId(platform, id) {
    const configs = await getSyncConfigs();
    return configs.filter((c) => {
        if (platform === 'clickup') return c.ClickUp_Task_ID === id;
        if (platform === 'slack') return c.Slack_Thread_TS === id;
        if (platform === 'discord') return c.Discord_Thread_ID === id;
        return false;
    });
}

async function createSyncConfig(data) {
    const ids = await getTableIds();
    const res = await api.post(`/tables/${ids.SyncConfigs}/records`, data);
    return res.data;
}

async function updateSyncConfig(rowId, data) {
    const ids = await getTableIds();
    const res = await api.patch(`/tables/${ids.SyncConfigs}/records`, [{ Id: rowId, ...data }]);
    return res.data;
}

async function deleteSyncConfig(rowId) {
    const ids = await getTableIds();
    const res = await api.delete(`/tables/${ids.SyncConfigs}/records`, { data: [{ Id: rowId }] });
    return res.data;
}

// ─── SyncMessages ─────────────────────────────

async function logMessage({ syncConfigTitle, source, sourceMessageId, author, content, syncedTo, status, customerId, projectId, actionBy }) {
    const ids = await getTableIds();
    const record = {
        Title: (content || '').substring(0, 50),
        SyncConfig_Title: syncConfigTitle,
        Source_Platform: source,
        Source_Message_ID: sourceMessageId,
        Author: author,
        Content: content,
        Synced_To: syncedTo,
        Status: status || 'success',
        Created_At: new Date().toISOString(),
        Customer_Id: customerId,
        Project_Id: projectId,
        Action_By: actionBy || 'System'
    };
    const res = await api.post(`/tables/${ids.SyncMessages}/records`, record);
    return res.data;
}

async function getRecentMessages(limit = 50, where = null) {
    const ids = await getTableIds();
    const params = { limit, sort: '-Created_At' };
    if (where) params.where = where;
    const res = await api.get(`/tables/${ids.SyncMessages}/records`, { params });
    return res.data.list || [];
}

// ─── DriveConfigs ─────────────────────────────

async function getDriveConfigs(where) {
    const ids = await getTableIds();
    const params = { limit: 100 };
    if (where) params.where = where;
    const res = await api.get(`/tables/${ids.DriveConfigs}/records`, { params });
    return res.data.list || [];
}

async function createDriveConfig(data) {
    const ids = await getTableIds();
    const res = await api.post(`/tables/${ids.DriveConfigs}/records`, data);
    return res.data;
}

async function updateDriveConfig(rowId, data) {
    const ids = await getTableIds();
    const res = await api.patch(`/tables/${ids.DriveConfigs}/records`, [{ Id: rowId, ...data }]);
    return res.data;
}

async function deleteDriveConfig(rowId) {
    const ids = await getTableIds();
    const res = await api.delete(`/tables/${ids.DriveConfigs}/records`, { data: [{ Id: rowId }] });
    return res.data;
}

// ─── Settings ─────────────────────────────────

async function getSettings() {
    const ids = await getTableIds();
    const res = await api.get(`/tables/${ids.Settings}/records`, { params: { limit: 100 } });
    return res.data.list || [];
}

async function upsertSetting(title, value, platform, description) {
    const ids = await getTableIds();
    const existing = await getSettings();
    const found = existing.find((s) => s.Title === title);
    if (found) {
        await api.patch(`/tables/${ids.Settings}/records`, [{ Id: found.Id, Value: value }]);
    } else {
        await api.post(`/tables/${ids.Settings}/records`, { Title: title, Value: value, Platform: platform, Description: description });
    }
}

// ─── NameMappings ─────────────────────────────

let nameMappingsCache = null;
let nameMappingsCacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

async function getNameMappings() {
    const ids = await getTableIds();
    if (!ids.NameMappings) return [];
    // Use cache to avoid hitting NocoDB on every message
    if (nameMappingsCache && Date.now() - nameMappingsCacheTime < CACHE_TTL) {
        return nameMappingsCache;
    }
    const res = await api.get(`/tables/${ids.NameMappings}/records`, { params: { limit: 200 } });
    nameMappingsCache = res.data.list || [];
    nameMappingsCacheTime = Date.now();
    return nameMappingsCache;
}

async function resolveDisplayName(platform, originalName) {
    const mappings = await getNameMappings();
    const match = mappings.find(
        (m) => m.Platform?.toLowerCase() === platform?.toLowerCase() && m.Original_Name === originalName
    );
    return match?.Custom_Name || originalName;
}

async function createNameMapping(data) {
    const ids = await getTableIds();
    nameMappingsCache = null; // Invalidate cache
    const res = await api.post(`/tables/${ids.NameMappings}/records`, data);
    return res.data;
}

async function deleteNameMapping(rowId) {
    const ids = await getTableIds();
    nameMappingsCache = null;
    const res = await api.delete(`/tables/${ids.NameMappings}/records`, { data: [{ Id: rowId }] });
    return res.data;
}

// ─── PM_Tasks_Tracking (Finance Tracking) ───────
async function upsertPMTaskTracking(taskData) {
    const ids = await getTableIds();
    if (!ids.PM_Tasks_Tracking) {
        console.error('[NocoDB] PM_Tasks_Tracking table not found via getTableIds cache.');
        return null;
    }

    try {
        // Try to get existing record
        const existRes = await api.get(`/tables/${ids.PM_Tasks_Tracking}/records`, {
            params: { where: `(Task_ID,eq,${taskData.Task_ID})`, limit: 1 }
        });

        const existing = existRes.data.list && existRes.data.list.length > 0 ? existRes.data.list[0] : null;

        if (existing) {
            // Update mapping
            const updatePayload = {
                Id: existing.Id,
                Task_Name: taskData.Task_Name,
                Status: taskData.Status,
                Job_Type: taskData.Job_Type,
                Assignee: taskData.Assignee,
                Task_URL: taskData.Task_URL
            };
            // Note: We deliberately do NOT update 'Cost', 'Payment_Status', 'Notes' 
            // as those are managed independently by the PM on the NocoDB UI.
            const patchRes = await api.patch(`/tables/${ids.PM_Tasks_Tracking}/records`, [updatePayload]);
            return patchRes.data;
        } else {
            // Create mapping
            const insertPayload = {
                Task_ID: taskData.Task_ID,
                Task_Name: taskData.Task_Name,
                Status: taskData.Status,
                Job_Type: taskData.Job_Type,
                Assignee: taskData.Assignee,
                Task_URL: taskData.Task_URL,
                Payment_Status: 'Unpaid' // Default value
            };
            const postRes = await api.post(`/tables/${ids.PM_Tasks_Tracking}/records`, insertPayload);
            return postRes.data;
        }
    } catch (err) {
        console.error('[NocoDB] upsertPMTaskTracking Error:', err.response?.data || err.message);
        throw err;
    }
}

module.exports = {
    getTableIds,
    getSyncConfigs,
    findSyncConfigByPlatformId,
    createSyncConfig,
    updateSyncConfig,
    deleteSyncConfig,
    logMessage,
    getRecentMessages,
    getDriveConfigs,
    createDriveConfig,
    updateDriveConfig,
    deleteDriveConfig,
    getSettings,
    upsertSetting,
    getNameMappings,
    resolveDisplayName,
    createNameMapping,
    deleteNameMapping,
    getAccountByUsername,
    getListMappings,
    findListMapping,
    createListMapping,
    deleteListMapping,
    getSyncConfigs,
    findSyncConfigByPlatformId,
    createSyncConfig,
    updateSyncConfig,
    deleteSyncConfig,
    getCustomers,
    createCustomer,
    deleteCustomer,
    getProjects,
    createProject,
    deleteProject,
    upsertPMTaskTracking
};
