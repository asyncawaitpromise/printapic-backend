import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

dotenv.config({ path: `.env.local` })

const app = express();

// CORS middleware
app.use(cors({
  origin: ['http://127.0.0.1:3000', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://localhost:5173'],
  credentials: true
}));

// Built-in middleware
app.use(express.json());

app.get("/", (req, res) => {
    res.send("v1.0.0");
});

// Health-check
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

// --- Authenticated routes ---
import { requireAuth } from "./middlewares/requireAuth.mjs";
import { adminPb } from "./pbClient.mjs";

app.get("/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
});

app.post("/process-image", requireAuth, async (req, res) => {
    try {
        const { photoId, operation } = req.body;
        
        if (!photoId || !operation) {
            return res.status(400).json({ error: 'Missing photoId or operation' });
        }

        const { processImage } = await import('./services/imageProcessor.mjs');
        const result = await processImage(photoId, operation, req.user);
        
        res.json(result);
    } catch (error) {
        console.error('Image processing error:', error);
        res.status(500).json({ error: error.message || 'Failed to process image' });
    }
});

app.get("/edit-status/:editId", requireAuth, async (req, res) => {
    try {
        const { editId } = req.params;
        
        const edit = await adminPb.collection('printapic_edits').getOne(editId);
        
        // Verify the edit belongs to the user
        if (edit.user !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        res.json({
            id: edit.id,
            status: edit.status,
            tokens_cost: edit.tokens_cost,
            completed: edit.completed,
            has_result: !!edit.result_image,
            result_url: edit.result_image ? adminPb.files.getUrl(edit, edit.result_image) : null
        });
    } catch (error) {
        console.error('Edit status error:', error);
        res.status(500).json({ error: 'Failed to get edit status' });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
