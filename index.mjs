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
    const version = "v0.0.8";
    // Disable caching so clients always fetch the latest version
    res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate', // HTTP/1.1
        'Pragma': 'no-cache',                                   // HTTP/1.0
        'Expires': '0'                                          // Proxies
    });

    // Serve a tiny HTML page that also contains the same cache-busting meta tags
    res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>API version</title>
</head>
<body>
  ${version}
</body>
</html>`);
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
        const { photoId, operation, promptKey } = req.body;
        
        if (!photoId || !operation) {
            console.log(`[${requestId}] ❌ Missing required fields - photoId: ${!!photoId}, operation: ${!!operation}`);
            return res.status(400).json({ error: 'Missing photoId or operation' });
        }

        console.log(`[${requestId}] 🔄 Processing image ${photoId} with operation: ${operation}, promptKey: ${promptKey}`);
        
        const { processImage } = await import('./services/imageProcessor.mjs');
        const result = await processImage(photoId, operation, req.user, requestId, promptKey);
        
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
            message: edit.status === 'done' ? 'Processing complete. Check your photos for the result.' : 'Processing in progress.'
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

app.post("/api/orders", requireAuth, async (req, res) => {
    const requestId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[${requestId}] 🛒 Order creation request started`);
    console.log(`[${requestId}] 👤 User: ${req.user.id} (${req.user.email})`);
    console.log(`[${requestId}] 📥 Request body:`, JSON.stringify(req.body, null, 2));
    
    try {
        const { items, shippingAddress } = req.body;
        
        // Validate request structure
        if (!items || !Array.isArray(items) || items.length === 0) {
            console.log(`[${requestId}] ❌ Missing or empty items array`);
            return res.status(400).json({ error: 'Missing or empty items array' });
        }
        
        if (!shippingAddress || typeof shippingAddress !== 'object') {
            console.log(`[${requestId}] ❌ Missing or invalid shipping address`);
            return res.status(400).json({ error: 'Missing or invalid shipping address' });
        }
        
        // Validate shipping address structure
        const requiredAddressFields = ['name', 'addressLine1'];
        for (const field of requiredAddressFields) {
            if (!shippingAddress[field]) {
                console.log(`[${requestId}] ❌ Missing required shipping address field: ${field}`);
                return res.status(400).json({ error: `Missing required shipping address field: ${field}` });
            }
        }
        
        await ensureAdminAuth();
        
        // Validate each order item and collect edit IDs
        const editIds = [];
        let totalTokenCost = 0;
        const pricingMap = {
            'small': 200,
            'medium': 250,
            'large': 300
        };
        
        console.log(`[${requestId}] 🔍 Validating ${items.length} order items`);
        
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            console.log(`[${requestId}] 📦 Validating item ${i + 1}:`, JSON.stringify(item, null, 2));
            
            // Validate item structure
            if (!item.photoId || !item.editId || !item.size || !item.quantity) {
                console.log(`[${requestId}] ❌ Item ${i + 1} missing required fields`);
                return res.status(400).json({ error: `Item ${i + 1} missing required fields (photoId, editId, size, quantity)` });
            }
            
            if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
                console.log(`[${requestId}] ❌ Item ${i + 1} invalid quantity: ${item.quantity}`);
                return res.status(400).json({ error: `Item ${i + 1} has invalid quantity` });
            }
            
            // Validate size
            const size = item.size.toLowerCase();
            if (!pricingMap[size]) {
                console.log(`[${requestId}] ❌ Item ${i + 1} invalid size: ${item.size}`);
                return res.status(400).json({ error: `Item ${i + 1} has invalid size. Must be small, medium, or large` });
            }
            
            // Validate that photo exists and belongs to user
            try {
                const photo = await adminPb.collection('printapic_photos').getOne(item.photoId);
                if (photo.user !== req.user.id) {
                    console.log(`[${requestId}] ❌ Photo ${item.photoId} does not belong to user`);
                    return res.status(403).json({ error: 'Access denied to specified photo' });
                }
                console.log(`[${requestId}] ✅ Photo ${item.photoId} validated`);
            } catch (error) {
                console.log(`[${requestId}] ❌ Photo ${item.photoId} not found:`, error.message);
                return res.status(404).json({ error: `Photo ${item.photoId} not found` });
            }
            
            // Validate that edit exists, belongs to user, and is completed
            try {
                const edit = await adminPb.collection('printapic_edits').getOne(item.editId);
                if (edit.user !== req.user.id) {
                    console.log(`[${requestId}] ❌ Edit ${item.editId} does not belong to user`);
                    return res.status(403).json({ error: 'Access denied to specified edit' });
                }
                if (edit.status !== 'done') {
                    console.log(`[${requestId}] ❌ Edit ${item.editId} not completed (status: ${edit.status})`);
                    return res.status(400).json({ error: `Edit ${item.editId} is not completed` });
                }
                if (edit.photo !== item.photoId) {
                    console.log(`[${requestId}] ❌ Edit ${item.editId} does not belong to photo ${item.photoId}`);
                    return res.status(400).json({ error: 'Edit does not belong to specified photo' });
                }
                console.log(`[${requestId}] ✅ Edit ${item.editId} validated`);
                editIds.push(item.editId);
            } catch (error) {
                console.log(`[${requestId}] ❌ Edit ${item.editId} not found:`, error.message);
                return res.status(404).json({ error: `Edit ${item.editId} not found` });
            }
            
            // Calculate token cost for this item
            const pricePerSticker = pricingMap[size];
            const itemCost = pricePerSticker * item.quantity;
            totalTokenCost += itemCost;
            console.log(`[${requestId}] 💰 Item ${i + 1} cost: ${itemCost} tokens (${item.quantity} × ${pricePerSticker} for ${size})`);
        }
        
        console.log(`[${requestId}] 💰 Total order cost: ${totalTokenCost} tokens`);
        
        // Check user has sufficient tokens
        const currentUser = await adminPb.collection('printapic_users').getOne(req.user.id);
        console.log(`[${requestId}] 👤 User token balance: ${currentUser.tokens}`);
        
        if (currentUser.tokens < totalTokenCost) {
            console.log(`[${requestId}] ❌ Insufficient tokens - Required: ${totalTokenCost}, Available: ${currentUser.tokens}`);
            return res.status(400).json({ 
                error: 'Insufficient tokens', 
                required: totalTokenCost, 
                available: currentUser.tokens 
            });
        }
        
        // Create order record
        const orderData = {
            user: req.user.id,
            edits: editIds,
            shipping_address: shippingAddress,
            tokens_cost: totalTokenCost,
            order_details: {
                items: items,
                timestamp: new Date().toISOString()
            }
        };
        
        console.log(`[${requestId}] 📝 Creating order record`);
        const order = await adminPb.collection('printapic_orders').create(orderData);
        console.log(`[${requestId}] ✅ Order created with ID: ${order.id}`);
        
        // Deduct tokens atomically
        console.log(`[${requestId}] 💸 Deducting ${totalTokenCost} tokens from user balance`);
        const newTokenBalance = currentUser.tokens - totalTokenCost;
        await adminPb.collection('printapic_users').update(req.user.id, {
            tokens: newTokenBalance
        });
        
        // Create token transaction record for audit trail
        console.log(`[${requestId}] 📊 Recording token transaction`);
        await adminPb.collection('printapic_token_transactions').create({
            user: req.user.id,
            amount: -totalTokenCost,
            reason: `Order #${order.id}`,
            reference_id: order.id
        });
        
        const response = {
            success: true,
            orderId: order.id,
            status: order.status,
            tokensDeducted: totalTokenCost,
            remainingTokens: newTokenBalance,
            message: 'Order created successfully'
        };
        
        console.log(`[${requestId}] ✅ Order creation completed successfully`);
        console.log(`[${requestId}] 📤 Response:`, JSON.stringify(response, null, 2));
        
        res.status(201).json(response);
    } catch (error) {
        console.error(`[${requestId}] ❌ Order creation error:`, error);
        console.error(`[${requestId}] 📊 Error details:`, {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        res.status(500).json({ error: error.message || 'Failed to create order' });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
