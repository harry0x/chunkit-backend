# ChunkIt Backend

The backend for ChunkIt, responsible for fast video chunking using FFmpeg stream copying.

## Features
- **FFmpeg Integration**: Lightning-fast video splitting without re-encoding.
- **Job Store**: In-memory job tracking for processing status.
- **Archiving**: Streams output chunks directly to a `.zip` file.
- **Cleanup**: Auto-cleans jobs older than 60 minutes.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

## API Routes

- `POST /api/upload`: Upload a video for processing.
- `GET /api/status/:jobId`: Get current progress of an FFmpeg split job.
- `GET /api/download/:jobId`: Download the processed chunks as a ZIP file.
- `GET /api/health`: Check server health.
