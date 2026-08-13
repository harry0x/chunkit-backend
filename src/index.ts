import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import fs from "fs/promises";
import { config } from "./config.js";
import uploadRouter from "./routes/upload.js";
import statusRouter from "./routes/status.js";
import downloadRouter from "./routes/download.js";
import { startCleanupCron } from "./services/cleanup.js";

const app = express();

// CORS — allow frontend origin
app.use(
  cors({
    origin: config.corsOrigins,
    methods: ["GET", "POST"],
  })
);

// Rate limiting — 10 uploads per IP per 15 minutes
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many uploads. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// JSON parsing for non-upload routes
app.use(express.json());

// Routes
app.use("/api/upload", uploadLimiter, uploadRouter);
app.use("/api/status", statusRouter);
app.use("/api/download", downloadRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start server
async function start() {
  // Ensure temp directory exists
  await fs.mkdir(config.tempDir, { recursive: true });

  // Start cleanup cron
  startCleanupCron();

  app.listen(config.port, () => {
    console.log(`
  ╔══════════════════════════════════════════╗
  ║  🎬  ChunkIt Backend Server             ║
  ║  🌐  http://localhost:${config.port}              ║
  ║  📁  Temp: ${config.tempDir.padEnd(27)}║
  ║  📏  Max upload: ${String(config.maxUploadSizeMB).padEnd(4)}MB                 ║
  ║  ⏱️   Chunk duration: ${String(config.chunkDurationSeconds).padEnd(4)}s              ║
  ╚══════════════════════════════════════════╝
    `);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
