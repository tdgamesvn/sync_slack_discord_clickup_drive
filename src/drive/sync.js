const { google } = require('googleapis');
const nocodb = require('../nocodb');
const auth = require('./auth');

let driveService = null;

/**
 * Retry wrapper with exponential backoff for Drive API calls.
 * Handles rate limits (429), server errors (5xx), and network issues.
 */
async function withRetry(fn, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const status = err?.response?.status || err?.code;
            const isRetryable = status === 429 || status === 503 || status === 500 || status === 'ECONNRESET' || status === 'ETIMEDOUT';

            if (!isRetryable || attempt === maxRetries) {
                throw err;
            }

            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // 1s, 2s, 4s... max 10s
            console.log(`[Drive] ⏳ Retry ${attempt}/${maxRetries} after ${delay}ms (${status})`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

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
        const res = await withRetry(() => driveService.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, md5Checksum, appProperties)',
            pageSize: 100,
            pageToken,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        }));
        files.push(...(res.data.files || []));
        pageToken = res.data.nextPageToken;
    } while (pageToken);

    return files;
}

/**
 * Copy a file from source to destination folder.
 */
async function copyFile(fileId, destinationFolderId, fileName) {
    const res = await withRetry(() => driveService.files.copy({
        fileId,
        requestBody: {
            name: fileName,
            parents: [destinationFolderId],
            appProperties: {
                sourceId: fileId
            }
        },
        supportsAllDrives: true,
    }));
    return res.data;
}

/**
 * Create a folder in destination.
 */
async function createFolder(name, parentFolderId, sourceId) {
    const res = await withRetry(() => driveService.files.create({
        requestBody: {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId],
            appProperties: {
                sourceId: sourceId
            }
        },
        supportsAllDrives: true,
    }));
    return res.data;
}

// --- Safety Constants ---
const DELETE_THRESHOLD_PERCENT = 50; // Abort if > 50% of dest files would be deleted

/**
 * Sync files from source folder to destination folder.
 * @param {string} sourceFolderId - Source folder ID
 * @param {string} destFolderId - Destination folder ID
 * @param {object} options - Sync options
 * @param {boolean} options.protectDest - If true, skip mirror delete (protect destination from deletions)
 * @param {boolean} options.mirrorDelete - If true, enable mirror delete logic (default: true)
 * @param {function} options.logDeletion - Callback to log deletions: (fileName, fileId) => void
 * @param {string} options.configTitle - Config title for logging
 * @param {number} depth - Recursion depth (internal)
 */
async function syncFolder(sourceFolderId, destFolderId, options = {}, depth = 0) {
    const { protectDest = false, mirrorDelete = true, logDeletion = null, configTitle = '' } = options;
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
                    // Stamp sourceId on name-matched folders for accurate future tracking
                    if (!existing.appProperties?.sourceId) {
                        try {
                            await driveService.files.update({
                                fileId: existing.id,
                                requestBody: { appProperties: { sourceId: sourceFile.id } },
                                supportsAllDrives: true,
                            });
                            console.log(`${indent}[Drive] 🏷️ Stamped sourceId on folder: ${sourceFile.name}`);
                        } catch (e) {
                            console.log(`${indent}[Drive] ⚠️ Stamp sourceId failed: ${e.message}`);
                        }
                    }
                } else {
                    destSubFolder = await createFolder(sourceFile.name, destFolderId, sourceFile.id);
                    console.log(`${indent}[Drive] 📁 Created folder: ${sourceFile.name}`);
                }

                // Recursively sync sub-folders, pass options through
                syncedCount += await syncFolder(sourceFile.id, destSubFolder.id, options, depth + 1);
            })());

        } else {
            promises.push((async () => {
                if (!existing) {
                    await copyFile(sourceFile.id, destFolderId, sourceFile.name);
                    console.log(`${indent}[Drive] 📄 Copied: ${sourceFile.name}`);
                    syncedCount++;
                } else {
                    // Stamp sourceId on name-matched files for accurate future tracking
                    if (!existing.appProperties?.sourceId) {
                        try {
                            await driveService.files.update({
                                fileId: existing.id,
                                requestBody: { appProperties: { sourceId: sourceFile.id } },
                                supportsAllDrives: true,
                            });
                            console.log(`${indent}[Drive] 🏷️ Stamped sourceId on file: ${sourceFile.name}`);
                        } catch (e) {
                            console.log(`${indent}[Drive] ⚠️ Stamp sourceId failed: ${e.message}`);
                        }
                    }

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

    // --- STEP 2: Mirror Delete Logic ---
    // Skip mirror delete if destination is protected or mirrorDelete is disabled
    if (protectDest || !mirrorDelete) {
        console.log(`${indent}[Drive] 🛡️ Skipping mirror delete (destination protected)`);
        return syncedCount;
    }

    // Re-read destination files after STEP 1 to pick up newly stamped sourceIds
    const updatedDestFiles = await listFiles(destFolderId);
    const sourceIds = new Set(sourceFiles.map(f => f.id));
    const sourceNames = new Set(sourceFiles.map(f => f.name));

    // Build a map to detect duplicates (multiple dest files pointing to same source)
    const trackedSourceIds = new Map();
    for (const df of updatedDestFiles) {
        if (df.appProperties?.sourceId) {
            if (!trackedSourceIds.has(df.appProperties.sourceId)) {
                trackedSourceIds.set(df.appProperties.sourceId, df);
            }
        }
    }

    // --- Collect items to delete ---
    const itemsToDelete = [];

    for (const destFile of updatedDestFiles) {
        let shouldTrash = false;
        let reason = '';

        if (destFile.appProperties?.sourceId) {
            // This file was synced from source — check if source still exists
            const sid = destFile.appProperties.sourceId;
            if (!sourceIds.has(sid)) {
                shouldTrash = true;
                reason = 'source deleted';
            } else if (trackedSourceIds.get(sid)?.id !== destFile.id) {
                shouldTrash = true;
                reason = 'duplicate (tracked)';
            }
        } else {
            // NO sourceId = "native" file added directly to this folder
            // Only trash if it's a duplicate of a tracked file (cleanup leftover)
            const matchingSource = sourceFiles.find(sf => sf.name === destFile.name);
            if (matchingSource && trackedSourceIds.has(matchingSource.id)) {
                const trackedCopy = trackedSourceIds.get(matchingSource.id);
                if (trackedCopy.id !== destFile.id) {
                    shouldTrash = true;
                    reason = 'duplicate (untracked)';
                }
            }
            // Otherwise: keep it! It's a native file, not from sync
        }

        if (shouldTrash) {
            itemsToDelete.push({ file: destFile, reason });
        }
    }

    // --- DELETE THRESHOLD CHECK ---
    if (updatedDestFiles.length > 0 && itemsToDelete.length > 0) {
        const deletePercent = (itemsToDelete.length / updatedDestFiles.length) * 100;
        if (deletePercent > DELETE_THRESHOLD_PERCENT) {
            const msg = `🚨 ABORT: Would delete ${itemsToDelete.length}/${updatedDestFiles.length} items (${deletePercent.toFixed(0)}%) — exceeds ${DELETE_THRESHOLD_PERCENT}% safety threshold!`;
            console.error(`${indent}[Drive] ${msg}`);
            console.error(`${indent}[Drive] Items that would be deleted:`, itemsToDelete.map(i => `${i.file.name} (${i.reason})`).join(', '));

            // Log alert to NocoDB
            if (logDeletion) {
                await logDeletion(`🚨 SYNC ABORTED: Would delete ${itemsToDelete.length}/${updatedDestFiles.length} files (${deletePercent.toFixed(0)}%). Manual review required.`, null, 'threshold_alert');
            }

            return syncedCount; // Abort without deleting
        }
    }

    // --- Execute deletions ---
    const deletePromises = [];

    for (const { file: destFile, reason } of itemsToDelete) {
        deletePromises.push((async () => {
            try {
                await driveService.files.update({
                    fileId: destFile.id,
                    requestBody: { trashed: true },
                    supportsAllDrives: true,
                });
                console.log(`${indent}[Drive] 🗑️ Trashed: ${destFile.name} (${reason})`);

                // Audit log
                if (logDeletion) {
                    await logDeletion(destFile.name, destFile.id, reason);
                }
            } catch (e) {
                console.log(`${indent}[Drive] ⚠️ Trash failed for ${destFile.name}: ${e.message}`);
            }
        })());

        if (deletePromises.length >= BATCH_SIZE) {
            const batch = deletePromises.splice(0, BATCH_SIZE);
            await Promise.all(batch);
        }
    }

    if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
    }

    return syncedCount;
}

/**
 * Run sync for all active DriveConfigs.
 * Implements safety: Client folder is NEVER subject to mirror deletions.
 * Bidirectional: copy both ways, only mirror-delete from Client→Studio direction.
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
                const direction = cfg.Sync_Direction || 'studio→client';
                console.log(`[Drive] Syncing: ${cfg.Title} (${direction})`);

                let synced = 0;
                let logMessage = '';

                // Helper: audit log callback for deletions
                const logDeletion = async (fileName, fileId, reason) => {
                    try {
                        await nocodb.logMessage({
                            syncConfigTitle: cfg.Title,
                            source: 'drive',
                            sourceMessageId: `del_${fileId || Date.now()}`,
                            author: 'System',
                            content: reason === 'threshold_alert'
                                ? `${fileName}` // fileName contains the full alert message
                                : `🗑️ Deleted: ${fileName} (${reason})`,
                            syncedTo: direction,
                            status: reason === 'threshold_alert' ? 'warning' : 'success',
                            projectId: cfg.Project_Id
                        });
                    } catch (e) {
                        console.log(`[Drive] ⚠️ Audit log failed: ${e.message}`);
                    }
                };

                if (direction === 'studio→client') {
                    // Studio → Client: Copy files, but PROTECT Client (no mirror delete on Client)
                    const count = await syncFolder(cfg.Studio_Folder_ID, cfg.Client_Folder_ID, {
                        protectDest: true, // 🛡️ Client is always protected
                        logDeletion,
                        configTitle: cfg.Title,
                    });
                    synced += count;
                    if (count > 0) logMessage += `Copied ${count} files to Client Folder. `;

                } else if (direction === 'client→studio') {
                    // Client → Studio: Copy files AND mirror delete on Studio
                    const count = await syncFolder(cfg.Client_Folder_ID, cfg.Studio_Folder_ID, {
                        protectDest: false, // Studio can be mirror-deleted based on Client
                        mirrorDelete: true,
                        logDeletion,
                        configTitle: cfg.Title,
                    });
                    synced += count;
                    if (count > 0) logMessage += `Copied ${count} files to Studio Folder. `;

                } else if (direction === 'bidirectional') {
                    // BIDIRECTIONAL SAFE SYNC:
                    // 1. Copy new files: Studio → Client (no delete on Client)
                    const count1 = await syncFolder(cfg.Studio_Folder_ID, cfg.Client_Folder_ID, {
                        protectDest: true, // 🛡️ Never delete Client files
                        logDeletion,
                        configTitle: cfg.Title,
                    });
                    synced += count1;
                    if (count1 > 0) logMessage += `Copied ${count1} files to Client Folder. `;

                    // 2. Copy new files: Client → Studio + mirror delete on Studio
                    const count2 = await syncFolder(cfg.Client_Folder_ID, cfg.Studio_Folder_ID, {
                        protectDest: false, // Studio mirrors Client (Client is the master)
                        mirrorDelete: true,
                        logDeletion,
                        configTitle: cfg.Title,
                    });
                    synced += count2;
                    if (count2 > 0) logMessage += `Copied ${count2} files to Studio Folder. `;
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
                    syncedTo: cfg.Sync_Direction || 'studio→client',
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
