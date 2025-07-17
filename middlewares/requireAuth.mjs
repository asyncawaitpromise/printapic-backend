import { verifyUserToken } from '../pbClient.mjs';

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers['authorization'] || '';
    const [, token] = header.split(' ');
    if (!token) {
      return res.status(401).json({ error: 'Missing token' });
    }

    const user = await verifyUserToken(token);
    req.user = user;

    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
} 