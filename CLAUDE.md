# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `pnpm dev` - Start development server with nodemon (watches for file changes)
- `pnpm start` - Start production server
- `pnpm test` - Run tests with Vitest

**Development Workflow**
- After every code change, commit and push to repository
- Use `pnpm dev` for testing changes (no separate lint/build commands available)

## Architecture Overview

This is a Node.js Express backend for Printapic, a photo editing and printing service that integrates with PocketBase for authentication and data storage.

### Core Components

**Main Application** (`index.mjs`)
- Express server with CORS configured for multiple frontend origins
- Version endpoint at root (`/`) returns current API version
- Health check at `/health`
- All routes except `/` and `/health` require authentication

**Authentication System**
- Uses PocketBase JWT tokens via `Authorization: Bearer <token>` header
- `requireAuth` middleware validates tokens and attaches user to request
- Admin operations use superuser credentials from environment variables

**PocketBase Integration** (`pbClient.mjs`)
- `adminPb` - Privileged client for admin operations
- `verifyUserToken()` - Validates user JWT tokens
- `ensureAdminAuth()` - Ensures admin authentication before privileged operations
- Auto-authenticates admin on startup

**Collections Schema**
- `printapic_users` - User accounts with token balances
- `printapic_photos` - User-uploaded photos
- `printapic_edits` - Image processing jobs with status tracking
- `printapic_orders` - Print orders with shipping details
- `printapic_token_transactions` - Audit trail for token usage

### Key Endpoints

- `GET /me` - Returns authenticated user info
- `POST /process-image` - Starts image processing with configurable prompt styles
- `GET /edit-status/:editId` - Polls processing status
- `POST /api/orders` - Creates print orders with comprehensive validation
- `GET /debug/collections` - Debug endpoint for user's photos (requires auth)

### Image Processing

**Service** (`services/imageProcessor.mjs`)
- Supports multiple prompt styles: sticker, line-art, van-gogh, manga-style, oil-painting, business-photo, beach-vacation, space-explorer, medieval-knight
- Creates new photo records for processed results
- Integrates with external image processing API using BFL_KEY

**Processing Flow**
1. Validates photo ownership
2. Creates edit record with 'processing' status
3. Calls external API with configured prompt
4. Updates edit record with result and 'done' status
5. Creates new photo record for processed image

### Order System

**Pricing Structure**
- Small stickers: 200 tokens
- Medium stickers: 250 tokens  
- Large stickers: 300 tokens

**Order Validation**
- Verifies photo and edit ownership
- Confirms edits are completed
- Validates sufficient token balance
- Atomically deducts tokens and creates audit trail

### Environment Configuration

Required variables in `.env.local`:
- `PORT` - Server port (defaults to 3000)
- `BFL_KEY` - External image processing API key
- `PB_SUPER_EMAIL` - PocketBase superuser email
- `PB_SUPER_PASS` - PocketBase superuser password
- `POCKETBASE_URL` - PocketBase instance URL

### Testing

Uses Vitest with MSW for API mocking. Test files located in `tests/` directory with `.test.mjs` extension.

### Logging

Extensive request logging with unique request IDs for tracing. Each operation logs start, progress, and completion with structured data for debugging.