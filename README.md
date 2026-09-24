# ChunkIt - Backend

This is the backend service for **ChunkIt**, an open API that processes and splits large video files into 1-minute chunks using FFmpeg. It is designed to be public-facing, requiring no user authentication or active subscriptions to use. 

## Features

- **Public API:** The `/api/upload`, `/api/status`, and `/api/download` endpoints are fully open for use.
- **FFmpeg Integration:** Efficiently divides videos into optimized chunks using background FFmpeg processes.
- **Rate Limiting:** Protects the upload endpoints to prevent abuse.
- **Auto Cleanup:** Background cron jobs and post-download hooks automatically delete temporary files and parsed chunks to save storage space.
- **Streamed ZIP Downloading:** Combines chunked MP4 files directly into a ZIP stream over HTTP using `archiver`, removing the need for intermediate ZIP file storage.

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js (TypeScript)
- **File Uploads:** Multer
- **Video Processing:** fluent-ffmpeg
- **Archiving:** archiver
- **Database (Optional):** Prisma / SQLite (Kept for administrative logging if needed, though authentication is bypassed for core logic)

## Getting Started

### Prerequisites

- Node.js (v18+)
- **FFmpeg** must be installed and accessible in your system's PATH.
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt install ffmpeg`

### Installation

1. Clone the repository and navigate into this directory.
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Copy the environment variables:
   ```bash
   cp .env.example .env
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

The server will typically start on `http://localhost:5000`.

## Endpoints Summary

- `POST /api/upload`: Accepts a `multipart/form-data` request with a `video` file. Returns a `jobId`.
- `GET /api/status/:jobId`: Returns the real-time processing progress of a job.
- `GET /api/download/:jobId`: Initiates a ZIP file download of the chunked videos once the status is `done`.

## License

MIT
