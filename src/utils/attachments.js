const axios = require('axios');

/**
 * Download a file from any URL to a Buffer.
 */
async function downloadFile(url, headers = {}) {
    const res = await axios.get(url, { responseType: 'arraybuffer', headers, timeout: 30000 });
    return {
        buffer: Buffer.from(res.data),
        contentType: res.headers['content-type'] || 'application/octet-stream',
    };
}

/**
 * Extract a filename from a URL string.
 */
function getFilenameFromUrl(url) {
    try {
        const pathname = new URL(url).pathname;
        const parts = pathname.split('/');
        return parts[parts.length - 1] || 'file';
    } catch {
        return 'file';
    }
}

module.exports = { downloadFile, getFilenameFromUrl };
