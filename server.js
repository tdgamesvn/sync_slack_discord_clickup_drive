const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const config = require('./src/config');
const nocodb = require('./src/nocodb');
const discordBot = require('./src/bots/discord');
const slackApi = require('./src/platforms/slack-api');
const driveSync = require('./src/drive/sync');

// ─── Express App ──────────────────────────────

const app = express();
app.use(cors());

// Parse JSON for all routes EXCEPT /webhook/slack
// Slack needs raw body for signature verification
app.use((req, res, next) => {
    if (req.path === '/webhook/slack') {
        return next(); // Skip JSON parsing for Slack
    }
    express.json({ limit: '50mb' })(req, res, next);
});

app.use(express.static(path.join(__dirname, 'public')));

// ─── Webhook Routes ───────────────────────────

app.use('/webhook/clickup', require('./src/webhooks/clickup'));
app.use('/webhook/slack', require('./src/webhooks/slack'));

// ─── API Routes ───────────────────────────────

app.use('/api', require('./src/api'));

// ─── Health Check ─────────────────────────────

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        services: {
            discord: config.DISCORD_BOT_USER_ID ? 'connected' : 'disconnected',
        },
    });
});

// ─── SPA Fallback ─────────────────────────────

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Server ─────────────────────────────

async function start() {
    console.log('═══════════════════════════════════════');
    console.log('  Chat Sync App — Starting...');
    console.log('═══════════════════════════════════════');

    // 1. Verify NocoDB connection
    try {
        await nocodb.getTableIds();
        console.log('✅ NocoDB connected');
    } catch (err) {
        console.error('❌ NocoDB connection failed:', err.message);
        process.exit(1);
    }

    // 2. Get Slack bot user ID (for loop prevention)
    try {
        const botInfo = await slackApi.getBotInfo();
        config.SLACK_BOT_USER_ID = botInfo.user_id;
        console.log(`✅ Slack bot: ${botInfo.user} (${botInfo.user_id})`);
    } catch (err) {
        console.warn('⚠️  Slack bot init failed:', err.message);
    }

    // 3. Start Discord bot
    try {
        await discordBot.startBot();
        console.log('✅ Discord bot started');
    } catch (err) {
        console.warn('⚠️  Discord bot failed:', err.message);
    }

    // 4. Initialize Drive sync
    try {
        driveSync.initDriveService();
        console.log('✅ Google Drive service initialized');
    } catch (err) {
        console.warn('⚠️  Drive init failed:', err.message);
    }

    // 5. Schedule Drive sync cron (every 5 minutes)
    cron.schedule('*/5 * * * *', () => {
        console.log('[Cron] Running Drive sync...');
        driveSync.runDriveSync();
    });

    // 6. Start HTTP server
    app.listen(config.PORT, () => {
        console.log('═══════════════════════════════════════');
        console.log(`  🚀 Server running on port ${config.PORT}`);
        console.log(`  📡 Webhooks:`);
        console.log(`     ClickUp: /webhook/clickup`);
        console.log(`     Slack:   /webhook/slack`);
        console.log(`  🌐 Dashboard: http://localhost:${config.PORT}`);
        console.log('═══════════════════════════════════════');
    });
}

start().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
