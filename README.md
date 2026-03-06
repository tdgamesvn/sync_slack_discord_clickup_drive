# ⚡ ChatSync — ClickUp ↔ Slack ↔ Discord + Google Drive

Real-time, bidirectional chat synchronization between **ClickUp**, **Slack**, and **Discord** with one-way **Google Drive** folder sync.

## ✨ Features

- **Chat Sync**: Messages (text + files) sync across ClickUp comments, Slack threads, and Discord threads
- **Bidirectional**: Send from any platform → other two receive instantly
- **File Attachments**: Images and files are downloaded and re-uploaded across platforms
- **List Mappings**: Map ClickUp Lists → Slack & Discord channels for auto-threading, status updates, and reviewer pings
- **Auto-Threading**: New ClickUp tasks auto-create threaded messages on Slack and Discord
- **Reviewer Ping**: Automatically tag reviewers on Slack/Discord when task status → `CLIENT_REVIEW`
- **Task Cleanup**: Deleting a ClickUp task removes the Slack thread and archives/locks the Discord thread
- **Custom Name Mappings**: Override display names (e.g., "NA" → "Art Director")
- **Drive Sync**: One-way folder sync from studio → client Google Drive folders
- **PM Finance Tracking**: Track task costs and payment status synced from ClickUp
- **Dashboard UI & Security**: Web-based admin panel protected by JWT authentication and NocoDB `Account` table
- **Action Logs**: Track system sync logs and identify the user responsible (`Action By` feature)
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
CLICKUP_WORKSPACE_ID=your_workspace_id

# Slack
SLACK_BOT_TOKEN=xoxb-xxxxx
SLACK_SIGNING_SECRET=xxxxx

# Discord
DISCORD_BOT_TOKEN=xxxxx

# Google Drive OAuth 2.0
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# JWT Config (Optional, defaults to fallback in development)
JWT_SECRET=your_super_secret_jwt_key
```

### 3. NocoDB Setup

Create these tables in your NocoDB base:

**Account** (For Dashboard Login)
| Column | Type |
|--------|------|
| username | SingleLineText |
| password | SingleLineText |
| name | SingleLineText |

**Customers**
| Column | Type |
|--------|------|
| Title | SingleLineText |

**Projects**
| Column | Type |
|--------|------|
| Title | SingleLineText |
| Customer_Id | Link (Customers) |

**SyncConfigs**
| Column | Type |
|--------|------|
| Title | SingleLineText |
| Project_Id | Link (Projects) |
| ClickUp_Task_ID | SingleLineText |
| Slack_Channel_ID | SingleLineText |
| Slack_Thread_TS | SingleLineText |
| Discord_Thread_ID | SingleLineText |
| Sync_ClickUp_To_Slack | Checkbox |
| Sync_ClickUp_To_Discord | Checkbox |
| Sync_Slack_To_ClickUp | Checkbox |
| Sync_Slack_To_Discord | Checkbox |
| Sync_Discord_To_ClickUp | Checkbox |
| Sync_Discord_To_Slack | Checkbox |
| Status | SingleLineText |

**DriveConfigs**
| Column | Type |
|--------|------|
| Title | SingleLineText |
| Project_Id | Link (Projects) |
| Studio_Folder_ID | SingleLineText |
| Client_Folder_ID | SingleLineText |
| Sync_Direction | SingleLineText |
| Status | SingleLineText |
| Last_Synced | DateTime |

| Custom_Name | SingleLineText |

**SyncMessages** (logs)
| Column | Type |
|--------|------|
| Title | SingleLineText |
| SyncConfig_Title | SingleLineText |
| Source_Platform | SingleLineText |
| Author | SingleLineText |
| Content | SingleLineText |
| Synced_To | SingleLineText |
| Action_By | SingleLineText |
| Status | SingleLineText |
| Customer_Id | Link (Customers) |
| Project_Id | Link (Projects) |
| Created_At | DateTime |

**ListMappings** (Auto-Threading Rules)
| Column | Type |
|--------|------|
| List_ID | SingleLineText |
| Slack_Channel_ID | SingleLineText |
| Slack_Review_User_IDs | SingleLineText |
| Discord_Channel_ID | SingleLineText |
| Discord_Review_User_IDs | SingleLineText |
| Customer_Id | Link (Customers) |
| Project_Id | Link (Projects) |

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

> **Important**: Ensure you use the correct Workspace ID (`TEAM_ID`) if your account belongs to multiple workspaces. Task lifecycle events (`taskCreated`, `taskUpdated`, `taskDeleted`) are required for auto-threading on both Slack and Discord.

```bash
curl -X POST "https://api.clickup.com/api/v2/team/{TEAM_ID}/webhook" \
  -H "Authorization: YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"endpoint":"https://your-domain/webhook/clickup","events":["taskCreated","taskUpdated","taskDeleted","taskCommentPosted","taskCommentUpdated"]}'
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
│   ├── handlers/
│   │   ├── comment-sync.js   # ClickUp comment → Slack/Discord sync
│   │   ├── pm-tracking.js    # PM finance tracking from ClickUp
│   │   ├── slack-automation.js   # Auto-thread + reviewer ping on Slack
│   │   └── discord-automation.js # Auto-thread + reviewer ping + archive on Discord
│   ├── platforms/
│   │   ├── clickup-api.js    # ClickUp API client
│   │   ├── slack-api.js      # Slack API client
│   │   └── discord-api.js    # Discord API client (sendMessage, createThread, archiveThread)
│   ├── webhooks/
│   │   ├── clickup.js        # ClickUp webhook router → handlers
│   │   └── slack.js          # Slack Events handler
│   ├── drive/
│   │   ├── auth.js           # OAuth 2.0 Google Auth handler
│   │   └── sync.js           # Google Drive sync worker
│   └── utils/
│       └── attachments.js    # File download utilities
├── .env                      # Credentials (gitignored)
├── .gitignore
└── package.json
```

## 🔒 Security

- **Dashboard Login**: Protected by JWT authentication using the `Account` table in NocoDB.
- **API Protection**: All management endpoints require a valid `Bearer` token. Webhook endpoints are public but do not expose data.
- **Secure Credentials**: All API keys stored in `.env` (gitignored).
- **Slack Verification**: Slack signature verification on incoming events.
- **Bot Detection**: Bot message detection to prevent loops.
- **OAuth Safety**: Google OAuth tokens securely stored in NocoDB after explicit user consent.

## 📄 License

MIT
