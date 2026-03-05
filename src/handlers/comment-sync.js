const { handleIncomingMessage, isSyncedMessage } = require('../relay');

/**
 * Handle ClickUp comment events (taskCommentPosted, taskCommentUpdated).
 * Extracts comment text + attachments and relays to other platforms.
 */
async function handleCommentSync(event, task_id, history_items) {
    if (event === 'taskCommentPosted') {
        const item = history_items?.[0];
        if (!item) return;

        const author = item.user?.username || item.user?.email || 'Unknown';
        const commentText = item.comment?.text_content || item.comment?.comment_text || '';
        const commentId = item.comment?.id || '';

        // Extract attachments from comment parts
        const attachments = [];
        if (item.comment?.comment && Array.isArray(item.comment.comment)) {
            for (const part of item.comment.comment) {
                if (part.type === 'image' && part.image) {
                    const img = part.image;
                    const url = img.url_w_host || img.url || img.thumbnail_large || img.thumbnail_small;
                    if (url) {
                        attachments.push({
                            url,
                            filename: decodeURIComponent(img.name || img.title || part.text || 'image.png'),
                        });
                    }
                }
                if (part.type === 'attachment' && part.attachment) {
                    const att = part.attachment;
                    const url = att.url_w_host || att.url;
                    if (url) {
                        attachments.push({ url, filename: att.title || att.name || 'file' });
                    }
                }
                if (part.attributes?.attachment) {
                    const att = part.attributes.attachment;
                    const url = att.url_w_host || att.url;
                    if (url) {
                        attachments.push({ url, filename: att.title || att.name || 'file' });
                    }
                }
            }
        }

        console.log(`[ClickUp] Found ${attachments.length} attachments`);
        if (attachments.length > 0) {
            console.log(`[ClickUp] Attachment URLs:`, attachments.map(a => a.filename).join(', '));
        }

        // Determine if this is an attachment bounce from our bot
        let isAttachmentBounce = false;
        if (attachments.length > 0) {
            const allSynced = attachments.every(a => a.filename.startsWith('[SYNC] '));
            if (allSynced) {
                let textWithoutFilenames = commentText;
                for (const att of attachments) {
                    textWithoutFilenames = textWithoutFilenames.replace(att.filename, '').trim();
                }
                if (!textWithoutFilenames) {
                    isAttachmentBounce = true;
                }
            }
        }

        // Skip synced messages (loop prevention)
        if (isSyncedMessage(commentText) || isAttachmentBounce) {
            console.log('[ClickUp] Skipping synced message or attachment bounce (loop prevention)');
            return;
        }

        // Filter out text that is just the filename
        let cleanText = commentText;
        for (const att of attachments) {
            cleanText = cleanText.replace(att.filename, '').trim();
        }

        handleIncomingMessage({
            source: 'clickup',
            action: 'create',
            sourceId: task_id,
            sourceMessageId: commentId,
            author,
            text: cleanText || commentText,
            attachments,
        }).catch(err => console.error('[ClickUp] Relay error in create:', err));
    }

    if (event === 'taskCommentUpdated') {
        const item = history_items?.[0];
        if (!item) return;

        const author = item.user?.username || item.user?.email || 'Unknown';
        const commentText = item.comment?.text_content || '';
        const commentId = item.comment?.id || '';

        if (isSyncedMessage(commentText) || commentText.startsWith('✏️')) {
            return;
        }

        handleIncomingMessage({
            source: 'clickup',
            action: 'update',
            sourceId: task_id,
            sourceMessageId: commentId,
            author,
            text: commentText,
        }).catch(err => console.error('[ClickUp] Relay error in update:', err));
    }
}

module.exports = { handleCommentSync };
