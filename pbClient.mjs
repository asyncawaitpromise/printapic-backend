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
  const verifyId = `verify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[${verifyId}] 🔑 Starting token verification`);
  console.log(`[${verifyId}] 🌐 PocketBase URL: ${baseUrl}`);
  console.log(`[${verifyId}] 🎯 Token length: ${token?.length || 0} characters`);
  
  const pb = new PocketBase(baseUrl);
  
  try {
    console.log(`[${verifyId}] 💾 Saving token to authStore...`);
    pb.authStore.save(token, {});
    
    console.log(`[${verifyId}] 🔍 AuthStore isValid: ${pb.authStore.isValid}`);
    console.log(`[${verifyId}] 👤 AuthStore model: ${pb.authStore.model?.id || 'none'}`);
    
    if (!pb.authStore.isValid) {
      console.log(`[${verifyId}] ❌ AuthStore validation failed`);
      throw new Error('Token is not valid according to authStore');
    }
    
    console.log(`[${verifyId}] 🔄 Calling authRefresh to verify token...`);
    const result = await pb.collection('users').authRefresh();
    console.log(`[${verifyId}] ✅ Token verification successful`);
    console.log(`[${verifyId}] 👤 User verified: ${result.record.id} (${result.record.email})`);
    
    return result.record;
  } catch (error) {
    console.error(`[${verifyId}] ❌ Token verification failed:`, error);
    console.error(`[${verifyId}] 📊 Error details:`, {
      message: error.message,
      status: error.status,
      data: error.data,
      name: error.name
    });
    throw new Error(`Token verification failed: ${error.message}`);
  } finally {
    console.log(`[${verifyId}] 🧹 Clearing authStore`);
    pb.authStore.clear();
  }
}

export default adminPb; 