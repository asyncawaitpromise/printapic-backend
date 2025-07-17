/* eslint-disable no-console */
import PocketBase from 'pocketbase';
import 'dotenv/config';

/**
 * PocketBase Collection Schemas
 *
 * This script automates the setup of collections based on the schema
 * defined in `scripts/.collectionPlan`.
 *
 * It is idempotent: it will first delete existing collections with the
 * same names before recreating them. This ensures a clean slate on every run.
 *
 * Prerequisites:
 * 1. A running PocketBase instance.
 * 2. A `.env` file in the root directory with the following variables:
 *    - POCKETBASE_URL: The URL of your PocketBase instance (e.g., http://127.0.0.1:8090)
 *    - PB_SUPER_EMAIL: The email of a PocketBase admin user.
 *    - PB_SUPER_PASS: The password for the admin user.
 * 3. Dependencies installed: `pnpm install pocketbase dotenv`
 *
 * Usage:
 * node scripts/createPbCollections.js
 */

const main = async () => {
  // --- Connection ---
  if (!process.env.POCKETBASE_URL) {
    throw new Error('POCKETBASE_URL is not defined in your .env file');
  }
  const pb = new PocketBase(process.env.POCKETBASE_URL);

  try {
    // --- Authentication ---
    console.log('Attempting to authenticate as admin...');
    await pb.collection('_superusers').authWithPassword(
      process.env.PB_SUPER_EMAIL,
      process.env.PB_SUPER_PASS,
    );
    console.log(`Successfully authenticated as ${process.env.PB_SUPER_EMAIL}.`);

    // --- Cleanup existing collections ---
    // We delete in reverse order of dependency to avoid relation errors.
    const collectionsToDelete = ['bigfoot_homepage_bans', 'bigfoot_homepage_chat_messages', 'bigfoot_homepage_users'];
    console.log('\nStarting cleanup of existing collections...');
    for (const name of collectionsToDelete) {
      try {
        const collection = await pb.collections.getFirstListItem(`name="${name}"`);
        await pb.collections.delete(collection.id);
        console.log(`  - Deleted collection: ${name}`);
      } catch (error) {
        if (error.status === 404) {
          console.log(`  - Collection '${name}' not found, skipping deletion.`);
        } else {
          // Rethrow for other errors
          throw new Error(`Failed to delete collection '${name}': ${error.message}`);
        }
      }
    }
    console.log('Cleanup complete.');

    // --- Create 'users' collection ---
    console.log("\nCreating 'bigfoot_homepage_users' collection...");
    const usersCollection = await pb.collections.create({
      name: 'bigfoot_homepage_users',
      type: 'base',
      fields: [
        { name: 'fingerprint_hash', type: 'text', required: true, min: 10, unique: true },
        { name: 'username', type: 'text', required: true, min: 3, max: 20 },
        { name: 'user_color', type: 'text', required: true, pattern: '^#([A-Fa-f0-9]{6})$' },
        { name: 'is_blocked', type: 'bool', default: false },
        { name: 'message_count', type: 'number', min: 0, default: 0 },
        { name: 'last_message_sent', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    });
    console.log(" -> 'bigfoot_homepage_users' collection created. Setting API rules...");
    await pb.collections.update(usersCollection.id, {
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: null,
      deleteRule: null,
    });
    console.log(" -> API rules for 'bigfoot_homepage_users' set.");

    // --- Create 'chat_messages' collection ---
    console.log("\nCreating 'bigfoot_homepage_chat_messages' collection...");
    const messagesCollection = await pb.collections.create({
      name: 'bigfoot_homepage_chat_messages',
      type: 'base',
      fields: [
        // Relation to the author; NOT unique so a user can send unlimited messages
        { name: 'user', type: 'relation', required: true, collectionId: usersCollection.id, cascadeDelete: false, maxSelect: 1 },
        { name: 'username', type: 'text', required: true, min: 3, max: 20 },
        { name: 'user_color', type: 'text', required: true, pattern: '^#([A-Fa-f0-9]{6})$' },
        { name: 'message', type: 'text', required: true, min: 1, max: 280 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    });
    console.log(" -> 'bigfoot_homepage_chat_messages' collection created. Setting API rules...");
    await pb.collections.update(messagesCollection.id, {
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: null,
      deleteRule: null,
    });
    console.log(" -> API rules for 'bigfoot_homepage_chat_messages' set.");

    // --- Create 'bans' collection ---
    console.log("\nCreating 'bigfoot_homepage_bans' collection...");
    const adminsCollection = await pb.collections.getFirstListItem('name="_superusers"');
    const bansCollection = await pb.collections.create({
      name: 'bigfoot_homepage_bans',
      type: 'base',
      fields: [
        { name: 'user', type: 'relation', required: true, collectionId: usersCollection.id, cascadeDelete: false, maxSelect: 1, unique: true },
        { name: 'reason', type: 'text', max: 140 },
        { name: 'banned_by', type: 'relation', collectionId: adminsCollection.id, cascadeDelete: false, maxSelect: 1 },
        { name: 'banned_until', type: 'date' },
        { name: 'is_permanent', type: 'bool', default: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    });
    console.log(" -> 'bigfoot_homepage_bans' collection created. Setting API rules...");
    await pb.collections.update(bansCollection.id, {
      listRule: '',
      viewRule: '',
      createRule: null,
      updateRule: null,
      deleteRule: null,
    });
    console.log(" -> API rules for 'bigfoot_homepage_bans' set.");

    // --- Final Instructions ---
    console.log('\n✅ All collections were created successfully!');
  } catch (error) {
    console.error('\n❌ An error occurred during collection setup:');

    // PocketBase specific error logging for ClientResponseError
    if (error.response && typeof error.response === 'object') {
      console.error('API Error:', error.message);
      console.error(`URL: ${error.url}`);
      console.error(`Status: ${error.status}`);

      // The detailed validation errors are in `error.response.data`
      if (error.response.data) {
        console.error('Validation Details:', JSON.stringify(error.response.data, null, 2));
      } else {
        console.error('Response body was empty.');
      }
    } else {
      // Generic error logging for other types of errors
      console.error('An unexpected error occurred:', error);
    }

    process.exit(1);
  }
};

main();
