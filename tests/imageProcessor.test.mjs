import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { processImage } from '../services/imageProcessor.mjs';

// Mock PocketBase
vi.mock('../pbClient.mjs', () => ({
    adminPb: {
        collection: vi.fn(() => ({
            getOne: vi.fn(),
            create: vi.fn()
        })),
        files: {
            getUrl: vi.fn()
        }
    }
}));

describe('Image Processing Endpoint', () => {
    let app;
    let mockUser;
    let mockImage;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        
        mockUser = {
            id: 'user123',
            email: 'test@example.com'
        };
        
        mockImage = {
            id: 'img123',
            user_id: 'user123',
            file: 'test-image.jpg',
            title: 'Test Image'
        };

        // Mock authentication middleware
        app.use((req, res, next) => {
            req.user = mockUser;
            next();
        });

        app.post('/process-image', async (req, res) => {
            try {
                const { imageId, operation } = req.body;
                const result = await processImage(imageId, operation, req.user);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    });

    it('should require imageId and operation', async () => {
        const response = await request(app)
            .post('/process-image')
            .send({});

        expect(response.status).toBe(500);
    });

    it('should process image successfully with valid parameters', async () => {
        const { adminPb } = await import('../pbClient.mjs');
        
        adminPb.collection().getOne.mockResolvedValue(mockImage);
        adminPb.files.getUrl.mockReturnValue('http://example.com/image.jpg');
        adminPb.collection().create.mockResolvedValue({
            id: 'processed123',
            user_id: mockUser.id,
            original_image_id: mockImage.id
        });

        const response = await request(app)
            .post('/process-image')
            .send({
                imageId: 'img123',
                operation: 'resize'
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.operation).toBe('resize');
    });
});