const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nocodb = require('./nocodb');
const config = require('./config');
const { authMiddleware, JWT_SECRET } = require('./middleware/auth');

const router = express.Router();

// Apply auth middleware to all routes except /login
router.use(authMiddleware);

// ─── Authentication ────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const account = await nocodb.getAccountByUsername(username);

        if (!account) {
            return res.status(401).json({ error: 'Invalid origin or password' });
        }

        // Support both bcrypt hashed and legacy plaintext passwords
        let passwordValid = false;
        if (account.Password.startsWith('$2a$') || account.Password.startsWith('$2b$')) {
            passwordValid = await bcrypt.compare(password, account.Password);
        } else {
            // Legacy plaintext fallback — will be removed after migration
            passwordValid = account.Password === password;
        }

        if (!passwordValid) {
            return res.status(401).json({ error: 'Invalid origin or password' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: account.Id, username: account.Username, name: account['Display Name'] },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            user: { username: account.Username, name: account['Display Name'] }
        });
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


/**
 * Auto-convert Slack thread_ts from link format to API format.
 * e.g., "p1772018065000939" → "1772018065.000939"
 * e.g., "https://xxx.slack.com/archives/C08/p1772018065000939" → "1772018065.000939"
 */
function normalizeThreadTs(value) {
    if (!value) return value;
    // Extract from URL if full link pasted
    const urlMatch = value.match(/\/p(\d{10})(\d{6})/);
    if (urlMatch) return `${urlMatch[1]}.${urlMatch[2]}`;
    // Handle raw p-format
    const pMatch = value.match(/^p(\d{10})(\d{6})$/);
    if (pMatch) return `${pMatch[1]}.${pMatch[2]}`;
    return value;
}

// ─── Customers ─────────────────────────────
router.get('/customers', async (req, res) => {
    try {
        const configs = await nocodb.getCustomers();
        res.json({ data: configs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/customers', async (req, res) => {
    try {
        const result = await nocodb.createCustomer(req.body);
        res.json({ data: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.delete('/customers/:id', async (req, res) => {
    try {
        await nocodb.deleteCustomer(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Projects ──────────────────────────────
router.get('/projects', async (req, res) => {
    try {
        const configs = await nocodb.getProjects();
        res.json({ data: configs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/projects', async (req, res) => {
    try {
        const result = await nocodb.createProject(req.body);
        res.json({ data: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.delete('/projects/:id', async (req, res) => {
    try {
        await nocodb.deleteProject(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Sync Configs ─────────────────────────────

router.get('/sync-configs', async (req, res) => {
    try {
        const configs = await nocodb.getSyncConfigs();
        res.json({ data: configs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/sync-configs', async (req, res) => {
    try {
        if (req.body.Slack_Thread_TS) req.body.Slack_Thread_TS = normalizeThreadTs(req.body.Slack_Thread_TS);
        const result = await nocodb.createSyncConfig(req.body);
        res.json({ data: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/sync-configs/:id', async (req, res) => {
    try {
        if (req.body.Slack_Thread_TS) req.body.Slack_Thread_TS = normalizeThreadTs(req.body.Slack_Thread_TS);
        const result = await nocodb.updateSyncConfig(parseInt(req.params.id), req.body);
        res.json({ data: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/sync-configs/:id', async (req, res) => {
    try {
        await nocodb.deleteSyncConfig(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Sync Messages (read-only) ────────────────

router.get('/sync-messages', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;

        const filters = [];
        if (req.query.customerId) filters.push(`(Customer_Id,eq,${req.query.customerId})`);
        if (req.query.projectId) filters.push(`(Project_Id,eq,${req.query.projectId})`);
        if (req.query.syncConfigTitle) filters.push(`(SyncConfig_Title,eq,${req.query.syncConfigTitle})`);

        let where = null;
        if (filters.length > 0) {
            where = filters.join('~and');
        }

        const messages = await nocodb.getRecentMessages(limit, where);
        res.json({ data: messages });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Drive Configs ────────────────────────────

router.get('/drive-configs', async (req, res) => {
    try {
        const configs = await nocodb.getDriveConfigs();
        res.json({ data: configs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/drive-configs', async (req, res) => {
    try {
        const result = await nocodb.createDriveConfig(req.body);
        res.json({ data: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/drive-configs/:id', async (req, res) => {
    try {
        const result = await nocodb.updateDriveConfig(parseInt(req.params.id), req.body);
        res.json({ data: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/drive-configs/:id', async (req, res) => {
    try {
        await nocodb.deleteDriveConfig(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Settings ─────────────────────────────────

router.get('/settings', async (req, res) => {
    try {
        const settings = await nocodb.getSettings();
        // Mask sensitive values
        const masked = settings.map((s) => ({
            ...s,
            Value: s.Value ? '••••' + s.Value.slice(-4) : '',
        }));
        res.json({ data: masked });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/settings', async (req, res) => {
    try {
        const { title, value, platform, description } = req.body;
        await nocodb.upsertSetting(title, value, platform, description);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── PM_Tracking_Configs ─────────────────────────

router.get('/pm-tracking-configs', async (req, res) => {
    try {
        const data = await nocodb.getPMTrackingConfigs();
        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/pm-tracking-configs', async (req, res) => {
    try {
        const result = await nocodb.createPMTrackingConfig(req.body);
        res.json({ data: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/pm-tracking-configs/:id', async (req, res) => {
    try {
        const result = await nocodb.updatePMTrackingConfig(parseInt(req.params.id), req.body);
        res.json({ data: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/pm-tracking-configs/:id', async (req, res) => {
    try {
        const result = await nocodb.deletePMTrackingConfig(parseInt(req.params.id));
        res.json({ data: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── PM_Tasks_Tracking (Finance Tracking) ───────

router.get('/pm-tracking', async (req, res) => {
    try {
        const ids = await nocodb.getTableIds();
        if (!ids.PM_Tasks_Tracking) {
            return res.status(500).json({ error: 'PM tracking table not found' });
        }

        let url = `${config.NOCODB_URL}/api/v2/tables/${ids.PM_Tasks_Tracking}/records?limit=100&offset=0`;
        const params = [];

        if (req.query.jobType) {
            params.push(`(Job_Type,eq,${req.query.jobType})`);
        }
        if (req.query.paymentStatus) {
            params.push(`(Payment_Status,eq,${req.query.paymentStatus})`);
        }
        if (req.query.pmConfig) {
            params.push(`(PM_Config_Title,eq,${req.query.pmConfig})`);
        }
        if (req.query.assignee) {
            params.push(`(Assignee,like,${req.query.assignee})`);
        }
        if (req.query.status) {
            params.push(`(Status,eq,${req.query.status})`);
        }
        if (req.query.hasDueDate === 'yes') {
            params.push(`(Due_Date,isnot,null)`);
            params.push(`(Due_Date,neq,)`);
        } else if (req.query.hasDueDate === 'no') {
            params.push(`~or(Due_Date,is,null)~or(Due_Date,eq,)`);
        }

        if (params.length > 0) {
            url += `&where=${encodeURIComponent(params.join('~and'))}`;
        }

        console.log("[PM Tracking] Fetching URL:", url);

        const axios = require('axios');
        const getRes = await axios.get(url, {
            headers: { 'xc-token': config.NOCODB_API_TOKEN, 'Content-Type': 'application/json' }
        });

        res.json({ data: getRes.data.list || [], pageInfo: getRes.data.pageInfo });
    } catch (err) {
        res.status(500).json({ error: err.response?.data || err.message });
    }
});

router.put('/pm-tracking/:id', async (req, res) => {
    try {
        const ids = await nocodb.getTableIds();
        if (!ids.PM_Tasks_Tracking) {
            return res.status(500).json({ error: 'PM tracking table not found' });
        }
        const axios = require('axios');

        // Allowed fields to update from UI: Cost, Payment_Status, Notes, Bonus, Bonus_Reason
        const updateData = { Id: parseInt(req.params.id) };
        if (req.body.Cost !== undefined) updateData.Cost = req.body.Cost;
        if (req.body.Currency !== undefined) updateData.Currency = req.body.Currency;
        if (req.body.Payment_Status !== undefined) updateData.Payment_Status = req.body.Payment_Status;
        if (req.body.Notes !== undefined) updateData.Notes = req.body.Notes;
        if (req.body.Bonus !== undefined) updateData.Bonus = req.body.Bonus;
        if (req.body.Bonus_Reason !== undefined) updateData.Bonus_Reason = req.body.Bonus_Reason;

        const patchRes = await axios.patch(
            `${config.NOCODB_URL}/api/v2/tables/${ids.PM_Tasks_Tracking}/records`,
            [updateData],
            { headers: { 'xc-token': config.NOCODB_API_TOKEN, 'Content-Type': 'application/json' } }
        );

        res.json({ data: patchRes.data });
    } catch (err) {
        res.status(500).json({ error: err.response?.data || err.message });
    }
});

// ─── Invoice: Generate monthly summary ──────────
router.get('/pm-tracking/invoice', async (req, res) => {
    try {
        const ids = await nocodb.getTableIds();
        if (!ids.PM_Tasks_Tracking) {
            return res.status(500).json({ error: 'PM tracking table not found' });
        }
        const axios = require('axios');
        const month = req.query.month; // YYYY-MM
        const assigneeFilter = req.query.assignee;

        // Build filter: Payment_Status = Unpaid AND has Closed_Date (task must be closed to be invoiced)
        let whereClause = `~or(Payment_Status,eq,Unpaid)~or(Payment_Status,is,null)~or(Payment_Status,eq,)`;
        // Must have Closed_Date
        whereClause = `(${whereClause})~and(Closed_Date,isnot,null)~and(Closed_Date,neq,)`;

        if (assigneeFilter) {
            whereClause = `(${whereClause})~and(Assignee,like,${assigneeFilter})`;
        }

        let allTasks = [];
        let offset = 0;
        const limit = 100;

        // Paginate to get all unpaid closed tasks
        while (true) {
            const url = `${config.NOCODB_URL}/api/v2/tables/${ids.PM_Tasks_Tracking}/records?limit=${limit}&offset=${offset}&where=${encodeURIComponent(whereClause)}`;
            const getRes = await axios.get(url, {
                headers: { 'xc-token': config.NOCODB_API_TOKEN, 'Content-Type': 'application/json' }
            });
            const list = getRes.data.list || [];
            allTasks = allTasks.concat(list);
            if (list.length < limit) break;
            offset += limit;
        }

        // Filter by month: only tasks closed on or before end of selected month 
        let filtered = allTasks;
        if (month) {
            const endOfMonth = new Date(month + '-01');
            endOfMonth.setMonth(endOfMonth.getMonth() + 1);
            endOfMonth.setDate(0); // last day of selected month
            const endStr = endOfMonth.toISOString().split('T')[0];

            filtered = allTasks.filter(t => t.Closed_Date <= endStr);
        }

        // Group by Assignee
        const invoices = {};
        for (const t of filtered) {
            const assignee = t.Assignee || 'Unassigned';
            if (!invoices[assignee]) {
                invoices[assignee] = { tasks: [], totalCost: 0, totalBonus: 0, grandTotal: 0, currency: 'USD' };
            }
            const cost = parseFloat(t.Cost) || 0;
            const bonus = parseFloat(t.Bonus) || 0;
            invoices[assignee].tasks.push(t);
            invoices[assignee].totalCost += cost;
            invoices[assignee].totalBonus += bonus;
            invoices[assignee].grandTotal += cost + bonus;
            if (t.Currency === 'VND') invoices[assignee].currency = 'VND';
        }

        res.json({ invoices, month: month || 'all' });
    } catch (err) {
        console.error('[Invoice] Error:', err.message);
        res.status(500).json({ error: err.response?.data || err.message });
    }
});

// ─── Invoice: Mark tasks as Paid ────────────────
router.post('/pm-tracking/invoice/mark-paid', async (req, res) => {
    try {
        const ids = await nocodb.getTableIds();
        if (!ids.PM_Tasks_Tracking) {
            return res.status(500).json({ error: 'PM tracking table not found' });
        }
        const axios = require('axios');
        const taskIds = req.body.taskIds;

        if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
            return res.status(400).json({ error: 'taskIds array is required' });
        }

        // Batch update all tasks to Paid
        const updates = taskIds.map(id => ({ Id: parseInt(id), Payment_Status: 'Paid' }));
        const patchRes = await axios.patch(
            `${config.NOCODB_URL}/api/v2/tables/${ids.PM_Tasks_Tracking}/records`,
            updates,
            { headers: { 'xc-token': config.NOCODB_API_TOKEN, 'Content-Type': 'application/json' } }
        );

        res.json({ updated: taskIds.length, data: patchRes.data });
    } catch (err) {
        console.error('[Invoice Mark Paid] Error:', err.message);
        res.status(500).json({ error: err.response?.data || err.message });
    }
});

// ─── Refresh PM Tracking (re-fetch from ClickUp) ─────
router.post('/pm-tracking/refresh', async (req, res) => {
    try {
        const clickup = require('./platforms/clickup-api');
        const configs = await nocodb.getPMTrackingConfigs();
        const activeConfigs = configs.filter(c => c.Enabled !== 'Paused');

        if (activeConfigs.length === 0) {
            return res.json({ message: 'No active PM configs to refresh', total: 0 });
        }

        let totalUpserted = 0;
        const errors = [];

        for (const cfg of activeConfigs) {
            try {
                // Collect all list IDs to fetch tasks from
                let listIds = [];

                if (cfg.ClickUp_Type === 'list') {
                    listIds.push(cfg.ClickUp_ID);
                } else if (cfg.ClickUp_Type === 'folder') {
                    const lists = await clickup.getListsInFolder(cfg.ClickUp_ID);
                    listIds = lists.map(l => l.id);
                } else if (cfg.ClickUp_Type === 'space') {
                    // Get folders + folderless lists
                    const [folders, folderlessLists] = await Promise.all([
                        clickup.getFolders(cfg.ClickUp_ID),
                        clickup.getFolderlessLists(cfg.ClickUp_ID)
                    ]);
                    for (const folder of folders) {
                        const lists = await clickup.getListsInFolder(folder.id);
                        listIds.push(...lists.map(l => l.id));
                    }
                    listIds.push(...folderlessLists.map(l => l.id));
                }

                console.log(`[PM Refresh] Config "${cfg.Title}" (${cfg.ClickUp_Type}:${cfg.ClickUp_ID}) → ${listIds.length} lists`);

                for (const listId of listIds) {
                    const tasks = await clickup.getTasks(listId);
                    for (const task of tasks) {
                        await nocodb.upsertPMTaskTracking({
                            Task_ID: task.id,
                            Task_Name: task.name || 'Unknown',
                            Status: task.status?.status || 'unknown',
                            Job_Type: cfg.Job_Type,
                            Assignee: task.assignees?.map(a => a.username).join(', ') || '',
                            Task_URL: task.url || '#',
                            PM_Config_Title: cfg.Title,
                            Due_Date: task.due_date ? new Date(parseInt(task.due_date)).toISOString().split('T')[0] : '',
                            Closed_Date: task.date_closed ? new Date(parseInt(task.date_closed)).toISOString().split('T')[0] : '',
                        });
                        totalUpserted++;
                    }
                }
            } catch (cfgErr) {
                console.error(`[PM Refresh] Error on config "${cfg.Title}":`, cfgErr.message);
                errors.push({ config: cfg.Title, error: cfgErr.message });
            }
        }

        res.json({
            message: `Refreshed ${totalUpserted} tasks from ${activeConfigs.length} configs`,
            total: totalUpserted,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (err) {
        console.error('[PM Refresh] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── Dashboard Stats ──────────────────────────

router.get('/stats', async (req, res) => {
    try {
        const [syncConfigs, driveConfigs, messages] = await Promise.all([
            nocodb.getSyncConfigs(),
            nocodb.getDriveConfigs(),
            nocodb.getRecentMessages(10),
        ]);

        res.json({
            syncConfigs: {
                total: syncConfigs.length,
                active: syncConfigs.filter((c) => c.Status === 'active').length,
            },
            driveConfigs: {
                total: driveConfigs.length,
                active: driveConfigs.filter((c) => c.Status === 'active').length,
            },
            recentMessages: messages,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Name Mappings ────────────────────────────

router.get('/name-mappings', async (req, res) => {
    try {
        const mappings = await nocodb.getNameMappings();
        res.json({ data: mappings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/name-mappings', async (req, res) => {
    try {
        const result = await nocodb.createNameMapping(req.body);
        res.json({ data: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/name-mappings/:id', async (req, res) => {
    try {
        await nocodb.deleteNameMapping(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── List Mappings ────────────────────────────

router.get('/list-mappings', async (req, res) => {
    try {
        const mappings = await nocodb.getListMappings();
        res.json({ data: mappings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/list-mappings', async (req, res) => {
    try {
        const data = await nocodb.createListMapping(req.body);
        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/list-mappings/:id', async (req, res) => {
    try {
        const data = await nocodb.updateListMapping(parseInt(req.params.id, 10), req.body);
        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/list-mappings/:id', async (req, res) => {
    try {
        await nocodb.deleteListMapping(parseInt(req.params.id, 10));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Drive OAuth ──────────────────────────────
const driveAuth = require('./drive/auth');

router.get('/auth/google/url', (req, res) => {
    try {
        const url = driveAuth.getAuthUrl();
        res.json({ url });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Callback is excluded from Auth Middleware
router.get('/auth/google/callback', async (req, res) => {
    try {
        const { code } = req.query;
        if (!code) {
            return res.status(400).send('Missing authorization code');
        }
        await driveAuth.handleCallback(code);

        // Try to re-init drive service now that we have tokens
        const driveSync = require('./drive/sync');
        await driveSync.initDriveService();

        res.send('<html><body><h2>Authentication successful!</h2><p>You can close this window and return to the application.</p></body></html>');
    } catch (err) {
        console.error('OAuth callback error:', err);
        res.status(500).send(`Authentication failed: ${err.message}`);
    }
});

router.get('/auth/google/status', async (req, res) => {
    try {
        // Just checking if tokens exist and can be loaded
        const hasTokens = await driveAuth.loadTokens();
        res.json({ connected: hasTokens });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
