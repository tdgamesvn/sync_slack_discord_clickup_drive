const { google } = require('googleapis');
const path = require('path');
const config = require('../config');
const nocodb = require('../nocodb');

let driveService = null;

/**
 * Initialize Google Drive API client with service account.
 */
function initDriveService() {
    const keyPath = path.resolve(config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH);
    const auth = new google.auth.GoogleAuth({
        keyFile: keyPath,
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
    driveService = google.drive({ version: 'v3', auth });
    console.log('[Drive] Service initialized');
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
            fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size)',
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
                // Delete old, copy new (Drive API doesn't support in-place update across accounts)
                await driveService.files.delete({ fileId: existing.id, supportsAllDrives: true });
                await copyFile(sourceFile.id, destFolderId, sourceFile.name);
                console.log(`${indent}[Drive] 🔄 Updated: ${sourceFile.name}`);
                syncedCount++;
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
        if (!driveService) initDriveService();

        const configs = await nocodb.getDriveConfigs("(Status,eq,active)");
        if (!configs.length) {
            console.log('[Drive] No active drive configs to sync');
            return;
        }

        for (const cfg of configs) {
            try {
                console.log(`[Drive] Syncing: ${cfg.Title} (${cfg.Sync_Direction || 'studio→client'})`);

                const synced = await syncFolder(cfg.Studio_Folder_ID, cfg.Client_Folder_ID);
                console.log(`[Drive] ✅ ${cfg.Title}: ${synced} files synced`);

                // Update last synced time
                await nocodb.updateDriveConfig(cfg.Id, { Last_Synced: new Date().toISOString() });
            } catch (err) {
                console.error(`[Drive] ❌ ${cfg.Title} failed:`, err.message);
                await nocodb.updateDriveConfig(cfg.Id, { Status: 'error' });
            }
        }
    } catch (err) {
        console.error('[Drive] Sync run failed:', err);
    }
}

module.exports = { initDriveService, runDriveSync, listFiles, syncFolder };
