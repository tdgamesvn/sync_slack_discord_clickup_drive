const API = window.location.origin;

// ─── Theme ────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('chatsync_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeButton(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('chatsync_theme', next);
  updateThemeButton(next);
}

function updateThemeButton(theme) {
  const icon = document.getElementById('theme-icon');
  const btn = document.getElementById('theme-toggle');
  if (icon && btn) {
    icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    btn.querySelector('span:last-child').textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
  }
}

initTheme();
// ─── Auth ─────────────────────────────────────
let authToken = localStorage.getItem('chatsync_token');

function checkAuth() {
  if (authToken) {
    document.getElementById('login-overlay').style.display = 'none';
    loadDashboard();
    checkServerStatus();
  } else {
    document.getElementById('login-overlay').style.display = 'flex';
  }
}

document.getElementById('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');

  errorEl.style.display = 'none';

  try {
    const res = await fetch(`${API}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    authToken = data.token;
    localStorage.setItem('chatsync_token', authToken);
    checkAuth();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

function logout() {
  authToken = null;
  localStorage.removeItem('chatsync_token');
  location.reload();
}

/**
 * Wrapper for fetch to auto-attach auth headers and handle 401s
 */
async function apiFetch(url, options = {}) {
  const headers = { ...options.headers };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    logout();
    throw new Error('Session expired. Please log in again.');
  }

  return response;
}


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
  if (page === 'pm-tracking') { loadPMTrackingConfigs(); loadPMTracking(); }
  if (page === 'invoice') {
    // Set default invoice month to current month
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthInput = document.getElementById('invoice-month');
    if (monthInput && !monthInput.value) monthInput.value = monthStr;
  }
  if (page === 'customers') loadCustomers();
  if (page === 'projects') loadProjects();
  if (page === 'logs') { loadLogFilters(); loadLogs(); }
  if (page === 'name-mappings') loadNameMappings();
  if (page === 'list-mappings') loadListMappings();
  if (page === 'settings') loadSettings();
}

// ─── Dashboard ────────────────────────────────
async function loadDashboard() {
  try {
    const res = await apiFetch(`${API}/api/stats`);
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
    const res = await apiFetch(`${API}/api/sync-configs`);
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
    await apiFetch(`${API}/api/sync-configs/${id}`, { method: 'DELETE' });
    loadSyncConfigs();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

async function editSyncConfig(id) {
  try {
    const res = await apiFetch(`${API}/api/sync-configs`);
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
    const res = await apiFetch(`${API}/api/drive-configs`);
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
    await apiFetch(`${API}/api/drive-configs/${id}`, { method: 'DELETE' });
    loadDriveConfigs();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

async function editDriveConfig(id) {
  try {
    const res = await apiFetch(`${API}/api/drive-configs`);
    const { data } = await res.json();
    const config = data.find((c) => c.Id === id);
    if (!config) return;
    openModal('drive', config);
  } catch (err) {
    alert('Edit failed: ' + err.message);
  }
}

// ─── PM Tracking ──────────────────────────────
async function loadPMTracking() {
  try {
    const tbody = document.getElementById('pm-tracking-body');
    const pmConfig = document.getElementById('pm-filter-config')?.value;
    const jobType = document.getElementById('pm-filter-jobtype')?.value;
    const paymentStatus = document.getElementById('pm-filter-payment')?.value;
    const assignee = document.getElementById('pm-filter-assignee')?.value;
    const status = document.getElementById('pm-filter-status')?.value;
    const hasDueDate = document.getElementById('pm-filter-duedate')?.value;

    let url = `${API}/api/pm-tracking?limit=100`;
    if (pmConfig) url += `&pmConfig=${encodeURIComponent(pmConfig)}`;
    if (jobType) url += `&jobType=${encodeURIComponent(jobType)}`;
    if (paymentStatus) url += `&paymentStatus=${encodeURIComponent(paymentStatus)}`;
    if (assignee) url += `&assignee=${encodeURIComponent(assignee)}`;
    if (status) url += `&status=${encodeURIComponent(status)}`;
    if (hasDueDate) url += `&hasDueDate=${encodeURIComponent(hasDueDate)}`;

    const res = await apiFetch(url);
    const { data } = await res.json();

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="12" class="empty-state">No tracking data found for the selected filters.</td></tr>';
      return;
    }

    // Populate dynamic filters (Assignee, Status, Job Type)
    populatePMFilters(data);

    tbody.innerHTML = data.map((t) => {
      const costDisplay = (t.Cost !== null && t.Cost !== undefined)
        ? (t.Currency === 'VND'
          ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(t.Cost)
          : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(t.Cost))
        : '$0.00';

      const bonusDisplay = (t.Bonus !== null && t.Bonus !== undefined && t.Bonus !== 0)
        ? (t.Currency === 'VND'
          ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(t.Bonus)
          : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(t.Bonus))
        : '—';

      return `
      <tr>
        <td><strong>${esc(t.Job_Type || '—')}</strong></td>
        <td><a href="${esc(t.Task_URL || '#')}" target="_blank" style="color: var(--primary); text-decoration: none;">${esc(t.Task_Name || '—')}</a> <br><small style="color: var(--text-muted);">${esc(t.Task_ID || '')}</small></td>
        <td>${statusBadge(t.Status)}</td>
        <td>${esc(t.Assignee || '—')}</td>
        <td>${esc(t.Due_Date || '—')}</td>
        <td>${esc(t.Closed_Date || '—')}</td>
        <td class="inline-editable" onclick="inlineEditCost(this, ${t.Id}, ${t.Cost || 0}, '${esc(t.Currency || 'USD')}')" title="Click to edit" style="cursor:pointer; font-weight:bold; color:var(--success);">
          ${costDisplay}
        </td>
        <td class="inline-editable" onclick="inlineEditBonus(this, ${t.Id}, ${t.Bonus || 0}, '${esc(t.Currency || 'USD')}')" title="Click to edit" style="cursor:pointer;">
          ${bonusDisplay}
        </td>
        <td style="max-width:120px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(t.Bonus_Reason || '')}">${esc(t.Bonus_Reason || '—')}</td>
        <td>
          <span class="payment-badge ${(!t.Payment_Status || t.Payment_Status === 'Unpaid') ? 'payment-unpaid' : 'payment-paid'}" 
            onclick="togglePaymentStatus(${t.Id}, '${t.Payment_Status || 'Unpaid'}')" 
            title="Click to toggle" style="cursor:pointer;">
            ${(!t.Payment_Status || t.Payment_Status === 'Unpaid') ? '🔴 Pending' : '🟢 Done'}
          </span>
        </td>
        <td style="max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${esc(t.Notes || '')}">${esc(t.Notes || '—')}</td>
        <td class="action-btns">
          <button class="btn btn-sm btn-secondary" onclick='editPMTracking(${JSON.stringify(t).replace(/'/g, "&apos;")})'>✏️ Edit</button>
        </td>
      </tr>
    `}).join('');
  } catch (err) {
    console.error('Load PM tracking failed:', err);
  }
}

function populatePMFilters(data) {
  // Populate Assignee filter
  const assigneeSelect = document.getElementById('pm-filter-assignee');
  const currentAssignee = assigneeSelect?.value || '';
  const assignees = [...new Set(data.map(t => t.Assignee).filter(Boolean))].sort();
  if (assigneeSelect && assigneeSelect.options.length <= 1) {
    assignees.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a; opt.textContent = a;
      if (a === currentAssignee) opt.selected = true;
      assigneeSelect.appendChild(opt);
    });
  }

  // Populate Status filter
  const statusSelect = document.getElementById('pm-filter-status');
  const currentStatus = statusSelect?.value || '';
  const statuses = [...new Set(data.map(t => t.Status).filter(Boolean))].sort();
  if (statusSelect && statusSelect.options.length <= 1) {
    statuses.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s.toUpperCase();
      if (s === currentStatus) opt.selected = true;
      statusSelect.appendChild(opt);
    });
  }

  // Populate Job Type filter
  const jobTypeSelect = document.getElementById('pm-filter-jobtype');
  const currentJobType = jobTypeSelect?.value || '';
  const jobTypes = [...new Set(data.map(t => t.Job_Type).filter(Boolean))].sort();
  if (jobTypeSelect && jobTypeSelect.options.length <= 1) {
    jobTypes.forEach(j => {
      const opt = document.createElement('option');
      opt.value = j; opt.textContent = j;
      if (j === currentJobType) opt.selected = true;
      jobTypeSelect.appendChild(opt);
    });
  }
}

async function inlineEditCost(td, id, currentVal, currency) {
  if (td.querySelector('input')) return; // Already editing
  const input = document.createElement('input');
  input.type = 'number';
  input.step = '0.01';
  input.value = currentVal;
  input.style.cssText = 'width:80px; padding:4px; font-size:13px; border:1px solid var(--primary); border-radius:4px; background:var(--bg); color:var(--text);';
  td.textContent = '';
  td.appendChild(input);
  input.focus();
  input.select();

  const save = async () => {
    const newVal = parseFloat(input.value) || 0;
    try {
      await apiFetch(`${API}/api/pm-tracking/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Cost: newVal })
      });
      loadPMTracking();
    } catch (err) { console.error('Cost update failed:', err); }
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } if (e.key === 'Escape') { loadPMTracking(); } });
}

async function inlineEditBonus(td, id, currentVal, currency) {
  if (td.querySelector('input')) return;
  // Create container for bonus amount + reason
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex; flex-direction:column; gap:4px;';

  const amountInput = document.createElement('input');
  amountInput.type = 'number';
  amountInput.step = '0.01';
  amountInput.value = currentVal;
  amountInput.placeholder = 'Bonus $';
  amountInput.style.cssText = 'width:80px; padding:4px; font-size:13px; border:1px solid var(--primary); border-radius:4px; background:var(--bg); color:var(--text);';

  wrapper.appendChild(amountInput);
  td.textContent = '';
  td.appendChild(wrapper);
  amountInput.focus();
  amountInput.select();

  const save = async () => {
    const newVal = parseFloat(amountInput.value) || 0;
    const reason = prompt('Lý do bonus:') || '';
    try {
      await apiFetch(`${API}/api/pm-tracking/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Bonus: newVal, Bonus_Reason: reason })
      });
      loadPMTracking();
    } catch (err) { console.error('Bonus update failed:', err); }
  };
  amountInput.addEventListener('blur', save);
  amountInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); amountInput.blur(); } if (e.key === 'Escape') { loadPMTracking(); } });
}

function editPMTracking(taskData) {
  openModal('pm-tracking', taskData);
}

async function updatePaymentStatus(id, newStatus) {
  try {
    const res = await apiFetch(`${API}/api/pm-tracking/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ Payment_Status: newStatus }),
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error('Update failed');
    loadPMTracking();
  } catch (err) {
    alert('Failed to update payment status: ' + err.message);
    loadPMTracking();
  }
}

async function togglePaymentStatus(id, currentStatus) {
  const newStatus = (!currentStatus || currentStatus === 'Unpaid') ? 'Paid' : 'Unpaid';
  await updatePaymentStatus(id, newStatus);
}

// ─── Refresh PM from ClickUp ──────────────────
async function refreshPMFromClickUp() {
  const btn = document.getElementById('btn-pm-sync');
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Syncing...';
  try {
    const res = await apiFetch(`${API}/api/pm-tracking/refresh`, { method: 'POST' });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Refresh failed');
    btn.textContent = `✅ ${result.total} tasks synced`;
    if (result.errors && result.errors.length > 0) {
      alert('Some configs had errors:\n' + result.errors.map(e => `${e.config}: ${e.error}`).join('\n'));
    }
    loadPMTrackingConfigs();
    loadPMTracking();
  } catch (err) {
    alert('Refresh failed: ' + err.message);
    btn.textContent = origText;
  } finally {
    btn.disabled = false;
    setTimeout(() => { btn.textContent = origText; }, 3000);
  }
}

// ─── Monthly Invoice ──────────────────────────
async function generateInvoice() {
  const container = document.getElementById('invoice-container');
  const month = document.getElementById('invoice-month')?.value;
  const assignee = document.getElementById('invoice-assignee')?.value;

  if (!month) {
    alert('Vui lòng chọn tháng!');
    return;
  }

  container.innerHTML = `<div style="padding:40px; text-align:center;">
    <div style="display:inline-block; width:32px; height:32px; border:3px solid var(--primary); border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
    <p style="margin-top:12px; color:var(--text-muted);">Đang tạo hoá đơn...</p>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  </div>`;

  try {
    let url = `${API}/api/pm-tracking/invoice?month=${encodeURIComponent(month)}`;
    if (assignee) url += `&assignee=${encodeURIComponent(assignee)}`;

    const res = await apiFetch(url);
    const { invoices } = await res.json();

    if (!invoices || Object.keys(invoices).length === 0) {
      container.innerHTML = `<div style="padding:50px; text-align:center;">
        <div style="font-size:48px; margin-bottom:12px;">📭</div>
        <div style="font-size:16px; font-weight:600; color:var(--text); margin-bottom:4px;">Không có task nào cần thanh toán</div>
        <div style="font-size:13px; color:var(--text-muted);">Tất cả tasks đã thanh toán, hoặc chưa có task nào closed trong tháng này.</div>
      </div>`;
      return;
    }

    // Populate assignee dropdown
    const assigneeSelect = document.getElementById('invoice-assignee');
    const currentVal = assigneeSelect.value;
    const existingOpts = new Set(Array.from(assigneeSelect.options).map(o => o.value));
    Object.keys(invoices).forEach(name => {
      if (!existingOpts.has(name)) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        assigneeSelect.appendChild(opt);
        existingOpts.add(name);
      }
    });
    assigneeSelect.value = currentVal;

    // Parse month
    const [yyyy, mm] = month.split('-');
    const monthNames = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
    const monthDisplay = `${monthNames[parseInt(mm) - 1]}, ${yyyy}`;

    // Summary stats — group by currency
    let allTaskCount = 0;
    let totalUSD = 0, totalVND = 0;
    Object.values(invoices).forEach(inv => {
      allTaskCount += inv.tasks.length;
      if (inv.currency === 'VND') totalVND += inv.grandTotal;
      else totalUSD += inv.grandTotal;
    });

    const fmtUSD = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    const fmtVND = (val) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

    // Build total display — show both currencies if mixed
    let totalDisplay = '';
    if (totalUSD > 0 && totalVND > 0) {
      totalDisplay = `<div style="font-size:20px; font-weight:800; color:var(--primary);">${fmtUSD(totalUSD)}</div>
        <div style="font-size:18px; font-weight:700; color:var(--primary); margin-top:4px;">${fmtVND(totalVND)}</div>`;
    } else if (totalVND > 0) {
      totalDisplay = `<div style="font-size:24px; font-weight:800; color:var(--primary);">${fmtVND(totalVND)}</div>`;
    } else {
      totalDisplay = `<div style="font-size:24px; font-weight:800; color:var(--primary);">${fmtUSD(totalUSD)}</div>`;
    }

    let html = `
    <!-- Summary Bar -->
    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-bottom:24px;">
      <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:12px; padding:20px; text-align:center;">
        <div style="font-size:28px; font-weight:800; color:var(--primary);">${Object.keys(invoices).length}</div>
        <div style="font-size:12px; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-top:4px;">Assignees</div>
      </div>
      <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:12px; padding:20px; text-align:center;">
        <div style="font-size:28px; font-weight:800; color:var(--primary);">${allTaskCount}</div>
        <div style="font-size:12px; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-top:4px;">Tasks Pending</div>
      </div>
      <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:12px; padding:20px; text-align:center;">
        ${totalDisplay}
        <div style="font-size:12px; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-top:4px;">Tổng thanh toán</div>
      </div>
    </div>`;

    // Invoice cards per assignee
    html += Object.entries(invoices).map(([assigneeName, inv]) => {
      const fmt = (val) => inv.currency === 'VND'
        ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val)
        : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

      const taskIds = inv.tasks.map(t => t.Id);
      const overdueCount = inv.tasks.filter(t => t.Closed_Date && t.Closed_Date < `${yyyy}-${mm}-01`).length;

      const rows = inv.tasks.map((t, i) => {
        const cost = parseFloat(t.Cost) || 0;
        const bonus = parseFloat(t.Bonus) || 0;
        const closedDate = t.Closed_Date || '—';
        const isOverdue = t.Closed_Date && t.Closed_Date < `${yyyy}-${mm}-01`;
        const rowBg = i % 2 === 0 ? 'background:var(--bg-table-stripe);' : '';
        return `<tr style="${rowBg}">
          <td style="padding:10px 14px; font-size:12px; color:var(--text-muted);">${i + 1}</td>
          <td style="padding:10px 14px; font-size:13px; font-weight:500;">${esc(t.Task_Name || '—')}</td>
          <td style="padding:10px 14px;"><span style="background:var(--primary-light); color:var(--primary); padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600;">${esc(t.Job_Type || '—')}</span></td>
          <td style="padding:10px 14px; font-size:13px;">${closedDate}${isOverdue ? ' <span style="background:rgba(245,158,11,0.15); color:#F59E0B; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:600;">OVERDUE</span>' : ''}</td>
          <td style="padding:10px 14px; text-align:right; font-weight:600; font-size:13px;">${fmt(cost)}</td>
          <td style="padding:10px 14px; text-align:right; font-size:13px; color:${bonus > 0 ? 'var(--success)' : 'var(--text-muted)'};">${bonus > 0 ? '+' + fmt(bonus) : '—'}</td>
          <td style="padding:10px 14px; font-size:12px; color:var(--text-muted); max-width:120px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(t.Bonus_Reason || '')}">${esc(t.Bonus_Reason || '—')}</td>
          <td style="padding:10px 14px; font-size:12px; color:var(--text-muted); max-width:150px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(t.Notes || '')}">${esc(t.Notes || '—')}</td>
          <td style="padding:10px 14px; text-align:right; font-weight:700; font-size:13px;">${fmt(cost + bonus)}</td>
        </tr>`;
      }).join('');

      return `
      <div class="invoice-card" id="invoice-${esc(assigneeName)}" style="margin-bottom:28px;">
        <div class="invoice-content" style="background:var(--bg-card); border:1px solid var(--border); border-radius:16px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.08);">
          
          <!-- Gradient Header with Logo -->
          <div style="background:linear-gradient(135deg, var(--primary), #F97316); padding:20px 24px; color:#fff;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="display:flex; align-items:center; gap:14px;">
                <img src="td-games-logo.png" alt="TD Games" style="width:44px; height:44px; object-fit:contain; filter:brightness(0) invert(1); opacity:0.9;">
                <div>
                  <div style="font-size:11px; text-transform:uppercase; letter-spacing:2px; opacity:0.85;">Payment Invoice</div>
                  <div style="font-size:22px; font-weight:800; margin-top:4px;">${esc(assigneeName)}</div>
                </div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:12px; opacity:0.85;">${monthDisplay}</div>
                <div style="font-size:24px; font-weight:800; margin-top:2px;">${inv.tasks.length} <span style="font-size:13px; font-weight:400;">tasks</span></div>
                <div style="font-size:11px; opacity:0.7; margin-top:2px;">${inv.currency === 'VND' ? '🇻🇳 VNĐ' : '🇺🇸 USD'}</div>
              </div>
            </div>
            ${overdueCount > 0 ? `<div style="margin-top:10px; background:rgba(255,255,255,0.2); padding:6px 12px; border-radius:8px; font-size:12px; display:inline-block;">⚠️ ${overdueCount} task từ tháng trước chưa thanh toán</div>` : ''}
          </div>

          <!-- Task Table -->
          <div style="padding:0;">
            <table style="width:100%; border-collapse:collapse;">
              <thead>
                <tr style="border-bottom:2px solid var(--border);">
                  <th style="padding:12px 14px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:var(--text-muted); font-weight:700;">#</th>
                  <th style="padding:12px 14px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:var(--text-muted); font-weight:700;">Task Name</th>
                  <th style="padding:12px 14px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:var(--text-muted); font-weight:700;">Type</th>
                  <th style="padding:12px 14px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:var(--text-muted); font-weight:700;">Closed</th>
                  <th style="padding:12px 14px; text-align:right; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:var(--text-muted); font-weight:700;">Cost</th>
                  <th style="padding:12px 14px; text-align:right; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:var(--text-muted); font-weight:700;">Bonus</th>
                  <th style="padding:12px 14px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:var(--text-muted); font-weight:700;">Bonus Note</th>
                  <th style="padding:12px 14px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:var(--text-muted); font-weight:700;">Notes</th>
                  <th style="padding:12px 14px; text-align:right; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:var(--text-muted); font-weight:700;">Subtotal</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>

          <!-- Footer Totals -->
          <div style="padding:20px 24px; border-top:2px solid var(--border); background:var(--bg-table-head);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="display:flex; gap:32px; font-size:13px;">
                <div>
                  <span style="color:var(--text-muted);">Cost</span>
                  <div style="font-weight:700; font-size:15px; margin-top:2px;">${fmt(inv.totalCost)}</div>
                </div>
                <div>
                  <span style="color:var(--text-muted);">Bonus</span>
                  <div style="font-weight:700; font-size:15px; margin-top:2px; color:var(--success);">${fmt(inv.totalBonus)}</div>
                </div>
              </div>
              <div style="background:linear-gradient(135deg, var(--primary), #F97316); color:#fff; padding:12px 28px; border-radius:10px; text-align:center;">
                <div style="font-size:11px; text-transform:uppercase; letter-spacing:1px; opacity:0.9;">Grand Total</div>
                <div style="font-size:22px; font-weight:800;">${fmt(inv.grandTotal)}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div style="display:flex; gap:10px; margin-top:14px; justify-content:flex-end;" class="invoice-actions">
          <button class="btn btn-secondary btn-sm" onclick="exportInvoicePNG('invoice-${esc(assigneeName)}', '${esc(assigneeName)}', '${month}')" style="padding:8px 16px;">📸 Export PNG</button>
          <button class="btn btn-primary btn-sm" onclick="markInvoicePaid([${taskIds.join(',')}])" style="padding:8px 16px;">✅ Mark All Paid</button>
        </div>
      </div>`;
    }).join('');

    container.innerHTML = html;

  } catch (err) {
    console.error('Generate invoice error:', err);
    container.innerHTML = `<div style="padding:40px; text-align:center;">
      <div style="font-size:48px; margin-bottom:12px;">❌</div>
      <div style="font-size:15px; color:var(--danger);">${err.message}</div>
    </div>`;
  }
}

async function exportInvoicePNG(cardId, assigneeName, month) {
  const card = document.getElementById(cardId);
  if (!card) return;

  const content = card.querySelector('.invoice-content');
  if (!content) return;

  try {
    const canvas = await html2canvas(content, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      logging: false
    });

    const link = document.createElement('a');
    link.download = `invoice_${assigneeName}_${month}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    alert('Export failed: ' + err.message);
    console.error('Export PNG error:', err);
  }
}

async function markInvoicePaid(taskIds) {
  if (!confirm(`Đánh dấu ${taskIds.length} tasks là Done?`)) return;

  try {
    const res = await apiFetch(`${API}/api/pm-tracking/invoice/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskIds })
    });
    if (!res.ok) throw new Error('Mark paid failed');
    alert(`✅ Đã cập nhật ${taskIds.length} tasks thành Done!`);
    loadPMTracking();
    generateInvoice(); // refresh invoice
  } catch (err) {
    alert('Lỗi: ' + err.message);
    console.error('Mark paid error:', err);
  }
}

// ─── PM Tracking Configs ──────────────────────
async function loadPMTrackingConfigs() {
  try {
    const res = await apiFetch(`${API}/api/pm-tracking-configs`);
    const { data } = await res.json();
    const tbody = document.getElementById('pm-configs-body');
    if (!tbody) return;

    // Populate filter dropdown
    const filterSelect = document.getElementById('pm-filter-config');
    if (filterSelect) {
      const currentVal = filterSelect.value;
      filterSelect.innerHTML = '<option value="">-- All Configs --</option>' +
        (data || []).map(c => `<option value="${esc(c.Title)}" ${currentVal === c.Title ? 'selected' : ''}>${esc(c.Title)}</option>`).join('');
    }

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No PM configs yet. Click "+ Add PM Config" to start tracking.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map((c) => {
      const isPaused = c.Enabled === 'Paused';
      const toggleIcon = isPaused ? '▶️' : '⏸️';
      const typeIcon = c.ClickUp_Type === 'space' ? '🌐' : c.ClickUp_Type === 'folder' ? '📁' : '📋';
      return `
        <tr style="${isPaused ? 'opacity: 0.55;' : ''}">
          <td><strong>${esc(c.Title || '—')}</strong></td>
          <td>${typeIcon} ${esc(c.ClickUp_Type || '—')}</td>
          <td><code>${esc(c.ClickUp_ID || '—')}</code></td>
          <td><strong>${esc(c.Job_Type || '—')}</strong></td>
          <td>${statusBadge(isPaused ? 'paused' : 'active')}</td>
          <td class="action-btns">
            <button class="btn btn-sm ${isPaused ? 'btn-success' : 'btn-warning'}" onclick="togglePMConfigStatus(${c.Id}, '${c.Enabled || 'Active'}')" title="${isPaused ? 'Activate' : 'Pause'}">${toggleIcon}</button>
            <button class="btn btn-sm btn-primary" onclick='openModal("pm-config", ${JSON.stringify(c).replace(/'/g, "&apos;")})'>✏️</button>
            <button class="btn btn-sm btn-danger" onclick="deletePMConfig(${c.Id})">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Load PM tracking configs failed:', err);
  }
}

async function togglePMConfigStatus(id, currentStatus) {
  const newStatus = currentStatus === 'Paused' ? 'Active' : 'Paused';
  try {
    await apiFetch(`${API}/api/pm-tracking-configs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Enabled: newStatus }),
    });
    loadPMTrackingConfigs();
  } catch (err) {
    alert('Toggle failed: ' + err.message);
  }
}

async function deletePMConfig(id) {
  if (!confirm('Delete this PM config? Tracking will stop for these tasks.')) return;
  try {
    await apiFetch(`${API}/api/pm-tracking-configs/${id}`, { method: 'DELETE' });
    loadPMTrackingConfigs();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

// ─── Logs ─────────────────────────────────────
let allCustomers = [];
let allProjects = [];

async function fetchDropdownData() {
  try {
    const [cRes, pRes] = await Promise.all([
      apiFetch(`${API}/api/customers`),
      apiFetch(`${API}/api/projects`)
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

    const res = await apiFetch(url);
    const { data } = await res.json();
    renderMessagesTable('logs-body', data || []);
  } catch (err) {
    console.error('Load logs failed:', err);
  }
}

function renderMessagesTable(tbodyId, messages) {
  const tbody = document.getElementById(tbodyId);
  if (!messages.length) {
    const colspan = tbodyId === 'logs-body' ? 8 : 6;
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="empty-state">No sync messages yet.</td></tr>`;
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
      ${tbodyId === 'logs-body' ? `<td>${statusBadge((m.Action_By === 'System' ? 'System' : (m.Action_By || 'System')).toLowerCase(), m.Action_By || 'System')}</td>` : ''}
      <td>${statusBadge(m.Status)}</td>
    </tr>
  `).join('');
}

// ─── Settings ─────────────────────────────────
async function loadSettings() {
  try {
    const res = await apiFetch(`${API}/health`);
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

// ─── List Mappings ────────────────────────────
async function loadListMappings() {
  try {
    console.log('[List Mappings] Loading list mappings API...');
    const res = await apiFetch(`${API}/api/list-mappings`);
    const payload = await res.json();
    console.log('[List Mappings] API response payload:', payload);
    const data = payload.data;

    const tbody = document.getElementById('list-mappings-body');
    if (!tbody) {
      console.error('[List Mappings] Fatal error: tbody list-mappings-body not found');
      return;
    }

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No list mappings configured yet. Click "+ Add Mapping" to set auto-sync for a ClickUp List.</td></tr>';
      return;
    }

    console.log('[List Mappings] Found records, fetching dropdowns...');
    await fetchDropdownData();
    const custMap = new Map(allCustomers.map(c => [c.Id, c.Title]));
    const projMap = new Map(allProjects.map(p => [p.Id, p.Title]));

    console.log('[List Mappings] Drawing table...');
    tbody.innerHTML = data.map((m) => {
      const listId = m.ClickUp_List_ID || m.List_ID || '';
      const custVal = typeof m.Customer_Id === 'object' && m.Customer_Id !== null ? (m.Customer_Id.Title || m.Customer_Id.Id) : (custMap.get(m.Customer_Id) || m.Customer_Id);
      const projVal = typeof m.Project_Id === 'object' && m.Project_Id !== null ? (m.Project_Id.Title || m.Project_Id.Id) : (projMap.get(m.Project_Id) || m.Project_Id);
      const isPaused = m.Enabled === 'Paused';
      const toggleIcon = isPaused ? '▶️' : '⏸️';
      const toggleTitle = isPaused ? 'Activate' : 'Pause';

      return `
          <tr style="${isPaused ? 'opacity: 0.55;' : ''}">
            <td><code>${esc(listId || '—')}</code></td>
            <td><strong>${esc(m.Job_Type || '—')}</strong></td>
            <td><code>${esc(m.Slack_Channel_ID || '—')}</code></td>
            <td>${esc(m.Slack_Review_User_IDs || '—')}</td>
            <td><code>${esc(m.Discord_Channel_ID || '—')}</code></td>
            <td>${esc(m.Discord_Review_User_IDs || '—')}</td>
            <td>${esc(custVal || '—')}</td>
            <td>${esc(projVal || '—')}</td>
            <td>${statusBadge(isPaused ? 'paused' : 'active')}</td>
            <td class="action-btns">
              <button class="btn btn-sm ${isPaused ? 'btn-success' : 'btn-warning'}" onclick="toggleListMappingStatus(${m.Id}, '${m.Enabled || 'Active'}')" title="${toggleTitle}">${toggleIcon}</button>
              <button class="btn btn-sm btn-primary" onclick='openModal("list-mapping", ${JSON.stringify(m).replace(/'/g, "&apos;")})'>✏️</button>
              <button class="btn btn-sm btn-danger" onclick="deleteListMapping(${m.Id})">🗑️</button>
            </td>
          </tr>
        `;
    }).join('');
    console.log('[List Mappings] Done loadListMappings.');
  } catch (err) {
    console.error('Load list mappings failed:', err);
    const tbody = document.getElementById('list-mappings-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="empty-state badge-error">Error loading mappings: ${err.message}</td></tr>`;
  }
}

async function deleteListMapping(id) {
  if (!confirm('Delete this mapping? Auto-sync will stop for this ClickUp List.')) return;
  try {
    await apiFetch(`${API}/api/list-mappings/${id}`, { method: 'DELETE' });
    loadListMappings();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

async function toggleListMappingStatus(id, currentStatus) {
  const newStatus = currentStatus === 'Paused' ? 'Active' : 'Paused';
  try {
    await apiFetch(`${API}/api/list-mappings/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Enabled: newStatus }),
    });
    loadListMappings();
  } catch (err) {
    alert('Toggle failed: ' + err.message);
  }
}

// ─── Name Mappings ────────────────────────────
async function loadNameMappings() {
  try {
    const res = await apiFetch(`${API}/api/name-mappings`);
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
    await apiFetch(`${API}/api/name-mappings/${id}`, { method: 'DELETE' });
    loadNameMappings();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

// ─── Customers ────────────────────────────────
async function loadCustomers() {
  try {
    const res = await apiFetch(`${API}/api/customers`);
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
    await apiFetch(`${API}/api/customers/${id}`, { method: 'DELETE' });
    loadCustomers();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

// ─── Projects ─────────────────────────────────
async function loadProjects() {
  try {
    const res = await apiFetch(`${API}/api/projects`);
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
    await apiFetch(`${API}/api/projects/${id}`, { method: 'DELETE' });
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
          <option value="studio\u2192client" ${editData?.Sync_Direction === 'studio\u2192client' ? 'selected' : ''}>Studio \u2192 Client</option>
          <option value="client\u2192studio" ${editData?.Sync_Direction === 'client\u2192studio' ? 'selected' : ''}>Client \u2192 Studio</option>
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
  } else if (type === 'list-mapping') {
    title.textContent = editData ? 'Edit List Mapping' : 'Add List Mapping';
    const listIdVal = editData?.ClickUp_List_ID || editData?.List_ID || '';
    const custIdVal = typeof editData?.Customer_Id === 'object' ? editData?.Customer_Id?.Id : editData?.Customer_Id;
    const projIdVal = typeof editData?.Project_Id === 'object' ? editData?.Project_Id?.Id : editData?.Project_Id;

    // Rebuild customerOptions and projectOptions with selection
    const customerOpts = allCustomers.map(c => `<option value="${c.Id}" ${custIdVal == c.Id ? 'selected' : ''}>${esc(c.Title)}</option>`).join('');
    const projectOpts = allProjects.map(p => `<option value="${p.Id}" ${projIdVal == p.Id ? 'selected' : ''}>${esc(p.Title)}</option>`).join('');

    body.innerHTML = `
      <div class="form-group">
        <label>ClickUp List ID</label>
        <input type="text" name="List_ID" placeholder="e.g., 901815849460" value="${esc(listIdVal)}" required>
        <span class="help">The ID from the ClickUp URL when viewing a List</span>
      </div>
      <div class="form-group">
        <label>Slack Channel ID</label>
        <input type="text" name="Slack_Channel_ID" placeholder="e.g., C012345678" value="${esc(editData?.Slack_Channel_ID || '')}">
        <span class="help">The Slack channel to create the auto thread in</span>
      </div>
      <div class="form-group">
        <label>Slack Users to Ping (Review)</label>
        <input type="text" name="Slack_Review_User_IDs" placeholder="e.g., <@U0123> <@U0456>" value="${esc(editData?.Slack_Review_User_IDs || '')}">
        <span class="help">Slack IDs of users to tag when status → CLIENT_REVIEW</span>
      </div>
      <div class="form-group">
        <label>Discord Channel ID</label>
        <input type="text" name="Discord_Channel_ID" placeholder="e.g., 1234567890123456789" value="${esc(editData?.Discord_Channel_ID || '')}">
        <span class="help">Enable Developer Mode → Right-click channel → Copy Channel ID</span>
      </div>
      <div class="form-group">
        <label>Discord Users to Ping (Review)</label>
        <input type="text" name="Discord_Review_User_IDs" placeholder="e.g., <@123456789> <@987654321>" value="${esc(editData?.Discord_Review_User_IDs || '')}">
        <span class="help">Discord IDs of users to ping when status → CLIENT_REVIEW</span>
      </div>
      <div class="form-group">
        <label>Customer</label>
        <select name="Customer_Id" required>
          <option value="">-- Select Customer --</option>
          ${customerOpts}
        </select>
      </div>
      <div class="form-group">
        <label>Project</label>
        <select name="Project_Id">
          <option value="">-- None --</option>
          ${projectOpts}
        </select>
      </div>
      <div class="form-group">
        <label>Job Type</label>
        <select name="Job_Type">
          <option value="" ${!editData?.Job_Type ? 'selected' : ''}>-- None (No PM Tracking) --</option>
          <option value="Art" ${editData?.Job_Type === 'Art' ? 'selected' : ''}>Art</option>
          <option value="Animation" ${editData?.Job_Type === 'Animation' ? 'selected' : ''}>Animation</option>
        </select>
        <span class="help">Set Job Type to enable PM Finance Tracking for tasks in this list</span>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select name="Enabled">
          <option value="Active" ${!editData?.Enabled || editData?.Enabled === 'Active' ? 'selected' : ''}>Active</option>
          <option value="Paused" ${editData?.Enabled === 'Paused' ? 'selected' : ''}>Paused</option>
        </select>
      </div>
    `;
  } else if (type === 'pm-config') {
    title.textContent = editData ? 'Edit PM Config' : 'Add PM Config';
    body.innerHTML = `
      <div class="form-group">
        <label>Title</label>
        <input type="text" name="Title" placeholder="e.g., KABAM Art Tracking" value="${esc(editData?.Title || '')}" required>
      </div>
      <div class="form-group">
        <label>ClickUp Type</label>
        <select name="ClickUp_Type" required>
          <option value="list" ${editData?.ClickUp_Type === 'list' || !editData?.ClickUp_Type ? 'selected' : ''}>📋 List</option>
          <option value="folder" ${editData?.ClickUp_Type === 'folder' ? 'selected' : ''}>📁 Folder</option>
          <option value="space" ${editData?.ClickUp_Type === 'space' ? 'selected' : ''}>🌐 Space</option>
        </select>
        <span class="help">Choose the level to track: Space (all tasks), Folder (tasks in folder), or List (specific list)</span>
      </div>
      <div class="form-group">
        <label>ClickUp ID</label>
        <input type="text" name="ClickUp_ID" placeholder="e.g., 901815849460" value="${esc(editData?.ClickUp_ID || '')}" required>
        <span class="help">The ID from the ClickUp URL of the Space, Folder, or List</span>
      </div>
      <div class="form-group">
        <label>Job Type</label>
        <input type="text" name="Job_Type" placeholder="e.g., Art, Animation, 3D Modeling, VFX..." value="${esc(editData?.Job_Type || '')}" required>
        <span class="help">Free text — enter any job type for categorization</span>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select name="Enabled">
          <option value="Active" ${!editData?.Enabled || editData?.Enabled === 'Active' ? 'selected' : ''}>Active</option>
          <option value="Paused" ${editData?.Enabled === 'Paused' ? 'selected' : ''}>Paused</option>
        </select>
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
  } else if (type === 'pm-tracking') {
    title.textContent = 'Edit PM Tracking: ' + (esc(editData?.Task_Name) || '');
    body.innerHTML = `
      <div class="form-group" style="margin-bottom: 15px;">
        <label>Task Status (Synced from ClickUp)</label>
        <div>${statusBadge(editData?.Status, editData?.Status)}</div>
      </div>
      <div class="form-group">
        <label>Currency</label>
        <select name="Currency">
          <option value="USD" ${editData?.Currency === 'USD' || !editData?.Currency ? 'selected' : ''}>USD</option>
          <option value="VND" ${editData?.Currency === 'VND' ? 'selected' : ''}>VND</option>
        </select>
      </div>
      <div class="form-group">
        <label>Cost</label>
        <input type="number" step="0.01" name="Cost" placeholder="0.00" value="${editData?.Cost || ''}">
      </div>
      <div class="form-group">
        <label>Payment Status</label>
        <select name="Payment_Status">
          <option value="Unpaid" ${!editData?.Payment_Status || editData?.Payment_Status === 'Unpaid' ? 'selected' : ''}>Pending</option>
          <option value="Paid" ${editData?.Payment_Status === 'Paid' || editData?.Payment_Status === 'Fully Paid' || editData?.Payment_Status === 'Advance Paid' ? 'selected' : ''}>Done</option>
        </select>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea name="Notes" rows="3" placeholder="Additional notes...">${esc(editData?.Notes || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Bonus</label>
        <input type="number" step="0.01" name="Bonus" placeholder="0.00" value="${editData?.Bonus || ''}">
      </div>
      <div class="form-group">
        <label>Bonus Reason</label>
        <input type="text" name="Bonus_Reason" placeholder="Reason for the bonus..." value="${esc(editData?.Bonus_Reason || '')}">
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
    } else if (currentModalType === 'list-mapping') {
      endpoint = 'list-mappings';
      method = currentEditId ? 'PUT' : 'POST';
      url = currentEditId ? `${API}/api/${endpoint}/${currentEditId}` : `${API}/api/${endpoint}`;
    } else if (currentModalType === 'customer') {
      endpoint = 'customers';
      method = 'POST';
      url = `${API}/api/${endpoint}`;
    } else if (currentModalType === 'project') {
      endpoint = 'projects';
      method = 'POST';
      url = `${API}/api/${endpoint}`;
    } else if (currentModalType === 'pm-config') {
      endpoint = 'pm-tracking-configs';
      method = currentEditId ? 'PUT' : 'POST';
      url = currentEditId ? `${API}/api/${endpoint}/${currentEditId}` : `${API}/api/${endpoint}`;
    } else if (currentModalType === 'pm-tracking') {
      endpoint = 'pm-tracking';
      method = 'PUT'; // Only update is allowed via UI
      url = `${API}/api/${endpoint}/${currentEditId}`;
      if (data.Cost) data.Cost = parseFloat(data.Cost);
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

    await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    closeModal();
    if (currentModalType === 'chat') loadSyncConfigs();
    else if (currentModalType === 'drive') loadDriveConfigs();
    else if (currentModalType === 'name-mapping') loadNameMappings();
    else if (currentModalType === 'list-mapping') loadListMappings();
    else if (currentModalType === 'customer') loadCustomers();
    else if (currentModalType === 'project') loadProjects();
    else if (currentModalType === 'pm-config') loadPMTrackingConfigs();
    else if (currentModalType === 'pm-tracking') loadPMTracking();
  } catch (err) {
    alert('Save failed: ' + err.message);
  }
}

async function deleteListMapping(id) {
  if (!confirm('Are you sure you want to delete this list mapping?')) return;
  try {
    await apiFetch(`${API}/api/list-mappings/${id}`, { method: 'DELETE' });
    loadListMappings();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

// ─── Health Check ─────────────────────────────
async function checkServerStatus() {
  try {
    const res = await apiFetch(`${API}/health`);
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

function statusBadge(status, label = null) {
  const map = {
    active: 'success',
    success: 'success',
    paused: 'warning',
    pending: 'warning',
    error: 'error',
    failed: 'error',
    system: 'info',
    admin: 'success'
  };
  const type = map[status] || 'info';
  return `<span class="badge badge-${type}">${esc(label || status || 'unknown')}</span>`;
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
checkAuth();
setInterval(() => {
  if (authToken) checkServerStatus();
}, 30000); // Check every 30s
