const axios = require('axios');
const config = require('../config');

const api = axios.create({
    baseURL: 'https://slack.com/api',
    headers: { Authorization: `Bearer ${config.SLACK_BOT_TOKEN}` },
});

/**
 * Post a message to a Slack thread.
 */
async function postMessage(channelId, threadTs, text, fileBuffers = []) {
    // Upload files first if any
    for (const f of fileBuffers) {
        try {
            await uploadFile(channelId, threadTs, f.buffer, f.filename);
        } catch (err) {
            console.error(`[Slack] File upload failed for ${f.filename}:`, err.message);
        }
    }

    // Post text message to thread
    const payload = {
        channel: channelId,
        text,
        unfurl_links: false,
    };

    // Only add thread_ts if it's a valid format (numbers with a dot)
    if (threadTs && /^\d+\.\d+$/.test(threadTs)) {
        payload.thread_ts = threadTs;
    } else {
        console.warn(`[Slack] Invalid thread_ts format: "${threadTs}", posting to channel instead`);
    }

    console.log(`[Slack] Posting message to channel: ${channelId}, thread_ts: ${payload.thread_ts || 'N/A'}`);

    const res = await api.post('/chat.postMessage', payload);

    if (!res.data.ok) {
        throw new Error(`Slack postMessage failed: ${res.data.error}`);
    }

    return { ts: res.data.ts, channel: channelId };
}

/**
 * Update a message in Slack.
 */
async function updateMessage(channelId, ts, text) {
    const res = await api.post('/chat.update', {
        channel: channelId,
        ts,
        text,
    });
    if (!res.data.ok) {
        throw new Error(`Slack updateMessage failed: ${res.data.error}`);
    }
    return res.data;
}

/**
 * Delete a message in Slack.
 */
async function deleteMessage(channelId, ts) {
    const res = await api.post('/chat.delete', {
        channel: channelId,
        ts,
    });
    return res.data;
}

/**
 * Upload a file to a Slack channel/thread.
 */
async function uploadFile(channelId, threadTs, buffer, filename) {
    // Step 1: Get upload URL
    const uploadRes = await api.post('/files.getUploadURLExternal', null, {
        params: { filename, length: buffer.length },
    });

    if (!uploadRes.data.ok) {
        throw new Error(`Slack getUploadURL failed: ${uploadRes.data.error}`);
    }

    // Step 2: Upload file
    await axios.post(uploadRes.data.upload_url, buffer, {
        headers: { 'Content-Type': 'application/octet-stream' },
    });

    // Step 3: Complete upload
    const completePayload = {
        files: [{ id: uploadRes.data.file_id, title: filename }],
        channel_id: channelId,
    };

    // Only add thread_ts if valid
    if (threadTs && /^\d+\.\d+$/.test(threadTs)) {
        completePayload.thread_ts = threadTs;
    }

    await api.post('/files.completeUploadExternal', completePayload);
}

/**
 * Download a Slack file (requires bot token auth).
 */
async function downloadSlackFile(url) {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: { Authorization: `Bearer ${config.SLACK_BOT_TOKEN}` },
    });
    return Buffer.from(res.data);
}

/**
 * Get a Slack user's display name from their user ID.
 */
async function getUserDisplayName(userId) {
    const res = await api.post('/users.info', null, { params: { user: userId } });
    if (!res.data.ok) throw new Error(`Slack users.info failed: ${res.data.error}`);
    const u = res.data.user;
    return u.profile?.display_name || u.real_name || u.name || userId;
}

/**
 * Get bot user info (to know our own user ID).
 */
async function getBotInfo() {
    const res = await api.post('/auth.test');
    return res.data;
}

module.exports = { postMessage, updateMessage, deleteMessage, uploadFile, downloadSlackFile, getUserDisplayName, getBotInfo };
