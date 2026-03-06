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
 * Send a message to a channel, then create a public thread from it.
 * Returns the thread object with its ID.
 */
async function createThread(channelId, threadName, initialMessage) {
    const channel = await discordClient.channels.fetch(channelId);
    if (!channel) throw new Error(`Discord channel ${channelId} not found`);

    // Post the initial message in the channel
    const msg = await channel.send({ content: initialMessage });

    // Create a public thread from that message
    const thread = await msg.startThread({
        name: threadName.substring(0, 100), // Discord thread name max 100 chars
        autoArchiveDuration: 10080, // 7 days
    });

    return { threadId: thread.id, messageId: msg.id, channelId };
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

/**
 * Archive and lock a Discord thread.
 */
async function archiveThread(threadId, reason = '') {
    const thread = await discordClient.channels.fetch(threadId);
    if (!thread || !thread.isThread()) throw new Error(`Discord thread ${threadId} not found`);

    // Send a closing message before archiving
    if (reason) {
        await thread.send({ content: reason });
    }

    // Lock the thread (prevent new messages) then archive it
    await thread.setLocked(true);
    await thread.setArchived(true);
    return { threadId };
}

module.exports = { setClient, sendMessage, createThread, editMessage, deleteMessageById, archiveThread };
