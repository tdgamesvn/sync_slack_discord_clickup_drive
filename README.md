# ⚡ ChatSync — ClickUp ↔ Slack ↔ Discord + Google Drive

Real-time, bidirectional chat synchronization between **ClickUp**, **Slack**, and **Discord** with one-way **Google Drive** folder sync.

## ✨ Features

- **Chat Sync**: Messages (text + files) sync across ClickUp comments, Slack threads, and Discord threads
- **Bidirectional**: Send from any platform → other two receive instantly
- **File Attachments**: Images and files are downloaded and re-uploaded across platforms
- **Custom Name Mappings**: Override display names (e.g., "NA" → "Art Director")
- **Drive Sync**: One-way folder sync from studio → client Google Drive folders
- **Dashboard UI**: Web-based admin panel to manage configs, view logs, and set name mappings
- **Loop Prevention**: Smart detection prevents infinite message loops

## 🏗️ Architecture

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│ ClickUp │     │  Slack  │     │ Discord │
│ Webhook │     │ Events  │     │   Bot   │
└────┬────┘     └────┬────┘     └────┬────┘
     │               │               │
     └───────┬───────┴───────┬───────┘
             │               │
        ┌────▼────┐    ┌─────▼─────┐
        │ Express │    │ Discord.js│
        │ Server  │    │  Client   │
        └────┬────┘    └─────┬─────┘
             │               │
             └───────┬───────┘
                     │
              ┌──────▼──────┐
              │ Relay Engine │
              │  (relay.js)  │
              └──────┬──────┘
                     │
              ┌──────▼──────┐
              │   NocoDB     │
              │  (Database)  │
              └─────────────┘
```

## 📦 Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js + Express |
| Discord | discord.js |
| Slack | Slack Events API + Web API |
| ClickUp | REST API + Webhooks |
| Drive | Google Drive API v3 |
| Database | NocoDB (REST API) |
| Frontend | Vanilla HTML/CSS/JS |

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/tdgamesvn/sync_slack_discord_clickup_drive.git
cd sync_slack_discord_clickup_drive
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your credentials:

```env
# Server
PORT=3000

# NocoDB
NOCODB_URL=https://your-nocodb.com
NOCODB_API_TOKEN=your_token
NOCODB_BASE_ID=your_base_id

# ClickUp
CLICKUP_API_TOKEN=pk_xxxxx

# Slack
SLACK_BOT_TOKEN=xoxb-xxxxx
SLACK_SIGNING_SECRET=xxxxx

# Discord
DISCORD_BOT_TOKEN=xxxxx

# Google Drive
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./GOOGLE_SERVICE_ACCOUNT_KEY.json
```

### 3. NocoDB Setup

Create these tables in your NocoDB base:

**SyncConfigs**
| Column | Type |
|--------|------|
| Title | SingleLineText |
| ClickUp_Task_ID | SingleLineText |
| Slack_Channel_ID | SingleLineText |
| Slack_Thread_TS | SingleLineText |
| Discord_Thread_ID | SingleLineText |
| Status | SingleLineText |

**SyncMessages** (logs)
| Column | Type |
|--------|------|
| Title | SingleLineText |
| SyncConfig_Title | SingleLineText |
| Source_Platform | SingleLineText |
| Author | SingleLineText |
| Content | SingleLineText |
| Synced_To | SingleLineText |
| Status | SingleLineText |
| Created_At | DateTime |

**NameMappings**
| Column | Type |
|--------|------|
| Platform | SingleLineText |
| Original_Name | SingleLineText |
| Custom_Name | SingleLineText |

### 4. Run

```bash
node server.js
```

Dashboard: `http://localhost:3000`

### 5. Expose to Internet

For webhooks to work, expose your server to the internet:

```bash
npx nport 3000 -s your-subdomain
```

### 6. Configure Webhooks

**Slack**: Go to [api.slack.com/apps](https://api.slack.com/apps) → Event Subscriptions → Request URL: `https://your-domain/webhook/slack`

**ClickUp**: Create via API:
```bash
curl -X POST "https://api.clickup.com/api/v2/team/{TEAM_ID}/webhook" \
  -H "Authorization: YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"endpoint":"https://your-domain/webhook/clickup","events":["taskCommentPosted","taskCommentUpdated"]}'
```

## 📁 Project Structure

```
├── server.js                 # Entry point, Express setup
├── public/
│   ├── index.html            # Dashboard SPA
│   ├── index.css             # Styles (dark theme)
│   └── app.js                # Frontend logic
├── src/
│   ├── config.js             # Environment config
│   ├── nocodb.js             # NocoDB API wrapper
│   ├── relay.js              # Core message relay engine
│   ├── api.js                # REST API routes
│   ├── bots/
│   │   └── discord.js        # Discord bot (WebSocket)
│   ├── platforms/
│   │   ├── clickup-api.js    # ClickUp API client
│   │   ├── slack-api.js      # Slack API client
│   │   └── discord-api.js    # Discord API client
│   ├── webhooks/
│   │   ├── clickup.js        # ClickUp webhook handler
│   │   └── slack.js          # Slack Events handler
│   ├── drive/
│   │   └── sync.js           # Google Drive sync worker
│   └── utils/
│       └── attachments.js    # File download utilities
├── .env                      # Credentials (gitignored)
├── .gitignore
└── package.json
```

## 🔒 Security

- All API keys stored in `.env` (gitignored)
- Slack signature verification on incoming events
- Bot message detection to prevent loops
- Google service account key excluded from repo

## 📄 License

MIT
