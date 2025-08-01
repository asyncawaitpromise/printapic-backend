import { adminPb } from '../pbClient.mjs';

export async function processImage(photoId, operation, user) {
    try {
        // Verify the photo exists and belongs to the user
        const photo = await adminPb.collection('printapic_photos').getOne(photoId);
        
        // Check if user owns the photo
        if (photo.user !== user.id) {
            throw new Error('Unauthorized: You do not have access to this photo');
        }

        // Check if operation is supported
        if (operation !== 'sticker') {
            throw new Error(`Unsupported operation: ${operation}. Only 'sticker' is supported.`);
        }

        // Create an edit record in pending status
        const editRecord = await adminPb.collection('printapic_edits').create({
            user: user.id,
            photo: photoId,
            status: 'pending',
            tokens_cost: 1 // Default cost for sticker operation
        });

        // Process the image with BFL in the background
        processImageAsync(photo, editRecord.id, user);
        
        return {
            success: true,
            editId: editRecord.id,
            status: 'pending',
            message: 'Sticker processing started. Check back for results.'
        };
        
    } catch (error) {
        console.error('Image processing error:', error);
        throw error;
    }
}

async function processImageAsync(photo, editId, user) {
    try {
        // Update status to processing
        await adminPb.collection('printapic_edits').update(editId, {
            status: 'processing'
        });

        // Get the image file URL from PocketBase
        const imageUrl = adminPb.files.getUrl(photo, photo.image);
        
        // Call BFL API
        const processedImageBuffer = await callBFLAPI(imageUrl);
        
        // Save the processed image to the edit record
        const formData = new FormData();
        const blob = new Blob([processedImageBuffer], { type: 'image/png' });
        formData.append('result_image', blob, `sticker_${photo.id}.png`);
        formData.append('status', 'done');
        formData.append('completed', new Date().toISOString());

        await adminPb.collection('printapic_edits').update(editId, formData);
        
        // Deduct tokens from user (assuming 1 token per sticker)
        await deductTokens(user.id, 1, editId);
        
        console.log(`✅ Sticker processing completed for edit ${editId}`);
        
    } catch (error) {
        console.error(`❌ Processing failed for edit ${editId}:`, error);
        
        // Update status to failed
        await adminPb.collection('printapic_edits').update(editId, {
            status: 'failed'
        });
    }
}

async function callBFLAPI(imageUrl) {
    const BFL_KEY = process.env.BFL_KEY;
    if (!BFL_KEY) {
        throw new Error('BFL_KEY not found in environment variables');
    }

    const prompt = "cut out the main subject and replace the background with white.";
    
    try {
        // First, get the image data
        const imageResponse = await fetch(imageUrl);
        const imageBuffer = await imageResponse.arrayBuffer();
        
        // Create form data for BFL API
        const formData = new FormData();
        formData.append('image', new Blob([imageBuffer]), 'input.jpg');
        formData.append('prompt', prompt);
        formData.append('model', 'flux-kontext');
        
        // Call BFL API
        const response = await fetch('https://api.bfl.ml/v1/flux-kontext', {
            method: 'POST',
            headers: {
                'X-Key': BFL_KEY
            },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`BFL API error: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.arrayBuffer();
        return Buffer.from(result);
        
    } catch (error) {
        console.error('BFL API call failed:', error);
        throw error;
    }
}

async function deductTokens(userId, amount, referenceId) {
    try {
        // Get current user tokens
        const user = await adminPb.collection('printapic_users').getOne(userId);
        
        if (user.tokens < amount) {
            throw new Error('Insufficient tokens');
        }
        
        // Update user tokens
        await adminPb.collection('printapic_users').update(userId, {
            tokens: user.tokens - amount
        });
        
        // Create transaction record
        await adminPb.collection('printapic_token_transactions').create({
            user: userId,
            amount: -amount,
            reason: 'Sticker processing',
            reference_id: referenceId
        });
        
    } catch (error) {
        console.error('Token deduction failed:', error);
        throw error;
    }
}