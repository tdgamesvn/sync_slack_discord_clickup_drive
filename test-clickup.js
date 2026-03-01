const clickupApi = require('./src/platforms/clickup-api');
require('dotenv').config();

async function testUpload() {
    try {
        const buffer = Buffer.from('test ' + Date.now());
        const res = await clickupApi.uploadAttachment('86ewqm48c', buffer, 'Image from iOS');
        console.log('Upload success:', res);
    } catch (err) {
        console.error('Upload failed:', err.response?.data || err.message);
    }
}
testUpload();
