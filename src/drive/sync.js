const { google } = require('googleapis');
const nocodb = require('../nocodb');
const auth = require('./auth');

let driveService = null;

/**
 * Initialize Google Drive API client using OAuth2 client.
 */
async function initDriveService() {
    const success = await auth.loadTokens();

    if (!success) {
        console.warn('[Drive Sync] Unable to load Google Drive OAuth tokens. Sync paused.');
        return false;
    }

    driveService = google.drive({ version: 'v3', auth: auth.oauth2Client });
    console.log('[Drive Sync] OAuth2 Service initialized');
    return true;
}

/**
 * List all files in a Drive folder.
 */
async function listFiles(folderId) {
    const files = [];
    let pageToken = null;

    do {
        const res = await driveService.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, md5Checksum)',
            pageSize: 100,
            pageToken,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        });
        files.push(...(res.data.files || []));
        pageToken = res.data.nextPageToken;
    } while (pageToken);

    return files;
}

/**
 * Copy a file from source to destination folder.
 */
async function copyFile(fileId, destinationFolderId, fileName) {
    const res = await driveService.files.copy({
        fileId,
        requestBody: {
            name: fileName,
            parents: [destinationFolderId],
        },
        supportsAllDrives: true,
    });
    return res.data;
}

/**
 * Create a folder in destination.
 */
async function createFolder(name, parentFolderId) {
    const res = await driveService.files.create({
        requestBody: {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId],
        },
        supportsAllDrives: true,
    });
    return res.data;
}

/**
 * Sync files from source folder to destination folder.
 * One-way: source → destination.
 */
async function syncFolder(sourceFolderId, destFolderId, depth = 0) {
    const indent = '  '.repeat(depth);
    const sourceFiles = await listFiles(sourceFolderId);
    const destFiles = await listFiles(destFolderId);

    const destMap = new Map();
    for (const f of destFiles) {
        destMap.set(f.name, f);
    }

    let syncedCount = 0;

    for (const sourceFile of sourceFiles) {
        const existing = destMap.get(sourceFile.name);

        if (sourceFile.mimeType === 'application/vnd.google-apps.folder') {
            // Recursively sync sub-folders
            let destSubFolder;
            if (existing && existing.mimeType === 'application/vnd.google-apps.folder') {
                destSubFolder = existing;
            } else {
                destSubFolder = await createFolder(sourceFile.name, destFolderId);
                console.log(`${indent}[Drive] 📁 Created folder: ${sourceFile.name}`);
            }
            syncedCount += await syncFolder(sourceFile.id, destSubFolder.id, depth + 1);
        } else {
            // Sync file if it doesn't exist or is older
            if (!existing) {
                await copyFile(sourceFile.id, destFolderId, sourceFile.name);
                console.log(`${indent}[Drive] 📄 Copied: ${sourceFile.name}`);
                syncedCount++;
            } else if (new Date(sourceFile.modifiedTime) > new Date(existing.modifiedTime)) {
                // Check if contents are already identical
                if (sourceFile.md5Checksum && existing.md5Checksum && sourceFile.md5Checksum === existing.md5Checksum) {
                    console.log(`${indent}[Drive] ⏭️ Skipped (identical): ${sourceFile.name}`);
                } else {
                    // Delete old, copy new (Drive API doesn't support in-place update across accounts)
                    await driveService.files.delete({ fileId: existing.id, supportsAllDrives: true });
                    await copyFile(sourceFile.id, destFolderId, sourceFile.name);
                    console.log(`${indent}[Drive] 🔄 Updated: ${sourceFile.name}`);
                    syncedCount++;
                }
            }
        }
    }

    return syncedCount;
}

/**
 * Run sync for all active DriveConfigs.
 */
async function runDriveSync() {
    try {
        if (!driveService) {
            const initialized = await initDriveService();
            if (!initialized) return;
        }

        const configs = await nocodb.getDriveConfigs("(Status,eq,active)");
        if (!configs.length) {
            console.log('[Drive] No active drive configs to sync');
            return;
        }

        for (const cfg of configs) {
            try {
                const direction = cfg.Sync_Direction || 'studio\u2192client';
                console.log(`[Drive] Syncing: ${cfg.Title} (${direction})`);

                let synced = 0;
                let logMessage = '';

                if (direction === 'studio\u2192client' || direction === 'bidirectional') {
                    const count = await syncFolder(cfg.Studio_Folder_ID, cfg.Client_Folder_ID);
                    synced += count;
                    if (count > 0) logMessage += `Copied ${count} files to Client Folder. `;
                }

                if (direction === 'client\u2192studio' || direction === 'bidirectional') {
                    const count = await syncFolder(cfg.Client_Folder_ID, cfg.Studio_Folder_ID);
                    synced += count;
                    if (count > 0) logMessage += `Copied ${count} files to Studio Folder. `;
                }

                console.log(`[Drive] ✅ ${cfg.Title}: ${synced} files synced`);

                // Update last synced time
                await nocodb.updateDriveConfig(cfg.Id, { Last_Synced: new Date().toISOString() });

                if (synced > 0) {
                    await nocodb.logMessage({
                        syncConfigTitle: cfg.Title,
                        source: 'drive',
                        sourceMessageId: `sync_${Date.now()}`,
                        author: 'System',
                        content: `✅ ${logMessage.trim()}`,
                        syncedTo: direction,
                        status: 'success',
                        projectId: cfg.Project_Id
                    });
                }
            } catch (err) {
                console.error(`[Drive] ❌ ${cfg.Title} failed:`, err.message);
                await nocodb.updateDriveConfig(cfg.Id, { Status: 'error' });

                await nocodb.logMessage({
                    syncConfigTitle: cfg.Title,
                    source: 'drive',
                    sourceMessageId: `sync_err_${Date.now()}`,
                    author: 'System',
                    content: `❌ Sync failed: ${err.message}`,
                    syncedTo: cfg.Sync_Direction || 'studio\u2192client',
                    status: 'error',
                    projectId: cfg.Project_Id
                });
            }
        }
    } catch (err) {
        console.error('[Drive] Sync run failed:', err);
    }
}

module.exports = { initDriveService, runDriveSync, listFiles, syncFolder };
