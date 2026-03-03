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
            fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, md5Checksum, appProperties)',
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
            appProperties: {
                sourceId: fileId
            }
        },
        supportsAllDrives: true,
    });
    return res.data;
}

/**
 * Create a folder in destination.
 */
async function createFolder(name, parentFolderId, sourceId) {
    const res = await driveService.files.create({
        requestBody: {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId],
            appProperties: {
                sourceId: sourceId // Keep track of the original folder ID
            }
        },
        supportsAllDrives: true,
    });
    return res.data;
}

/**
 * Sync files from source folder to destination folder using mirror syncing logic.
 * Enables true mirror sync (deletions propagate) and fast concurrent transfers.
 */
async function syncFolder(sourceFolderId, destFolderId, depth = 0) {
    const indent = '  '.repeat(depth);
    const sourceFiles = await listFiles(sourceFolderId);
    const destFiles = await listFiles(destFolderId);

    // Map existing destination files by their sourceId (appProperties) or Fallback to Name
    const destMap = new Map();
    for (const f of destFiles) {
        if (f.appProperties && f.appProperties.sourceId) {
            destMap.set(`id_${f.appProperties.sourceId}`, f);
        } else {
            // Un-tracked file -> mapped by name (legacy fallback)
            destMap.set(`name_${f.name}`, f);
        }
    }

    let syncedCount = 0;

    // Batch processing helper map
    const promises = [];
    const BATCH_SIZE = 5;

    async function processBatch() {
        while (promises.length > 0) {
            const batch = promises.splice(0, BATCH_SIZE);
            await Promise.all(batch);
        }
    }

    // --- STEP 1: Sync or Update files from Source to Dest ---
    for (const sourceFile of sourceFiles) {
        // Find existing match by sourceId, fallback to name match for legacy files
        let existing = destMap.get(`id_${sourceFile.id}`) || destMap.get(`name_${sourceFile.name}`);

        if (sourceFile.mimeType === 'application/vnd.google-apps.folder') {
            promises.push((async () => {
                let destSubFolder;
                if (existing && existing.mimeType === 'application/vnd.google-apps.folder') {
                    destSubFolder = existing;
                    // Handle Rename scenario (ID matched, but name changed on source)
                    if (destSubFolder.name !== sourceFile.name) {
                        try {
                            await driveService.files.update({
                                fileId: destSubFolder.id,
                                requestBody: { name: sourceFile.name },
                                supportsAllDrives: true,
                            });
                            console.log(`${indent}[Drive] 🖋️ Renamed folder: ${existing.name} -> ${sourceFile.name}`);
                        } catch (e) {
                            console.log(`${indent}[Drive] ⚠️ Rename failed: ${e.message}`);
                        }
                    }
                } else {
                    destSubFolder = await createFolder(sourceFile.name, destFolderId, sourceFile.id);
                    console.log(`${indent}[Drive] 📁 Created folder: ${sourceFile.name}`);
                }

                // Recursively sync sub-folders, wait for it immediately so depth persists cleanly
                syncedCount += await syncFolder(sourceFile.id, destSubFolder.id, depth + 1);
            })());

        } else {
            promises.push((async () => {
                if (!existing) {
                    await copyFile(sourceFile.id, destFolderId, sourceFile.name);
                    console.log(`${indent}[Drive] 📄 Copied: ${sourceFile.name}`);
                    syncedCount++;
                } else {
                    // Handle Rename scenario (ID matched, but name changed on source)
                    if (existing.name !== sourceFile.name) {
                        try {
                            await driveService.files.update({
                                fileId: existing.id,
                                requestBody: { name: sourceFile.name },
                                supportsAllDrives: true,
                            });
                            console.log(`${indent}[Drive] 🖋️ Renamed file: ${existing.name} -> ${sourceFile.name}`);
                        } catch (e) {
                            console.log(`${indent}[Drive] ⚠️ Rename failed: ${e.message}`);
                        }
                    }

                    if (new Date(sourceFile.modifiedTime) > new Date(existing.modifiedTime)) {
                        if (sourceFile.md5Checksum && existing.md5Checksum && sourceFile.md5Checksum === existing.md5Checksum) {
                            console.log(`${indent}[Drive] ⏭️ Skipped (identical): ${sourceFile.name}`);
                        } else {
                            // Update file content
                            await driveService.files.delete({ fileId: existing.id, supportsAllDrives: true });
                            await copyFile(sourceFile.id, destFolderId, sourceFile.name);
                            console.log(`${indent}[Drive] 🔄 Updated: ${sourceFile.name}`);
                            syncedCount++;
                        }
                    }
                }
            })());
        }

        // Fire batch if reaching size limit to avoid rate limits and memory overflow
        if (promises.length >= BATCH_SIZE) {
            await processBatch();
        }
    }

    // Fire remaining uploads
    await processBatch();

    // --- STEP 2: Mirror Logic (Propagate source deletions to destination) ---
    const sourceIds = new Set(sourceFiles.map(f => f.id));
    const sourceNames = new Set(sourceFiles.map(f => f.name));

    const deletePromises = [];

    for (const destFile of destFiles) {
        let shouldTrash = false;

        // Tracked files: Check if source ID is gone
        if (destFile.appProperties && destFile.appProperties.sourceId) {
            if (!sourceIds.has(destFile.appProperties.sourceId)) {
                shouldTrash = true;
            }
        } else {
            // Legacy untracked files: Check if name is gone
            if (!sourceNames.has(destFile.name)) {
                shouldTrash = true;
            }
        }

        if (shouldTrash) {
            deletePromises.push((async () => {
                try {
                    await driveService.files.update({
                        fileId: destFile.id,
                        requestBody: { trashed: true },
                        supportsAllDrives: true,
                    });
                    console.log(`${indent}[Drive] 🗑️ Trashed removed item: ${destFile.name}`);
                } catch (e) {
                    console.log(`${indent}[Drive] ⚠️ Trash failed for ${destFile.name}: ${e.message}`);
                }
            })());

            if (deletePromises.length >= BATCH_SIZE) {
                const batch = deletePromises.splice(0, BATCH_SIZE);
                await Promise.all(batch);
            }
        }
    }

    if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
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
