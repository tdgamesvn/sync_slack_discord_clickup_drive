// ─── API Base ─────────────────────────────────
const API = window.location.origin;

// ─── Navigation ───────────────────────────────
document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        switchPage(page);
    });
});

function switchPage(page) {
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach((l) => l.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');
    document.querySelector(`[data-page="${page}"]`).classList.add('active');

    // Load data for the page
    if (page === 'dashboard') loadDashboard();
    if (page === 'chat-sync') loadSyncConfigs();
    if (page === 'drive-sync') loadDriveConfigs();
    if (page === 'logs') loadLogs();
    if (page === 'name-mappings') loadNameMappings();
    if (page === 'settings') loadSettings();
}

// ─── Dashboard ────────────────────────────────
async function loadDashboard() {
    try {
        const res = await fetch(`${API}/api/stats`);
        const data = await res.json();

        document.getElementById('stat-chat-total').textContent = data.syncConfigs?.total ?? 0;
        document.getElementById('stat-chat-active').textContent = data.syncConfigs?.active ?? 0;
        document.getElementById('stat-drive-total').textContent = data.driveConfigs?.total ?? 0;
        document.getElementById('stat-drive-active').textContent = data.driveConfigs?.active ?? 0;

        renderMessagesTable('recent-messages-body', data.recentMessages || []);
    } catch (err) {
        console.error('Dashboard load failed:', err);
    }
}

// ─── Sync Configs ─────────────────────────────
async function loadSyncConfigs() {
    try {
        const res = await fetch(`${API}/api/sync-configs`);
        const { data } = await res.json();
        const tbody = document.getElementById('sync-configs-body');

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No sync configs yet. Click "+ Add Sync Config" to create one.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map((c) => `
      <tr>
        <td><strong>${esc(c.Title || '')}</strong></td>
        <td><code>${esc(c.ClickUp_Task_ID || '—')}</code></td>
        <td><code>${esc(c.Slack_Channel_ID || '—')}</code></td>
        <td><code>${esc(c.Slack_Thread_TS || '—')}</code></td>
        <td><code>${esc(c.Discord_Thread_ID || '—')}</code></td>
        <td>${statusBadge(c.Status)}</td>
        <td class="action-btns">
          <button class="btn btn-sm btn-secondary" onclick="editSyncConfig(${c.Id})">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="deleteSyncConfig(${c.Id})">🗑️</button>
        </td>
      </tr>
    `).join('');
    } catch (err) {
        console.error('Load sync configs failed:', err);
    }
}

async function deleteSyncConfig(id) {
    if (!confirm('Are you sure you want to delete this sync config?')) return;
    try {
        await fetch(`${API}/api/sync-configs/${id}`, { method: 'DELETE' });
        loadSyncConfigs();
    } catch (err) {
        alert('Delete failed: ' + err.message);
    }
}

async function editSyncConfig(id) {
    try {
        const res = await fetch(`${API}/api/sync-configs`);
        const { data } = await res.json();
        const config = data.find((c) => c.Id === id);
        if (!config) return;
        openModal('chat', config);
    } catch (err) {
        alert('Edit failed: ' + err.message);
    }
}

// ─── Drive Configs ────────────────────────────
async function loadDriveConfigs() {
    try {
        const res = await fetch(`${API}/api/drive-configs`);
        const { data } = await res.json();
        const tbody = document.getElementById('drive-configs-body');

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No drive sync configs yet. Click "+ Add Drive Config" to create one.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map((c) => `
      <tr>
        <td><strong>${esc(c.Title || '')}</strong></td>
        <td><code>${esc(c.Studio_Folder_ID || '—')}</code></td>
        <td><code>${esc(c.Client_Folder_ID || '—')}</code></td>
        <td>${esc(c.Sync_Direction || 'studio→client')}</td>
        <td>${c.Last_Synced ? new Date(c.Last_Synced).toLocaleString() : '—'}</td>
        <td>${statusBadge(c.Status)}</td>
        <td class="action-btns">
          <button class="btn btn-sm btn-secondary" onclick="editDriveConfig(${c.Id})">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="deleteDriveConfig(${c.Id})">🗑️</button>
        </td>
      </tr>
    `).join('');
    } catch (err) {
        console.error('Load drive configs failed:', err);
    }
}

async function deleteDriveConfig(id) {
    if (!confirm('Are you sure you want to delete this drive config?')) return;
    try {
        await fetch(`${API}/api/drive-configs/${id}`, { method: 'DELETE' });
        loadDriveConfigs();
    } catch (err) {
        alert('Delete failed: ' + err.message);
    }
}

async function editDriveConfig(id) {
    try {
        const res = await fetch(`${API}/api/drive-configs`);
        const { data } = await res.json();
        const config = data.find((c) => c.Id === id);
        if (!config) return;
        openModal('drive', config);
    } catch (err) {
        alert('Edit failed: ' + err.message);
    }
}

// ─── Logs ─────────────────────────────────────
async function loadLogs() {
    try {
        const res = await fetch(`${API}/api/sync-messages?limit=100`);
        const { data } = await res.json();
        renderMessagesTable('logs-body', data || []);
    } catch (err) {
        console.error('Load logs failed:', err);
    }
}

function renderMessagesTable(tbodyId, messages) {
    const tbody = document.getElementById(tbodyId);
    if (!messages.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No sync messages yet.</td></tr>';
        return;
    }

    tbody.innerHTML = messages.map((m) => `
    <tr>
      <td>${m.Created_At ? new Date(m.Created_At).toLocaleString() : '—'}</td>
      ${tbodyId === 'logs-body' ? `<td>${esc(m.SyncConfig_Title || '—')}</td>` : ''}
      <td><span class="platform-badge platform-${m.Source_Platform}">${esc(m.Source_Platform || '—')}</span></td>
      <td>${esc(m.Author || '—')}</td>
      <td title="${esc(m.Content || '')}">${esc((m.Content || '').substring(0, 60))}</td>
      <td>${esc(m.Synced_To || '—')}</td>
      <td>${statusBadge(m.Status)}</td>
    </tr>
  `).join('');
}

// ─── Settings ─────────────────────────────────
async function loadSettings() {
    try {
        const res = await fetch(`${API}/health`);
        const data = await res.json();
        document.getElementById('setting-status').textContent = data.status || '—';
        document.getElementById('setting-status').className = `badge badge-${data.status === 'ok' ? 'success' : 'error'}`;
        document.getElementById('setting-uptime').textContent = formatUptime(data.uptime);
        document.getElementById('setting-discord').textContent = data.services?.discord || '—';

        const base = window.location.origin;
        document.getElementById('webhook-clickup').textContent = `${base}/webhook/clickup`;
        document.getElementById('webhook-slack').textContent = `${base}/webhook/slack`;
    } catch (err) {
        document.getElementById('setting-status').textContent = 'offline';
        document.getElementById('setting-status').className = 'badge badge-error';
    }
}

// ─── Name Mappings ────────────────────────────
async function loadNameMappings() {
    try {
        const res = await fetch(`${API}/api/name-mappings`);
        const { data } = await res.json();
        const tbody = document.getElementById('name-mappings-body');

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No name mappings yet. Click "+ Add Mapping" to create one.</td></tr>';
            return;
        }

        const platformIcon = { discord: '🟣', slack: '🟡', clickup: '🟢' };
        tbody.innerHTML = data.map((m) => `
          <tr>
            <td><span class="platform-badge platform-${(m.Platform || '').toLowerCase()}">${platformIcon[(m.Platform || '').toLowerCase()] || ''} ${esc(m.Platform || '—')}</span></td>
            <td>${esc(m.Original_Name || '—')}</td>
            <td><strong>${esc(m.Custom_Name || '—')}</strong></td>
            <td class="action-btns">
              <button class="btn btn-sm btn-danger" onclick="deleteNameMapping(${m.Id})">🗑️</button>
            </td>
          </tr>
        `).join('');
    } catch (err) {
        console.error('Load name mappings failed:', err);
    }
}

async function deleteNameMapping(id) {
    if (!confirm('Delete this name mapping?')) return;
    try {
        await fetch(`${API}/api/name-mappings/${id}`, { method: 'DELETE' });
        loadNameMappings();
    } catch (err) {
        alert('Delete failed: ' + err.message);
    }
}

// ─── Modal ────────────────────────────────────
let currentModalType = null;
let currentEditId = null;

function openModal(type, editData = null) {
    currentModalType = type;
    currentEditId = editData?.Id || null;

    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');

    if (type === 'chat') {
        title.textContent = editData ? 'Edit Sync Config' : 'Add Sync Config';
        body.innerHTML = `
      <div class="form-group">
        <label>Title</label>
        <input type="text" name="Title" placeholder="e.g., Project Alpha Chat" value="${esc(editData?.Title || '')}" required>
      </div>
      <div class="form-group">
        <label>ClickUp Task ID</label>
        <input type="text" name="ClickUp_Task_ID" placeholder="e.g., 86a1b2c3d" value="${esc(editData?.ClickUp_Task_ID || '')}">
        <span class="help">The task ID from the ClickUp task URL</span>
      </div>
      <div class="form-group">
        <label>Slack Channel ID</label>
        <input type="text" name="Slack_Channel_ID" placeholder="e.g., C05ABC123" value="${esc(editData?.Slack_Channel_ID || '')}">
        <span class="help">Right-click channel → View channel details → Copy ID</span>
      </div>
      <div class="form-group">
        <label>Slack Thread TS</label>
        <input type="text" name="Slack_Thread_TS" placeholder="e.g., 1234567890.123456" value="${esc(editData?.Slack_Thread_TS || '')}">
        <span class="help">Copy link of the thread parent message → extract timestamp</span>
      </div>
      <div class="form-group">
        <label>Discord Thread ID</label>
        <input type="text" name="Discord_Thread_ID" placeholder="e.g., 1234567890123456789" value="${esc(editData?.Discord_Thread_ID || '')}">
        <span class="help">Enable Developer Mode → Right-click thread → Copy Thread ID</span>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select name="Status">
          <option value="active" ${editData?.Status === 'active' ? 'selected' : ''}>Active</option>
          <option value="paused" ${editData?.Status === 'paused' ? 'selected' : ''}>Paused</option>
        </select>
      </div>
    `;
    } else if (type === 'drive') {
        title.textContent = editData ? 'Edit Drive Config' : 'Add Drive Config';
        body.innerHTML = `
      <div class="form-group">
        <label>Title</label>
        <input type="text" name="Title" placeholder="e.g., Project Alpha Assets" value="${esc(editData?.Title || '')}" required>
      </div>
      <div class="form-group">
        <label>Studio Folder ID</label>
        <input type="text" name="Studio_Folder_ID" placeholder="Google Drive Folder ID" value="${esc(editData?.Studio_Folder_ID || '')}">
        <span class="help">From the Drive folder URL: drive.google.com/drive/folders/{THIS_ID}</span>
      </div>
      <div class="form-group">
        <label>Client Folder ID</label>
        <input type="text" name="Client_Folder_ID" placeholder="Google Drive Folder ID" value="${esc(editData?.Client_Folder_ID || '')}">
        <span class="help">The shared folder ID from the client</span>
      </div>
      <div class="form-group">
        <label>Sync Direction</label>
        <select name="Sync_Direction">
          <option value="studio→client" ${editData?.Sync_Direction === 'studio→client' ? 'selected' : ''}>Studio → Client</option>
          <option value="bidirectional" ${editData?.Sync_Direction === 'bidirectional' ? 'selected' : ''}>Bidirectional</option>
        </select>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select name="Status">
          <option value="active" ${editData?.Status === 'active' ? 'selected' : ''}>Active</option>
          <option value="paused" ${editData?.Status === 'paused' ? 'selected' : ''}>Paused</option>
        </select>
      </div>
    `;
    } else if (type === 'name-mapping') {
        title.textContent = 'Add Name Mapping';
        body.innerHTML = `
      <div class="form-group">
        <label>Platform</label>
        <select name="Platform" required>
          <option value="discord">Discord</option>
          <option value="slack">Slack</option>
          <option value="clickup">ClickUp</option>
        </select>
      </div>
      <div class="form-group">
        <label>Original Name</label>
        <input type="text" name="Original_Name" placeholder="e.g., NA" required>
        <span class="help">The display name as it appears on the platform</span>
      </div>
      <div class="form-group">
        <label>Custom Name</label>
        <input type="text" name="Custom_Name" placeholder="e.g., Art Director" required>
        <span class="help">The name you want to show in synced messages</span>
      </div>
    `;
    }

    document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
    currentModalType = null;
    currentEditId = null;
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const form = document.getElementById('modal-form');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    // Add created_at for new records
    if (!currentEditId) {
        data.Created_At = new Date().toISOString();
    }

    try {
        let endpoint, method, url;
        if (currentModalType === 'name-mapping') {
            endpoint = 'name-mappings';
            method = 'POST';
            url = `${API}/api/${endpoint}`;
        } else {
            endpoint = currentModalType === 'chat' ? 'sync-configs' : 'drive-configs';
            method = currentEditId ? 'PUT' : 'POST';
            url = currentEditId ? `${API}/api/${endpoint}/${currentEditId}` : `${API}/api/${endpoint}`;
        }

        await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        closeModal();
        if (currentModalType === 'chat') loadSyncConfigs();
        else if (currentModalType === 'drive') loadDriveConfigs();
        else if (currentModalType === 'name-mapping') loadNameMappings();
    } catch (err) {
        alert('Save failed: ' + err.message);
    }
}

// ─── Health Check ─────────────────────────────
async function checkServerStatus() {
    try {
        const res = await fetch(`${API}/health`);
        const data = await res.json();
        const badge = document.getElementById('server-status');
        const dot = badge.querySelector('.status-dot');
        const text = badge.querySelector('span:last-child');

        if (data.status === 'ok') {
            dot.className = 'status-dot connected';
            text.textContent = 'Connected';
        } else {
            dot.className = 'status-dot error';
            text.textContent = 'Error';
        }
    } catch {
        const badge = document.getElementById('server-status');
        const dot = badge.querySelector('.status-dot');
        const text = badge.querySelector('span:last-child');
        dot.className = 'status-dot error';
        text.textContent = 'Disconnected';
    }
}

// ─── Helpers ──────────────────────────────────
function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function statusBadge(status) {
    const map = {
        active: 'success',
        success: 'success',
        paused: 'warning',
        pending: 'warning',
        error: 'error',
        failed: 'error',
    };
    const type = map[status] || 'info';
    return `<span class="badge badge-${type}">${esc(status || 'unknown')}</span>`;
}

function formatUptime(seconds) {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

// ─── Init ─────────────────────────────────────
loadDashboard();
checkServerStatus();
setInterval(checkServerStatus, 30000); // Check every 30s
