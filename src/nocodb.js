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

async function logMessage({ syncConfigTitle, source, sourceMessageId, author, content, syncedTo, status, customerId, projectId }) {
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
        Project_Id: projectId
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
    getCustomers,
    createCustomer,
    deleteCustomer,
    getProjects,
    createProject,
    deleteProject
};
