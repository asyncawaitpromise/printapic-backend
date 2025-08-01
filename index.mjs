import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

dotenv.config({ path: `.env.local` })

const app = express();

// CORS middleware
app.use(cors({
  origin: [
    'http://127.0.0.1:3000', 
    'http://localhost:3000', 
    'http://127.0.0.1', 
    'http://localhost', 
    'http://127.0.0.1:5173', 
    'http://localhost:5173',
    'http://printapic.ezez.win', 
    'https://printapic.ezez.win'
],
  credentials: true
}));

// Built-in middleware
app.use(express.json());

app.get("/", (req, res) => {
    res.send("v0.0.5");
});

// Health-check
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

// Debug endpoint to list available collections and photos
app.get("/debug/collections", requireAuth, async (req, res) => {
    const debugId = `debug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[${debugId}] 🔍 Debug collections request from user ${req.user.id}`);
    
    try {
        await ensureAdminAuth();
        
        // List user's photos
        const userPhotos = await adminPb.collection('printapic_photos').getList(1, 20, {
            filter: `user = "${req.user.id}"`
        });
        
        console.log(`[${debugId}] 📋 Found ${userPhotos.items.length} photos for user`);
        
        res.json({
            user: {
                id: req.user.id,
                email: req.user.email
            },
            photos: userPhotos.items.map(photo => ({
                id: photo.id,
                created: photo.created,
                updated: photo.updated,
                user: photo.user,
                hasImage: !!photo.image
            })),
            totalPhotos: userPhotos.totalItems
        });
    } catch (error) {
        console.error(`[${debugId}] ❌ Debug error:`, error);
        res.status(500).json({ error: error.message });
    }
});

// --- Authenticated routes ---
import { requireAuth } from "./middlewares/requireAuth.mjs";
import { adminPb, ensureAdminAuth } from "./pbClient.mjs";

app.get("/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
});

app.post("/process-image", requireAuth, async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[${requestId}] 🚀 Process image request started`);
    console.log(`[${requestId}] 👤 User: ${req.user.id} (${req.user.email})`);
    console.log(`[${requestId}] 📥 Request body:`, JSON.stringify(req.body, null, 2));
    
    try {
        const { photoId, operation } = req.body;
        
        if (!photoId || !operation) {
            console.log(`[${requestId}] ❌ Missing required fields - photoId: ${!!photoId}, operation: ${!!operation}`);
            return res.status(400).json({ error: 'Missing photoId or operation' });
        }

        console.log(`[${requestId}] 🔄 Processing image ${photoId} with operation: ${operation}`);
        
        const { processImage } = await import('./services/imageProcessor.mjs');
        const result = await processImage(photoId, operation, req.user, requestId);
        
        console.log(`[${requestId}] ✅ Image processing completed successfully`);
        console.log(`[${requestId}] 📤 Response:`, JSON.stringify(result, null, 2));
        
        res.json(result);
    } catch (error) {
        console.error(`[${requestId}] ❌ Image processing error:`, error);
        console.error(`[${requestId}] 📊 Error details:`, {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        res.status(500).json({ error: error.message || 'Failed to process image' });
    }
});

app.get("/edit-status/:editId", requireAuth, async (req, res) => {
    const requestId = `status_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[${requestId}] 📊 Edit status request for editId: ${req.params.editId}`);
    console.log(`[${requestId}] 👤 User: ${req.user.id} (${req.user.email})`);
    
    try {
        const { editId } = req.params;
        
        console.log(`[${requestId}] 🔍 Fetching edit record: ${editId}`);
        await ensureAdminAuth();
        const edit = await adminPb.collection('printapic_edits').getOne(editId);
        console.log(`[${requestId}] 📄 Edit found - Status: ${edit.status}, Owner: ${edit.user}`);
        
        // Verify the edit belongs to the user
        if (edit.user !== req.user.id) {
            console.log(`[${requestId}] ❌ Unauthorized access - Edit owner: ${edit.user}, Request user: ${req.user.id}`);
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const response = {
            id: edit.id,
            status: edit.status,
            tokens_cost: edit.tokens_cost,
            completed: edit.completed,
            has_result: !!edit.result_image,
            result_url: edit.result_image ? adminPb.files.getUrl(edit, edit.result_image) : null
        };
        
        console.log(`[${requestId}] ✅ Edit status response:`, JSON.stringify(response, null, 2));
        res.json(response);
    } catch (error) {
        console.error(`[${requestId}] ❌ Edit status error:`, error);
        console.error(`[${requestId}] 📊 Error details:`, {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        res.status(500).json({ error: 'Failed to get edit status' });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
