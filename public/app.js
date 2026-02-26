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
  if (page === 'chat-sync') { loadChatFilters(); loadSyncConfigs(); }
  if (page === 'drive-sync') { loadDriveFilters(); loadDriveConfigs(); }
  if (page === 'customers') loadCustomers();
  if (page === 'projects') loadProjects();
  if (page === 'logs') { loadLogFilters(); loadLogs(); }
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
async function loadChatFilters() {
  await fetchDropdownData();
  const cSelect = document.getElementById('chat-filter-customer');
  if (cSelect) {
    cSelect.innerHTML = '<option value="">-- All Customers --</option>' +
      allCustomers.map(c => `<option value="${c.Id}">${esc(c.Title)}</option>`).join('');
    updateChatProjectFilter();
  }
}

function updateChatProjectFilter() {
  const customerId = document.getElementById('chat-filter-customer').value;
  const pSelect = document.getElementById('chat-filter-project');
  if (!pSelect) return;

  const filteredProjects = customerId ? allProjects.filter(p => p.Customer_Id == customerId) : allProjects;
  pSelect.innerHTML = '<option value="">-- All Projects --</option>' +
    filteredProjects.map(p => `<option value="${p.Id}">${esc(p.Title)}</option>`).join('');
  loadSyncConfigs();
}

async function loadSyncConfigs() {
  try {
    await fetchDropdownData();
    const res = await fetch(`${API}/api/sync-configs`);
    let { data } = await res.json();
    const tbody = document.getElementById('sync-configs-body');

    const filterCustId = document.getElementById('chat-filter-customer')?.value;
    const filterProjId = document.getElementById('chat-filter-project')?.value;

    data = (data || []).filter(c => {
      let pass = true;
      const project = allProjects.find(p => p.Id == c.Project_Id);
      const custId = project ? project.Customer_Id : null;
      if (filterCustId && custId != filterCustId) pass = false;
      if (filterProjId && c.Project_Id != filterProjId) pass = false;
      return pass;
    });

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No sync configs yet. Click "+ Add Sync Config" to create one.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map((c) => {
      const project = allProjects.find(p => p.Id == c.Project_Id);
      const customer = project ? allCustomers.find(cu => cu.Id == project.Customer_Id) : null;
      return `
      <tr>
        <td>${esc(customer ? customer.Title : '—')}</td>
        <td>${esc(project ? project.Title : '—')}</td>
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
      `;
    }).join('');
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
async function loadDriveFilters() {
  await fetchDropdownData();
  const cSelect = document.getElementById('drive-filter-customer');
  if (cSelect) {
    cSelect.innerHTML = '<option value="">-- All Customers --</option>' +
      allCustomers.map(c => `<option value="${c.Id}">${esc(c.Title)}</option>`).join('');
    updateDriveProjectFilter();
  }
}

function updateDriveProjectFilter() {
  const customerId = document.getElementById('drive-filter-customer').value;
  const pSelect = document.getElementById('drive-filter-project');
  if (!pSelect) return;

  const filteredProjects = customerId ? allProjects.filter(p => p.Customer_Id == customerId) : allProjects;
  pSelect.innerHTML = '<option value="">-- All Projects --</option>' +
    filteredProjects.map(p => `<option value="${p.Id}">${esc(p.Title)}</option>`).join('');
  loadDriveConfigs();
}

async function loadDriveConfigs() {
  try {
    await fetchDropdownData();
    const res = await fetch(`${API}/api/drive-configs`);
    let { data } = await res.json();
    const tbody = document.getElementById('drive-configs-body');

    const filterCustId = document.getElementById('drive-filter-customer')?.value;
    const filterProjId = document.getElementById('drive-filter-project')?.value;

    data = (data || []).filter(c => {
      let pass = true;
      const project = allProjects.find(p => p.Id == c.Project_Id);
      const custId = project ? project.Customer_Id : null;
      if (filterCustId && custId != filterCustId) pass = false;
      if (filterProjId && c.Project_Id != filterProjId) pass = false;
      return pass;
    });

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No drive sync configs yet. Click "+ Add Drive Config" to create one.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map((c) => {
      const project = allProjects.find(p => p.Id == c.Project_Id);
      const customer = project ? allCustomers.find(cu => cu.Id == project.Customer_Id) : null;
      return `
      <tr>
        <td>${esc(customer ? customer.Title : '—')}</td>
        <td>${esc(project ? project.Title : '—')}</td>
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
      `;
    }).join('');
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
let allCustomers = [];
let allProjects = [];

async function fetchDropdownData() {
  try {
    const [cRes, pRes] = await Promise.all([
      fetch(`${API}/api/customers`),
      fetch(`${API}/api/projects`)
    ]);
    const cData = await cRes.json();
    const pData = await pRes.json();
    allCustomers = cData.data || [];
    allProjects = pData.data || [];
  } catch (err) {
    console.error('Fetch dropdown data failed:', err);
  }
}

async function loadLogFilters() {
  await fetchDropdownData();
  const cSelect = document.getElementById('log-filter-customer');
  if (cSelect) {
    cSelect.innerHTML = '<option value="">-- All Customers --</option>' +
      allCustomers.map(c => `<option value="${c.Id}">${esc(c.Title)}</option>`).join('');
    updateLogProjectFilter();
  }
}

function updateLogProjectFilter() {
  const customerId = document.getElementById('log-filter-customer').value;
  const pSelect = document.getElementById('log-filter-project');
  if (!pSelect) return;

  const filteredProjects = customerId ? allProjects.filter(p => p.Customer_Id == customerId) : allProjects;
  pSelect.innerHTML = '<option value="">-- All Projects --</option>' +
    filteredProjects.map(p => `<option value="${p.Id}">${esc(p.Title)}</option>`).join('');
  loadLogs();
}

async function loadLogs() {
  try {
    const customerId = document.getElementById('log-filter-customer')?.value;
    const projectId = document.getElementById('log-filter-project')?.value;
    let url = `${API}/api/sync-messages?limit=100`;
    if (customerId) url += `&customerId=${customerId}`;
    if (projectId) url += `&projectId=${projectId}`;

    const res = await fetch(url);
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

// ─── Customers ────────────────────────────────
async function loadCustomers() {
  try {
    const res = await fetch(`${API}/api/customers`);
    const { data } = await res.json();
    const tbody = document.getElementById('customers-body');

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="2" class="empty-state">No customers yet. Click "+ Add Customer" to create one.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map((c) => `
            <tr>
                <td><strong>${esc(c.Title || '')}</strong></td>
                <td class="action-btns">
                    <button class="btn btn-sm btn-danger" onclick="deleteCustomer(${c.Id})">🗑️</button>
                </td>
            </tr>
        `).join('');
  } catch (err) {
    console.error('Load customers failed:', err);
  }
}

async function deleteCustomer(id) {
  if (!confirm('Are you sure you want to delete this customer?')) return;
  try {
    await fetch(`${API}/api/customers/${id}`, { method: 'DELETE' });
    loadCustomers();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

// ─── Projects ─────────────────────────────────
async function loadProjects() {
  try {
    const res = await fetch(`${API}/api/projects`);
    const { data } = await res.json();
    const tbody = document.getElementById('projects-body');

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No projects yet. Click "+ Add Project" to create one.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map((p) => `
            <tr>
                <td><strong>${esc(p.Title || '')}</strong></td>
                <td><code>${esc(p.Customer_Id || '—')}</code></td>
                <td class="action-btns">
                    <button class="btn btn-sm btn-danger" onclick="deleteProject(${p.Id})">🗑️</button>
                </td>
            </tr>
        `).join('');
  } catch (err) {
    console.error('Load projects failed:', err);
  }
}

async function deleteProject(id) {
  if (!confirm('Are you sure you want to delete this project?')) return;
  try {
    await fetch(`${API}/api/projects/${id}`, { method: 'DELETE' });
    loadProjects();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

// ─── Modal ────────────────────────────────────
let currentModalType = null;
let currentEditId = null;

async function openModal(type, editData = null) {
  currentModalType = type;
  currentEditId = editData?.Id || null;

  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');

  await fetchDropdownData();
  const projectOptions = allProjects.map(p => `<option value="${p.Id}" ${editData?.Project_Id == p.Id ? 'selected' : ''}>${esc(p.Title)}</option>`).join('');
  const customerOptions = allCustomers.map(c => `<option value="${c.Id}">${esc(c.Title)}</option>`).join('');

  if (type === 'chat') {
    title.textContent = editData ? 'Edit Sync Config' : 'Add Sync Config';
    body.innerHTML = `
      <div class="form-group">
        <label>Title</label>
        <input type="text" name="Title" placeholder="e.g., Project Alpha Chat" value="${esc(editData?.Title || '')}" required>
      </div>
      <div class="form-group">
        <label>Project</label>
        <select name="Project_Id">
          <option value="">-- None --</option>
          ${projectOptions}
        </select>
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
      
      <div class="form-group" style="margin-top: 15px;">
        <label><strong>Directional Sync</strong></label>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">
          <label><input type="checkbox" name="Sync_ClickUp_To_Slack" ${editData?.Sync_ClickUp_To_Slack !== false && editData?.Sync_ClickUp_To_Slack !== 0 ? 'checked' : ''}> ClickUp ➔ Slack</label>
          <label><input type="checkbox" name="Sync_ClickUp_To_Discord" ${editData?.Sync_ClickUp_To_Discord !== false && editData?.Sync_ClickUp_To_Discord !== 0 ? 'checked' : ''}> ClickUp ➔ Discord</label>
          <label><input type="checkbox" name="Sync_Slack_To_ClickUp" ${editData?.Sync_Slack_To_ClickUp !== false && editData?.Sync_Slack_To_ClickUp !== 0 ? 'checked' : ''}> Slack ➔ ClickUp</label>
          <label><input type="checkbox" name="Sync_Slack_To_Discord" ${editData?.Sync_Slack_To_Discord !== false && editData?.Sync_Slack_To_Discord !== 0 ? 'checked' : ''}> Slack ➔ Discord</label>
          <label><input type="checkbox" name="Sync_Discord_To_ClickUp" ${editData?.Sync_Discord_To_ClickUp !== false && editData?.Sync_Discord_To_ClickUp !== 0 ? 'checked' : ''}> Discord ➔ ClickUp</label>
          <label><input type="checkbox" name="Sync_Discord_To_Slack" ${editData?.Sync_Discord_To_Slack !== false && editData?.Sync_Discord_To_Slack !== 0 ? 'checked' : ''}> Discord ➔ Slack</label>
        </div>
      </div>

      <div class="form-group" style="margin-top: 15px;">
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
        <label>Project</label>
        <select name="Project_Id">
          <option value="">-- None --</option>
          ${projectOptions}
        </select>
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
  } else if (type === 'customer') {
    title.textContent = 'Add Customer';
    body.innerHTML = `
      <div class="form-group">
        <label>Title</label>
        <input type="text" name="Title" placeholder="e.g., Client XYZ" required>
      </div>
    `;
  } else if (type === 'project') {
    title.textContent = 'Add Project';
    body.innerHTML = `
      <div class="form-group">
        <label>Title</label>
        <input type="text" name="Title" placeholder="e.g., Project Alpha" required>
      </div>
      <div class="form-group">
        <label>Customer</label>
        <select name="Customer_Id" required>
          ${customerOptions}
        </select>
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
    } else if (currentModalType === 'customer') {
      endpoint = 'customers';
      method = 'POST';
      url = `${API}/api/${endpoint}`;
    } else if (currentModalType === 'project') {
      endpoint = 'projects';
      method = 'POST';
      url = `${API}/api/${endpoint}`;
    } else {
      endpoint = currentModalType === 'chat' ? 'sync-configs' : 'drive-configs';
      method = currentEditId ? 'PUT' : 'POST';
      url = currentEditId ? `${API}/api/${endpoint}/${currentEditId}` : `${API}/api/${endpoint}`;
    }

    // Clean up empty Project_Id
    if (data.Project_Id === "") {
      data.Project_Id = null;
    }

    if (currentModalType === 'chat') {
      data.Sync_ClickUp_To_Slack = formData.get('Sync_ClickUp_To_Slack') === 'on';
      data.Sync_ClickUp_To_Discord = formData.get('Sync_ClickUp_To_Discord') === 'on';
      data.Sync_Slack_To_ClickUp = formData.get('Sync_Slack_To_ClickUp') === 'on';
      data.Sync_Slack_To_Discord = formData.get('Sync_Slack_To_Discord') === 'on';
      data.Sync_Discord_To_ClickUp = formData.get('Sync_Discord_To_ClickUp') === 'on';
      data.Sync_Discord_To_Slack = formData.get('Sync_Discord_To_Slack') === 'on';
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
    else if (currentModalType === 'customer') loadCustomers();
    else if (currentModalType === 'project') loadProjects();
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
