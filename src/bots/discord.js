const { Client, GatewayIntentBits, Events, Partials } = require('discord.js');
const config = require('../config');
const { handleIncomingMessage, isSyncedMessage } = require('../relay');
const discordApi = require('../platforms/discord-api');
const nocodb = require('../nocodb');

let client = null;

/**
 * Initialize and start the Discord bot.
 */
async function startBot() {
    client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
        ],
        partials: [Partials.Message, Partials.Channel],
    });

    // Pass client reference to Discord API module
    discordApi.setClient(client);

    client.once(Events.ClientReady, (c) => {
        console.log(`[Discord] Bot logged in as ${c.user.tag} (ID: ${c.user.id})`);
        config.DISCORD_BOT_USER_ID = c.user.id;
    });

    // ─── Message Created ────────────────────────
    client.on(Events.MessageCreate, async (message) => {
        try {
            // Skip bot messages (loop prevention)
            if (message.author.bot) return;
            if (message.author.id === config.DISCORD_BOT_USER_ID) return;

            // Skip synced messages
            if ((message.content.startsWith('**[') && message.content.includes('—')) || isSyncedMessage(message.content)) return;

            // Only process messages in threads
            if (!message.channel.isThread()) return;

            const threadId = message.channel.id;

            // Check if this thread is in a sync config
            const configs = await nocodb.findSyncConfigByPlatformId('discord', threadId);
            if (!configs.length) return;

            // Extract attachments
            const attachments = message.attachments.map((a) => ({
                url: a.url,
                filename: a.name || 'file',
            }));

            await handleIncomingMessage({
                source: 'discord',
                action: 'create',
                sourceId: threadId,
                sourceMessageId: message.id,
                author: message.author.displayName || message.author.username,
                text: message.content || '',
                attachments,
            });
        } catch (err) {
            console.error('[Discord] MessageCreate error:', err);
        }
    });

    // ─── Message Updated ────────────────────────
    client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
        try {
            if (newMessage.author?.bot) return;
            if (!newMessage.channel.isThread()) return;

            const threadId = newMessage.channel.id;
            const configs = await nocodb.findSyncConfigByPlatformId('discord', threadId);
            if (!configs.length) return;

            if (isSyncedMessage(newMessage.content)) return;

            await handleIncomingMessage({
                source: 'discord',
                action: 'update',
                sourceId: threadId,
                sourceMessageId: newMessage.id,
                author: newMessage.author?.displayName || newMessage.author?.username || 'Unknown',
                text: newMessage.content || '',
            });
        } catch (err) {
            console.error('[Discord] MessageUpdate error:', err);
        }
    });

    // ─── Message Deleted ────────────────────────
    client.on(Events.MessageDelete, async (message) => {
        try {
            if (message.author?.bot) return;
            if (!message.channel.isThread()) return;

            const threadId = message.channel.id;
            const configs = await nocodb.findSyncConfigByPlatformId('discord', threadId);
            if (!configs.length) return;

            await handleIncomingMessage({
                source: 'discord',
                action: 'delete',
                sourceId: threadId,
                sourceMessageId: message.id,
                author: message.author?.displayName || message.author?.username || 'Unknown',
                text: message.content || '',
            });
        } catch (err) {
            console.error('[Discord] MessageDelete error:', err);
        }
    });

    await client.login(config.DISCORD_BOT_TOKEN);
    return client;
}

function getClient() {
    return client;
}

module.exports = { startBot, getClient };
