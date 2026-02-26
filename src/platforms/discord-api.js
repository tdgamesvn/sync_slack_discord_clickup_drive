const { AttachmentBuilder } = require('discord.js');

// Discord client is set from outside (server.js)
let discordClient = null;

function setClient(client) {
    discordClient = client;
}

/**
 * Send a message to a Discord thread/channel.
 */
async function sendMessage(threadId, text, fileBuffers = []) {
    const channel = await discordClient.channels.fetch(threadId);
    if (!channel) throw new Error(`Discord channel/thread ${threadId} not found`);

    const files = fileBuffers.map(
        (f) => new AttachmentBuilder(f.buffer, { name: f.filename })
    );

    const msg = await channel.send({ content: text, files });
    return { messageId: msg.id, channelId: threadId };
}

/**
 * Edit a message in a Discord channel/thread.
 */
async function editMessage(channelId, messageId, text) {
    const channel = await discordClient.channels.fetch(channelId);
    if (!channel) throw new Error(`Discord channel ${channelId} not found`);
    const msg = await channel.messages.fetch(messageId);
    await msg.edit({ content: text });
    return { messageId, channelId };
}

/**
 * Delete a message in a Discord channel/thread.
 */
async function deleteMessageById(channelId, messageId) {
    const channel = await discordClient.channels.fetch(channelId);
    if (!channel) throw new Error(`Discord channel ${channelId} not found`);
    const msg = await channel.messages.fetch(messageId);
    await msg.delete();
    return { messageId, channelId };
}

module.exports = { setClient, sendMessage, editMessage, deleteMessageById };
