require('dotenv').config();
const { initDriveService, listFiles } = require('./src/drive/sync');

async function testDrive() {
    await initDriveService();
    try {
        console.log("Checking Studio Folder...");
        const studioFiles = await listFiles("13XQijOQbQ_KUeVIQwDvW5mbDkwlz2tqn");
        console.log("Studio Files Count:", studioFiles.length);
        console.log("Studio Files:", studioFiles);

        console.log("\nChecking Client Folder...");
        const clientFiles = await listFiles("1Fdsh-FirvP5TvcxMFyLiPCcoE7iFIc7A");
        console.log("Client Files Count:", clientFiles.length);
        console.log("Client Files:", clientFiles);
    } catch (error) {
        console.error("API Error:", error.message);
    }

    const nocodb = require('./src/nocodb');
    await nocodb.logMessage({
        syncConfigTitle: "Test Drive Sync",
        source: 'drive',
        sourceMessageId: `sync_test_${Date.now()}`,
        author: 'System',
        content: `✅ Copied 1 test file to Client Folder.`,
        syncedTo: 'Client Folder',
        status: 'success'
    });

    const { runDriveSync } = require('./src/drive/sync');
    await runDriveSync();
}

testDrive();
