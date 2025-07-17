import PocketBase from 'pocketbase';
import dotenv from 'dotenv';

dotenv.config({ path: `.env.local` })

/**
 * Printapic – PocketBase Collection Bootstrapper
 *
 * This script (re)creates the minimal set of collections our
 * frontend + backend expect.  It is safe to run multiple times – existing
 * collections with the same name are deleted first (except the built-in
 * `users` collection which is only extended).
 *
 * Collections
 * ───────────
 * 1. photos               – uploaded originals (file)
 * 2. edits                – remix / edited variants of a photo
 * 3. payments             – Stripe Checkout records (token top-ups)
 * 4. token_transactions   – every token credit/debit for audit trail
 * 5. orders               – physical sticker orders & shipping info
 *
 * Required environment variables (see `.env.example`):
 *   • POCKETBASE_URL
 *   • PB_SUPER_EMAIL
 *   • PB_SUPER_PASS
 *
 * Usage:
 *   node scripts/createPrintapicCollections.js
 */

const requiredEnv = ['POCKETBASE_URL', 'PB_SUPER_EMAIL', 'PB_SUPER_PASS'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`${key} is not defined in your .env.local file`);
  }
}

const pb = new PocketBase(process.env.POCKETBASE_URL);

const authenticateAdmin = async () => {
  console.log('Authenticating as PocketBase Super Admin…');
  await pb.collection('_superusers').authWithPassword(
    process.env.PB_SUPER_EMAIL,
    process.env.PB_SUPER_PASS,
  );
  console.log('✅ Authenticated.');
};

/**
 * Idempotently deletes a collection if it exists (best-effort).
 */
const deleteIfExists = async (name) => {
  try {
    const col = await pb.collections.getFirstListItem(`name="${name}"`);
    await pb.collections.delete(col.id);
    console.log(`  – Deleted existing collection: ${name}`);
  } catch (err) {
    if (err?.status !== 404) throw err; // rethrow unexpected errors
  }
};

// Add new helper to (re)create auth collection
const createAuthUsersCollection = async (prefix) => {
  console.log(`\nCreating '${prefix}users' auth collection …`);
  const usersCollection = await pb.collections.create({
    name: `${prefix}users`,
    type: 'auth',
    fields: [
      { name: 'display_name', type: 'text', required: false, max: 120 },
      { name: 'tokens', type: 'number', required: true, default: 0, options: { min: 0 } },
      { name: 'avatar', type: 'file', maxSelect: 1, thumbSizes: '100x100' },
    ],
  });
  await pb.collections.update(usersCollection.id, {
    listRule: '@request.auth.id = id',
    viewRule: '@request.auth.id = id',
    updateRule: '@request.auth.id = id',
    deleteRule: null,
  });
  console.log("  → '" + prefix + "users' collection created & rules applied.");
  return usersCollection;
};

const main = async () => {
  try {
    await authenticateAdmin();

    // ---- Naming ----
    const prefix = 'printapic_';

    // ---- Cleanup (in dependency order: orders ➜ edits ➜ photos ➜ payments ➜ token_transactions) ----
    console.log('\nStarting cleanup of existing collections …');
    const collectionsToDelete = [
      `${prefix}orders`,
      `${prefix}edits`,
      `${prefix}photos`,
      `${prefix}payments`,
      `${prefix}token_transactions`,
      `${prefix}users`,
    ];
    for (const name of collectionsToDelete) {
      await deleteIfExists(name);
    }
    console.log('Cleanup complete.');

    // ---- Create prefixed auth users collection ----
    const usersCol = await createAuthUsersCollection(prefix);

    // ---- Create `photos` collection ----
    console.log("\nCreating '" + prefix + "photos' collection …");
    const photos = await pb.collections.create({
      name: `${prefix}photos`,
      type: 'base',
      fields: [
        { name: 'user', type: 'relation', required: true, collectionId: usersCol.id, maxSelect: 1, cascadeDelete: false },
        { name: 'image', type: 'file', required: true, maxSelect: 1, thumbSizes: '300x0,500x0' },
        { name: 'caption', type: 'text', max: 140 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    });
    await pb.collections.update(photos.id, {
      listRule: '@request.auth.id = user',
      viewRule: '@request.auth.id = user',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id = user',
      deleteRule: '@request.auth.id = user',
    });
    console.log("  → 'photos' collection created & rules applied.");

    // ---- Create `edits` collection ----
    console.log("\nCreating '" + prefix + "edits' collection …");
    const edits = await pb.collections.create({
      name: `${prefix}edits`,
      type: 'base',
      fields: [
        { name: 'user', type: 'relation', required: true, collectionId: usersCol.id, maxSelect: 1, cascadeDelete: false },
        { name: 'photo', type: 'relation', required: true, collectionId: photos.id, maxSelect: 1, cascadeDelete: false },
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['pending', 'processing', 'done', 'failed'],
          default: 'pending',
        },
        { name: 'result_image', type: 'file', maxSelect: 1 },
        { name: 'tokens_cost', type: 'number', options: { min: 0 } },
        { name: 'completed', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    });
    await pb.collections.update(edits.id, {
      listRule: '@request.auth.id = user',
      viewRule: '@request.auth.id = user',
      createRule: '@request.auth.id = user',
      updateRule: '@request.auth.id = user',
      deleteRule: null, // edits should not be deletable by users
    });
    console.log("  → 'edits' collection created & rules applied.");

    // ---- Create `payments` collection ----
    console.log("\nCreating '" + prefix + "payments' collection …");
    const payments = await pb.collections.create({
      name: `${prefix}payments`,
      type: 'base',
      fields: [
        { name: 'user', type: 'relation', required: true, collectionId: usersCol.id, maxSelect: 1, cascadeDelete: false },
        { name: 'stripe_session_id', type: 'text', required: true, unique: true },
        { name: 'price_id', type: 'text', required: true },
        { name: 'amount_cents', type: 'number', required: true, options: { min: 0 } },
        { name: 'tokens', type: 'number', required: true, options: { min: 0 } },
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['pending', 'complete', 'failed'],
          default: 'pending',
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
    });
    await pb.collections.update(payments.id, {
      listRule: '@request.auth.id = user',
      viewRule: '@request.auth.id = user',
      createRule: null, // only backend service creates payments
      updateRule: null,
      deleteRule: null,
    });
    console.log("  → 'payments' collection created & rules applied.");

    // ---- Create `token_transactions` collection ----
    console.log("\nCreating '" + prefix + "token_transactions' collection …");
    const tx = await pb.collections.create({
      name: `${prefix}token_transactions`,
      type: 'base',
      fields: [
        { name: 'user', type: 'relation', required: true, collectionId: usersCol.id, maxSelect: 1, cascadeDelete: false },
        { name: 'amount', type: 'number', required: true }, // positive or negative
        { name: 'reason', type: 'text', required: true },
        { name: 'reference_id', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
    });
    await pb.collections.update(tx.id, {
      listRule: '@request.auth.id = user',
      viewRule: '@request.auth.id = user',
      createRule: null, // backend only
      updateRule: null,
      deleteRule: null,
    });
    console.log("  → 'token_transactions' collection created & rules applied.");

    // ---- Create `orders` collection ----
    console.log("\nCreating '" + prefix + "orders' collection …");
    const orders = await pb.collections.create({
      name: `${prefix}orders`,
      type: 'base',
      fields: [
        { name: 'user', type: 'relation', required: true, collectionId: usersCol.id, maxSelect: 1, cascadeDelete: false },
        { name: 'edits', type: 'relation', required: true, collectionId: edits.id, cascadeDelete: false, maxSelect: 20 },
        { name: 'shipping_address', type: 'json', required: true },
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['pending', 'printing', 'shipped', 'delivered'],
          default: 'pending',
        },
        { name: 'tracking_number', type: 'text' },
        { name: 'tokens_cost', type: 'number', required: true, options: { min: 0 } },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    });
    await pb.collections.update(orders.id, {
      listRule: '@request.auth.id = user',
      viewRule: '@request.auth.id = user',
      createRule: '@request.auth.id = user',
      updateRule: null, // updated by backend / admin only
      deleteRule: null,
    });
    console.log("  → 'orders' collection created & rules applied.");

    console.log('\n✅ All collections created successfully!');
  } catch (error) {
    console.error('\n❌ Collection setup failed:');
    if (error.response && typeof error.response === 'object') {
      console.error('API Error:', error.message);
      console.error(`URL: ${error.url}`);
      console.error(`Status: ${error.status}`);
      if (error.response.data) {
        console.error('Validation Details:', JSON.stringify(error.response.data, null, 2));
      }
    } else {
      console.error('Unexpected Error:', error);
    }
    process.exit(1);
  }
};

main(); 