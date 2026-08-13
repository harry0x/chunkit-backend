import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "5000", 10),
  maxUploadSizeMB: parseInt(process.env.MAX_UPLOAD_SIZE_MB || "1024", 10),
  chunkDurationSeconds: parseInt(process.env.CHUNK_DURATION_SECONDS || "60", 10),
  tempDir: process.env.TEMP_DIR || "/tmp/video-chunker",
  cleanupIntervalMinutes: parseInt(process.env.CLEANUP_INTERVAL_MINUTES || "15", 10),
  jobMaxAgeMinutes: parseInt(process.env.JOB_MAX_AGE_MINUTES || "60", 10),
  corsOrigins: process.env.CORS_ORIGINS 
    ? process.env.CORS_ORIGINS.split(",") 
    : ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],

  get maxUploadSizeBytes() {
    return this.maxUploadSizeMB * 1024 * 1024;
  },
} as const;

export const ALLOWED_MIMETYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/x-msvideo",
  "video/webm",
];

export const ALLOWED_EXTENSIONS = [".mp4", ".mov", ".mkv", ".avi", ".webm"];
