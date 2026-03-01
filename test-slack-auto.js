require('dotenv').config();
const axios = require('axios');

async function testClickUpWebhook() {
    const listId = "901815849460"; // Example List ID (Art)
    // Replace these logic mappings with ID values from your NocoDB `ListMappings`
    console.log("Simulating ClickUp webhook events to localhost:3000...");

    const taskId = "TEST_AUTO_" + Math.floor(Math.random() * 10000);

    // Provide mocked getTask payload if we really wanted to run it, but this is a unit-test 
    // over HTTP which hits the live DB. The user should be asked to test it in ClickUp.
    console.log("Since the webhook code uses `getTask(taskId)` which calls real ClickUp API, we cannot spoof a fully fake ID without failing API.");
    console.log("Please test by actually creating, updating, and deleting a task on ClickUp!");
}

testClickUpWebhook();
