import PocketBase from 'pocketbase';

const baseUrl = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';

// Shared admin client (privileged operations)
export const adminPb = new PocketBase(baseUrl);

if (process.env.POCKETBASE_ADMIN_TOKEN) {
  adminPb.authStore.save(process.env.POCKETBASE_ADMIN_TOKEN, {});
}

/**
 * Verify a user JWT with PocketBase and return the user record.
 * @param {string} token - PocketBase JWT provided by the client.
 * @returns {Promise<object>} The user record if valid.
 * @throws {Error} If the token is invalid/expired.
 */
export async function verifyUserToken(token) {
  const pb = new PocketBase(baseUrl);
  pb.authStore.save(token, {});
  try {
    const { record } = await pb.collection('users').authRefresh();
    return record;
  } finally {
    pb.authStore.clear();
  }
}

export default adminPb; 