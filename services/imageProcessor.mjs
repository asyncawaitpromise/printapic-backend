import { adminPb, ensureAdminAuth } from '../pbClient.mjs';

export async function processImage(photoId, operation, user, requestId = 'unknown') {
    try {
        console.log(`[${requestId}] 🔍 Verifying photo ${photoId} exists and belongs to user ${user.id}`);
        
        // Ensure admin is authenticated before database operations
        await ensureAdminAuth();
        
        let photo;
        try {
            // Verify the photo exists and belongs to the user
            photo = await adminPb.collection('printapic_photos').getOne(photoId);
            console.log(`[${requestId}] 📸 Photo found: ${photo.id}, owner: ${photo.user}`);
        } catch (error) {
            if (error.status === 404) {
                console.error(`[${requestId}] ❌ Photo record not found in 'printapic_photos' collection: ${photoId}`);
                console.error(`[${requestId}] 🔍 This means the record ID '${photoId}' does not exist as a photo record`);
                
                // Let's check what photos exist for this user
                try {
                    const userPhotos = await adminPb.collection('printapic_photos').getList(1, 20, {
                        filter: `user = "${user.id}"`
                    });
                    console.log(`[${requestId}] 📋 User ${user.id} has ${userPhotos.totalItems} total photos`);
                    console.log(`[${requestId}] 📸 Available photo records:`, 
                        userPhotos.items.map(p => ({ 
                            id: p.id, 
                            created: p.created,
                            hasImage: !!p.image,
                            imageFileName: p.image || 'no-image'
                        })));
                    
                    // Also check if there are ANY photos in the collection (maybe wrong user?)
                    const allPhotos = await adminPb.collection('printapic_photos').getList(1, 5);
                    console.log(`[${requestId}] 🌍 Total photos in database: ${allPhotos.totalItems}`);
                    if (allPhotos.items.length > 0) {
                        console.log(`[${requestId}] 📊 Sample photo records:`, 
                            allPhotos.items.map(p => ({
                                id: p.id,
                                owner: p.user,
                                created: p.created
                            })));
                    }
                } catch (listError) {
                    console.error(`[${requestId}] ❌ Failed to list photos:`, listError);
                }
                
                throw new Error(`Photo record with ID '${photoId}' not found in database. This should be a PocketBase record ID, not a file ID. Check that the photo was created properly and you're using the correct record ID.`);
            }
            throw error;
        }
        
        // Check if user owns the photo
        if (photo.user !== user.id) {
            console.log(`[${requestId}] ❌ Unauthorized access attempt - Photo owner: ${photo.user}, Request user: ${user.id}`);
            throw new Error('Unauthorized: You do not have access to this photo');
        }
        console.log(`[${requestId}] ✅ User authorization verified`);

        // Check if operation is supported
        if (operation !== 'sticker') {
            console.log(`[${requestId}] ❌ Unsupported operation: ${operation}`);
            throw new Error(`Unsupported operation: ${operation}. Only 'sticker' is supported.`);
        }
        console.log(`[${requestId}] ✅ Operation '${operation}' is supported`);

        // Create an edit record in pending status
        console.log(`[${requestId}] 💾 Creating edit record...`);
        await ensureAdminAuth();
        const editRecord = await adminPb.collection('printapic_edits').create({
            user: user.id,
            photo: photoId,
            status: 'pending',
            tokens_cost: 1 // Default cost for sticker operation
        });
        console.log(`[${requestId}] ✅ Edit record created: ${editRecord.id}`);

        // Process the image with BFL in the background
        console.log(`[${requestId}] 🚀 Starting background processing for edit ${editRecord.id}`);
        processImageAsync(photo, editRecord.id, user, requestId);
        
        return {
            success: true,
            editId: editRecord.id,
            status: 'pending',
            message: 'Sticker processing started. Check back for results.'
        };
        
    } catch (error) {
        console.error(`[${requestId}] ❌ Image processing error:`, error);
        throw error;
    }
}

async function processImageAsync(photo, editId, user, requestId = 'unknown') {
    try {
        console.log(`[${requestId}] 🔄 Background processing started for edit ${editId}`);
        
        // Update status to processing
        await ensureAdminAuth();
        await adminPb.collection('printapic_edits').update(editId, {
            status: 'processing'
        });
        console.log(`[${requestId}] 📝 Edit status updated to 'processing'`);

        // Get the image file URL from PocketBase
        const imageUrl = adminPb.files.getUrl(photo, photo.image);
        console.log(`[${requestId}] 🌐 Image URL generated: ${imageUrl}`);
        
        // Call BFL API
        console.log(`[${requestId}] 🤖 Calling BFL API...`);
        const processedImageBuffer = await callBFLAPI(imageUrl, requestId);
        console.log(`[${requestId}] ✅ BFL API call completed, received ${processedImageBuffer.length} bytes`);
        
        // Save the processed image to the edit record
        console.log(`[${requestId}] 💾 Saving processed image to edit record...`);
        const formData = new FormData();
        const blob = new Blob([processedImageBuffer], { type: 'image/png' });
        formData.append('result_image', blob, `sticker_${photo.id}.png`);
        formData.append('status', 'done');
        formData.append('completed', new Date().toISOString());

        await ensureAdminAuth();
        await adminPb.collection('printapic_edits').update(editId, formData);
        console.log(`[${requestId}] ✅ Edit record updated with result image`);
        
        // Deduct tokens from user (assuming 1 token per sticker)
        console.log(`[${requestId}] 💰 Deducting 1 token from user ${user.id}`);
        await deductTokens(user.id, 1, editId, requestId);
        console.log(`[${requestId}] ✅ Token deduction completed`);
        
        console.log(`[${requestId}] ✅ Sticker processing completed for edit ${editId}`);
        
    } catch (error) {
        console.error(`[${requestId}] ❌ Processing failed for edit ${editId}:`, error);
        console.error(`[${requestId}] 📊 Error details:`, {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        
        // Update status to failed
        console.log(`[${requestId}] 📝 Updating edit status to 'failed'`);
        await ensureAdminAuth();
        await adminPb.collection('printapic_edits').update(editId, {
            status: 'failed'
        });
        console.log(`[${requestId}] ✅ Edit status updated to 'failed'`);
    }
}

async function callBFLAPI(imageUrl, requestId = 'unknown') {
    const BFL_KEY = process.env.BFL_KEY;
    if (!BFL_KEY) {
        console.error(`[${requestId}] ❌ BFL_KEY not found in environment variables`);
        throw new Error('BFL_KEY not found in environment variables');
    }
    console.log(`[${requestId}] ✅ BFL_KEY found in environment`);

    const prompt = "cut out the main subject and replace the background with white.";
    
    try {
        // First, get the image data
        console.log(`[${requestId}] 📥 Fetching image from URL: ${imageUrl}`);
        const imageResponse = await fetch(imageUrl);
        
        if (!imageResponse.ok) {
            console.error(`[${requestId}] ❌ Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
            throw new Error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
        }
        
        const imageBuffer = await imageResponse.arrayBuffer();
        console.log(`[${requestId}] ✅ Image fetched successfully, size: ${imageBuffer.byteLength} bytes`);
        
        // Convert image to base64
        console.log(`[${requestId}] 🔄 Converting image to base64...`);
        const base64Image = Buffer.from(imageBuffer).toString('base64');
        console.log(`[${requestId}] ✅ Image converted to base64, length: ${base64Image.length}`);
        
        // Prepare JSON payload for BFL API
        const payload = {
            prompt: prompt,
            input_image: base64Image,
            seed: 42,
            aspect_ratio: "1:1",
            output_format: "jpeg",
            prompt_upsampling: false,
            safety_tolerance: 2
        };
        
        // Call BFL API
        console.log(`[${requestId}] 🚀 Making API call to BFL flux-kontext-pro...`);
        console.log(`[${requestId}] 📝 Using prompt: "${prompt}"`);
        const startTime = Date.now();
        const response = await fetch('https://api.bfl.ai/v1/flux-kontext-pro', {
            method: 'POST',
            headers: {
                'x-key': BFL_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const endTime = Date.now();
        console.log(`[${requestId}] ⏱️ BFL API call took ${endTime - startTime}ms`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[${requestId}] ❌ BFL API error: ${response.status} ${response.statusText}`);
            console.error(`[${requestId}] 📄 Error response body:`, errorText);
            throw new Error(`BFL API error: ${response.status} ${response.statusText}`);
        }
        
        const responseData = await response.json();
        console.log(`[${requestId}] ✅ BFL API response successful:`, responseData);
        
        if (!responseData.id || !responseData.polling_url) {
            console.error(`[${requestId}] ❌ Invalid response format from BFL API`);
            throw new Error('Invalid response format from BFL API');
        }
        
        // Poll for results
        console.log(`[${requestId}] 🔄 Polling for results at: ${responseData.polling_url}`);
        return await pollForResult(responseData.polling_url, BFL_KEY, requestId);
        
    } catch (error) {
        console.error(`[${requestId}] ❌ BFL API call failed:`, error);
        throw error;
    }
}

async function pollForResult(pollingUrl, apiKey, requestId, maxAttempts = 30) {
    console.log(`[${requestId}] 🔄 Starting polling for result...`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            console.log(`[${requestId}] 📡 Polling attempt ${attempt}/${maxAttempts}`);
            
            const response = await fetch(pollingUrl, {
                method: 'GET',
                headers: {
                    'x-key': apiKey
                }
            });
            
            if (!response.ok) {
                console.error(`[${requestId}] ❌ Polling error: ${response.status} ${response.statusText}`);
                throw new Error(`Polling error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log(`[${requestId}] 📊 Polling response:`, data.status || 'unknown status');
            
            if (data.status === 'Ready') {
                console.log(`[${requestId}] ✅ Image processing complete!`);
                
                if (!data.result || !data.result.sample) {
                    console.error(`[${requestId}] ❌ No result image in response`);
                    throw new Error('No result image in response');
                }
                
                // Download the result image
                console.log(`[${requestId}] 📥 Downloading result image...`);
                const imageResponse = await fetch(data.result.sample);
                
                if (!imageResponse.ok) {
                    console.error(`[${requestId}] ❌ Failed to download result image: ${imageResponse.status}`);
                    throw new Error(`Failed to download result image: ${imageResponse.status}`);
                }
                
                const imageBuffer = await imageResponse.arrayBuffer();
                console.log(`[${requestId}] ✅ Result image downloaded, size: ${imageBuffer.byteLength} bytes`);
                return Buffer.from(imageBuffer);
            } else if (data.status === 'Error') {
                console.error(`[${requestId}] ❌ BFL processing failed with error`);
                throw new Error('BFL processing failed');
            }
            
            // Still processing, wait before next attempt
            console.log(`[${requestId}] ⏳ Still processing, waiting 2 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            
        } catch (error) {
            console.error(`[${requestId}] ❌ Polling attempt ${attempt} failed:`, error);
            if (attempt === maxAttempts) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    console.error(`[${requestId}] ❌ Polling timeout after ${maxAttempts} attempts`);
    throw new Error('Polling timeout - image processing took too long');
}

async function deductTokens(userId, amount, referenceId, requestId = 'unknown') {
    try {
        console.log(`[${requestId}] 💰 Getting current token balance for user ${userId}`);
        
        // Get current user tokens
        await ensureAdminAuth();
        const user = await adminPb.collection('printapic_users').getOne(userId);
        console.log(`[${requestId}] 📊 Current token balance: ${user.tokens}`);
        
        if (user.tokens < amount) {
            console.error(`[${requestId}] ❌ Insufficient tokens: required ${amount}, available ${user.tokens}`);
            throw new Error('Insufficient tokens');
        }
        
        console.log(`[${requestId}] ✅ Sufficient tokens available (${user.tokens} >= ${amount})`);
        
        // Update user tokens
        const newBalance = user.tokens - amount;
        console.log(`[${requestId}] 📝 Updating user token balance from ${user.tokens} to ${newBalance}`);
        await ensureAdminAuth();
        await adminPb.collection('printapic_users').update(userId, {
            tokens: newBalance
        });
        console.log(`[${requestId}] ✅ User token balance updated`);
        
        // Create transaction record
        console.log(`[${requestId}] 📝 Creating token transaction record`);
        await ensureAdminAuth();
        const transaction = await adminPb.collection('printapic_token_transactions').create({
            user: userId,
            amount: -amount,
            reason: 'Sticker processing',
            reference_id: referenceId
        });
        console.log(`[${requestId}] ✅ Token transaction recorded: ${transaction.id}`);
        
    } catch (error) {
        console.error(`[${requestId}] ❌ Token deduction failed:`, error);
        throw error;
    }
}