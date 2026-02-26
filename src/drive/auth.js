const { google } = require('googleapis');
const config = require('../config');
const nocodb = require('../nocodb');

// Create the OAuth2 client
const oauth2Client = new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_REDIRECT_URI
);

// Listen for auto-refresh events to re-save the token
oauth2Client.on('tokens', async (tokens) => {
    // When tokens refresh, we receive new ones (and possibly a new refresh_token)
    try {
        console.log('[Drive Auth] Token refreshed, saving to NocoDB...');
        const existingTokensSettings = await nocodb.getSettings();
        const found = existingTokensSettings.find((s) => s.Title === 'GOOGLE_DRIVE_TOKENS');

        let currentTokens = {};
        if (found && found.Value) {
            currentTokens = JSON.parse(found.Value);
        }

        // Merge new tokens with existing (to keep refresh_token if not provided in this emit)
        const updatedTokens = {
            ...currentTokens,
            ...tokens
        };

        await nocodb.upsertSetting(
            'GOOGLE_DRIVE_TOKENS',
            JSON.stringify(updatedTokens),
            'google',
            'OAuth2 Tokens for Google Drive Sync'
        );
        console.log('[Drive Auth] Tokens saved successfully.');
    } catch (err) {
        console.error('[Drive Auth] Failed to save refreshed tokens:', err.message);
    }
});

/**
 * Generate the authentication URL for the user to visit.
 */
function getAuthUrl() {
    return oauth2Client.generateAuthUrl({
        // 'offline' gets us a refresh_token
        access_type: 'offline',
        // Scope for full Drive access
        scope: ['https://www.googleapis.com/auth/drive'],
        // Force approval prompt to ensure we get a refresh token
        prompt: 'consent'
    });
}

/**
 * Handle the callback after user authenticates a code.
 */
async function handleCallback(code) {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Save tokens to DB immediately
    await nocodb.upsertSetting(
        'GOOGLE_DRIVE_TOKENS',
        JSON.stringify(tokens),
        'google',
        'OAuth2 Tokens for Google Drive Sync'
    );

    return tokens;
}

/**
 * Loads tokens from database and applies them to the client
 */
async function loadTokens() {
    try {
        const settings = await nocodb.getSettings();
        const tokenSetting = settings.find((s) => s.Title === 'GOOGLE_DRIVE_TOKENS');

        if (tokenSetting && tokenSetting.Value) {
            const tokens = JSON.parse(tokenSetting.Value);
            oauth2Client.setCredentials(tokens);
            return true;
        }
    } catch (err) {
        console.error('[Drive Auth] Failed to load tokens:', err.message);
    }
    return false;
}

module.exports = {
    oauth2Client,
    getAuthUrl,
    handleCallback,
    loadTokens
};
