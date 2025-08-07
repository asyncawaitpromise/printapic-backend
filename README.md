# Printapic Backend

A Node.js Express backend for Printapic, a photo editing and printing service that integrates with PocketBase for authentication and data storage.

## Features

- **Photo Processing**: AI-powered image editing with style presets and transport options (sticker, line-art, van-gogh, manga-style, oil-painting, business-photo, beach-vacation, space-explorer, medieval-knight)
- **Order Management**: Create and manage print orders with size-based pricing
- **Token System**: User token balances with transaction audit trails
- **Authentication**: PocketBase JWT-based authentication
- **Real-time Status**: Poll processing status for image edits

## Quick Start

### Prerequisites
- Node.js 18+
- pnpm
- PocketBase instance

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env.local
# Edit .env.local with your configuration

# Start development server
pnpm dev
```

### Environment Variables

Create a `.env.local` file with:

```env
PORT=3000
BFL_KEY=your_image_processing_api_key
PB_SUPER_EMAIL=admin@example.com
PB_SUPER_PASS=admin_password
POCKETBASE_URL=http://127.0.0.1:8090
```

## Development

- `pnpm dev` - Start development server with hot reload
- `pnpm start` - Start production server  
- `pnpm test` - Run test suite

## API Endpoints

### Authentication
All endpoints except `/` and `/health` require authentication via `Authorization: Bearer <token>` header.

### Core Routes

- `GET /` - API version info
- `GET /health` - Health check
- `GET /me` - Current user information

### Photo Processing

- `POST /process-image` - Start image processing with style selection
- `GET /edit-status/:editId` - Check processing status

### Orders

- `POST /api/orders` - Create print orders with validation

### Debug

- `GET /debug/collections` - User's photos (authenticated)

## Pricing

| Size | Tokens |
|------|--------|
| Small stickers | 200 |
| Medium stickers | 250 |
| Large stickers | 300 |

## Architecture

- **Express.js** - Web framework
- **PocketBase** - Database and authentication
- **External AI API** - Image processing
- **Vitest** - Testing framework
- **MSW** - API mocking for tests

## Collections Schema

- `printapic_users` - User accounts with token balances
- `printapic_photos` - User-uploaded photos
- `printapic_edits` - Image processing jobs
- `printapic_orders` - Print orders
- `printapic_token_transactions` - Token usage audit trail 