import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { requireAuth } from '../middlewares/requireAuth.mjs';

// Create app instance for testing
const app = express();
app.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Mock pbClient verifyUserToken
vi.mock('../pbClient.mjs', () => {
  return {
    verifyUserToken: vi.fn(async (token) => {
      if (token === 'valid') return { id: 'user123', email: 'test@example.com' };
      throw new Error('invalid');
    })
  };
});

describe('GET /me', () => {
  it('should return 401 without token', async () => {
    const res = await request(app).get('/me');
    expect(res.statusCode).toBe(401);
  });

  it('should return user when token is valid', async () => {
    const res = await request(app).get('/me').set('Authorization', 'Bearer valid');
    expect(res.statusCode).toBe(200);
    expect(res.body.user).toEqual({ id: 'user123', email: 'test@example.com' });
  });
}); 