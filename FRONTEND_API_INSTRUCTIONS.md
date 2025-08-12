# Frontend API Integration Instructions

## Authentication

All image processing endpoints require authentication via Bearer token in the Authorization header:

```javascript
headers: {
  'Authorization': 'Bearer <user_token>',
  'Content-Type': 'application/json'
}
```

## Image Processing API

### Process Image Endpoint

**Endpoint:** `POST /process-image`

**Request Body:**
```json
{
  "photoId": "string",     // Required: PocketBase record ID of the photo
  "operation": "sticker",  // Required: Currently only "sticker" is supported
  "promptKey": "string"    // Optional: Style preset (defaults to "sticker")
}
```

**Supported promptKey values:**
- `sticker` (default) - Cut out main subject with white background
- `line-art` - Convert to clean black and white line art
- `van-gogh` - Transform in Vincent van Gogh style
- `manga-style` - Convert to manga/anime art style
- `oil-painting` - Render as classical oil painting

**Response (Success - 200):**
```json
{
  "success": true,
  "editId": "string",      // Edit record ID for reference
  "status": "pending",
  "message": "<promptKey> processing started. A new photo record will be created with the result."
}
```

**Response (Error - 400/401/500):**
```json
{
  "error": "Error message description"
}
```

## Real-time Status Updates with PocketBase Subscriptions

Instead of polling for status updates, use PocketBase real-time subscriptions for immediate notifications when processing completes.

## Frontend Integration Flow

### 1. Setup PocketBase Client

```javascript
import PocketBase from 'pocketbase';

const pb = new PocketBase('http://your-pocketbase-url');
// Authenticate user first
await pb.collection('printapic_users').authWithPassword(email, password);
```

### 2. Subscribe to New Photos (Recommended)

```javascript
async function processImageWithSubscription(photoId, promptKey = 'sticker') {
  try {
    // Subscribe to new photos before starting processing
    const unsubscribe = await pb.collection('printapic_photos').subscribe('*', function (e) {
      if (e.action === 'create' && e.record.user === pb.authStore.model.id) {
        // New processed photo created!
        handleProcessingComplete(e.record);
        unsubscribe(); // Clean up subscription
      }
    }, {
      filter: `user = "${pb.authStore.model.id}"`
    });

    // Start processing
    const response = await fetch('/process-image', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pb.authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        photoId: photoId,
        operation: 'sticker',
        promptKey: promptKey
      })
    });

    const result = await response.json();
    
    if (!response.ok) {
      unsubscribe(); // Clean up on error
      throw new Error(result.error);
    }

    return {
      success: true,
      editId: result.editId,
      message: result.message,
      unsubscribe: unsubscribe // Return cleanup function
    };
    
  } catch (error) {
    console.error('Processing failed:', error);
    throw error;
  }
}

function handleProcessingComplete(newPhotoRecord) {
  console.log('New processed photo created:', newPhotoRecord.id);
  // Update UI with new photo
  // Show success message
  // Refresh photo gallery
}
```

### 3. Alternative: Subscribe to Edit Status Changes

```javascript
async function processImageWithEditSubscription(photoId, promptKey = 'sticker') {
  try {
    // Start processing first
    const response = await fetch('/process-image', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pb.authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        photoId: photoId,
        operation: 'sticker',
        promptKey: promptKey
      })
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error);
    }

    // Subscribe to this specific edit record
    const unsubscribe = await pb.collection('printapic_edits').subscribe(result.editId, function (e) {
      if (e.action === 'update') {
        handleStatusUpdate(e.record);
        
        if (e.record.status === 'done' || e.record.status === 'failed') {
          unsubscribe(); // Clean up when complete
        }
      }
    });

    return {
      success: true,
      editId: result.editId,
      message: result.message,
      unsubscribe: unsubscribe
    };
    
  } catch (error) {
    console.error('Processing failed:', error);
    throw error;
  }
}

function handleStatusUpdate(editRecord) {
  switch (editRecord.status) {
    case 'processing':
      updateUI({ status: 'processing', message: 'AI is processing your image...' });
      break;
    case 'done':
      updateUI({ 
        status: 'complete', 
        message: 'Processing complete! New photo created.',
        tokensUsed: editRecord.tokens_cost
      });
      // Refresh photo gallery
      refreshPhotoGallery();
      break;
    case 'failed':
      updateUI({ status: 'error', message: 'Processing failed. Please try again.' });
      break;
  }
}
```

### 4. Complete Example with Real-time Updates

```javascript
class ImageProcessor {
  constructor(pb, updateUI) {
    this.pb = pb;
    this.updateUI = updateUI;
    this.activeSubscriptions = new Set();
  }

  async processImage(photoId, promptKey = 'sticker') {
    try {
      this.updateUI({ status: 'starting', message: 'Starting image processing...' });
      
      // Subscribe to new photos for real-time completion
      const unsubscribe = await this.pb.collection('printapic_photos').subscribe('*', (e) => {
        if (e.action === 'create' && e.record.user === this.pb.authStore.model.id) {
          this.handleProcessingComplete(e.record);
          this.cleanup(unsubscribe);
        }
      }, {
        filter: `user = "${this.pb.authStore.model.id}"`
      });

      this.activeSubscriptions.add(unsubscribe);

      // Start processing
      const response = await fetch('/process-image', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.pb.authStore.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          photoId: photoId,
          operation: 'sticker',
          promptKey: promptKey
        })
      });

      const result = await response.json();
      
      if (!response.ok) {
        this.cleanup(unsubscribe);
        throw new Error(result.error);
      }

      this.updateUI({ 
        status: 'processing', 
        message: 'AI is processing your image...',
        editId: result.editId 
      });

      return result;
      
    } catch (error) {
      this.updateUI({ 
        status: 'error', 
        message: error.message 
      });
      throw error;
    }
  }

  handleProcessingComplete(newPhotoRecord) {
    this.updateUI({ 
      status: 'complete', 
      message: 'Processing complete! New photo created.',
      newPhotoId: newPhotoRecord.id
    });

    // Refresh photo gallery or add new photo to UI
    this.refreshPhotoGallery();
  }

  cleanup(unsubscribe) {
    if (unsubscribe) {
      unsubscribe();
      this.activeSubscriptions.delete(unsubscribe);
    }
  }

  // Clean up all active subscriptions (call on component unmount)
  cleanupAll() {
    this.activeSubscriptions.forEach(unsubscribe => unsubscribe());
    this.activeSubscriptions.clear();
  }

  async refreshPhotoGallery() {
    // Fetch and display updated photo list
    const photos = await this.pb.collection('printapic_photos').getList(1, 50, {
      filter: `user = "${this.pb.authStore.model.id}"`,
      sort: '-created'
    });
    
    // Update UI with new photos
    this.updateUI({ photos: photos.items });
  }
}

// Usage example
const processor = new ImageProcessor(pb, updateUI);

// Process an image
await processor.processImage('photo_id_123', 'van-gogh');

// Clean up when component unmounts
processor.cleanupAll();
```

### 5. User Experience Recommendations

1. **Real-time Feedback:** Use subscriptions for instant status updates without user action

2. **Handle Long Processing:** Image processing can take 30-60 seconds, show progress indicators

3. **Subscription Cleanup:** Always unsubscribe when processing completes or component unmounts

4. **Error Handling:** 
   - Invalid photoId: Photo doesn't exist or user doesn't own it
   - Insufficient tokens: User needs more credits
   - Processing failures: Retry or contact support

5. **Token Management:** Each operation costs 1 token, check user balance before processing

6. **Result Handling:** New photo records are created instantly via subscriptions - no refresh needed

## Error Codes and Messages

- **400 Bad Request:** Missing photoId or operation
- **401 Unauthorized:** Invalid or missing authentication token
- **403 Forbidden:** User doesn't own the specified photo
- **404 Not Found:** Photo record doesn't exist
- **500 Internal Server Error:** Processing failure or server error

## PocketBase Collections Used

- **`printapic_photos`** - Photo records (original and processed images)
- **`printapic_edits`** - Edit/processing records with status tracking
- **`printapic_users`** - User accounts and token balances

## Benefits of Real-time Subscriptions

✅ **No polling overhead** - Instant notifications when processing completes  
✅ **Better user experience** - Immediate feedback without user action  
✅ **Reduced server load** - No repeated status check requests  
✅ **Real-time updates** - UI updates automatically when new photos arrive  
✅ **Efficient resource usage** - WebSocket connection vs repeated HTTP requests  

## Notes

- Processing creates a new photo record rather than modifying the original
- Each operation consumes 1 token from the user's balance
- Maximum processing time is approximately 60 seconds
- Only JPEG and PNG formats are supported
- Images are processed at 1:1 aspect ratio
- **No polling endpoints needed** - Use PocketBase subscriptions for all status updates