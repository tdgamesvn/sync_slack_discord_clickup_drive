require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 3000,

    // NocoDB
    NOCODB_URL: process.env.NOCODB_URL,
    NOCODB_API_TOKEN: process.env.NOCODB_API_TOKEN,
    NOCODB_BASE_ID: process.env.NOCODB_BASE_ID,

    // ClickUp
    CLICKUP_API_TOKEN: process.env.CLICKUP_API_TOKEN,

    // Slack
    SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
    SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,

    // Discord
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,

    // Google Drive
    GOOGLE_SERVICE_ACCOUNT_KEY_PATH: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './GOOGLE_SERVICE_ACCOUNT_KEY.json',

    // Bot identifiers (populated at runtime)
    SLACK_BOT_USER_ID: null,
    DISCORD_BOT_USER_ID: null,
};
