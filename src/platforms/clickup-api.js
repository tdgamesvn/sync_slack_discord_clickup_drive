const axios = require('axios');
const FormData = require('form-data');
const config = require('../config');

const api = axios.create({
    baseURL: 'https://api.clickup.com/api/v2',
    headers: { Authorization: config.CLICKUP_API_TOKEN },
});

/**
 * Post a comment on a ClickUp task + upload attachments separately.
 */
async function postComment(taskId, text, attachmentBuffers = []) {
    // Post text comment
    const res = await api.post(`/task/${taskId}/comment`, {
        comment_text: text,
        notify_all: false,
    });
    const commentId = res.data?.id;

    // Upload each attachment to the task
    for (const att of attachmentBuffers) {
        try {
            // Prepend [SYNC] so the ClickUp webhook can identify and ignore bounced attachments
            const syncFilename = `[SYNC] ${att.filename}`;
            await uploadAttachment(taskId, att.buffer, syncFilename);
            console.log(`[ClickUp] ✅ Uploaded: ${syncFilename}`);
        } catch (err) {
            console.error(`[ClickUp] ❌ Upload failed for ${att.filename}:`, err.response?.data || err.message);
        }
    }

    return { commentId, taskId };
}

/**
 * Upload an attachment to a ClickUp task using multipart/form-data.
 */
async function uploadAttachment(taskId, buffer, filename) {
    const form = new FormData();
    form.append('attachment', buffer, {
        filename: filename,
        contentType: 'application/octet-stream',
    });

    const res = await axios({
        method: 'post',
        url: `https://api.clickup.com/api/v2/task/${taskId}/attachment`,
        data: form,
        headers: {
            ...form.getHeaders(),
            'Authorization': config.CLICKUP_API_TOKEN,
        },
        maxContentLength: 100 * 1024 * 1024,
        maxBodyLength: 100 * 1024 * 1024,
    });
    return res.data;
}

/**
 * Update a comment on a ClickUp task.
 */
async function updateComment(commentId, text) {
    const res = await api.put(`/comment/${commentId}`, {
        comment_text: text,
    });
    return res.data;
}

/**
 * Delete a comment on a ClickUp task.
 */
async function deleteComment(commentId) {
    const res = await api.delete(`/comment/${commentId}`);
    return res.data;
}

/**
 * Get comments for a task.
 */
async function getComments(taskId) {
    const res = await api.get(`/task/${taskId}/comment`);
    return res.data?.comments || [];
}

/**
 * Get task details.
 */
async function getTask(taskId) {
    const res = await api.get(`/task/${taskId}`);
    return res.data;
}

module.exports = { postComment, uploadAttachment, updateComment, deleteComment, getComments, getTask };
