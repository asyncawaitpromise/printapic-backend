import { verifyUserToken } from '../pbClient.mjs';

export async function requireAuth(req, res, next) {
  const authId = `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[${authId}] 🔐 Authentication check started for ${req.method} ${req.path}`);
  
  try {
    const header = req.headers['authorization'] || '';
    console.log(`[${authId}] 📋 Authorization header present: ${!!header}`);
    console.log(`[${authId}] 📝 Authorization header format: "${header.substring(0, 20)}..."`);
    
    const [scheme, token] = header.split(' ');
    console.log(`[${authId}] 🏷️ Auth scheme: "${scheme}"`);
    console.log(`[${authId}] 🎫 Token present: ${!!token}`);
    
    if (!token) {
      console.log(`[${authId}] ❌ Missing token - header: "${header}"`);
      return res.status(401).json({ error: 'Missing token' });
    }

    console.log(`[${authId}] 🔍 Verifying token with PocketBase...`);
    const user = await verifyUserToken(token);
    console.log(`[${authId}] ✅ Token verified successfully - User: ${user.id} (${user.email})`);
    
    req.user = user;
    return next();
  } catch (err) {
    console.error(`[${authId}] ❌ Authentication failed:`, err);
    console.error(`[${authId}] 📊 Error details:`, {
      message: err.message,
      name: err.name,
      stack: err.stack?.split('\n').slice(0, 3).join('\n')
    });
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
} 