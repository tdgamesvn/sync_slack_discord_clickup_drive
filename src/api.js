const express = require('express');
const nocodb = require('./nocodb');

const router = express.Router();

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
        const messages = await nocodb.getRecentMessages(limit);
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

module.exports = router;

