import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import fs from "fs/promises";
import { config } from "./config.js";
import prisma from "./lib/prisma.js";
import uploadRouter from "./routes/upload.js";
import statusRouter from "./routes/status.js";
import downloadRouter from "./routes/download.js";
import authRouter from "./routes/auth.js";
import userRouter from "./routes/user.js";
import plansRouter from "./routes/plans.js";
import subscriptionRouter from "./routes/subscription.js";
import adminRouter from "./routes/admin.js";
import { startCleanupCron } from "./services/cleanup.js";

const app = express();
app.set("trust proxy", 1); // Fix for Render proxy warning with rate limit

// CORS — allow frontend origin
app.use(
  cors({
    origin: config.corsOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE"],
  }),
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

// ─── Public Routes ──────────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/plans", plansRouter);

// ─── Authenticated Routes ───────────────────────────────────────────────────
app.use("/api/user", userRouter);
app.use("/api/subscription", subscriptionRouter);
app.use("/api/upload", uploadLimiter, uploadRouter);
app.use("/api/status", statusRouter);
app.use("/api/download", downloadRouter);

// ─── Admin Routes ───────────────────────────────────────────────────────────
app.use("/api/admin", adminRouter);

// ─── Webhook Routes (outside auth — Razorpay calls this directly) ───────────
// The webhook handler is inside subscriptionRouter at /api/subscription/webhooks/razorpay

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start server
async function start() {
  // Test database connection
  try {
    await prisma.$connect();
    console.log("✅ Database connected");
  } catch (err) {
    console.error("❌ Database connection failed:", err);
    process.exit(1);
  }

  // Ensure temp directory exists
  await fs.mkdir(config.tempDir, { recursive: true });

  // Start cleanup cron
  startCleanupCron();

  app.listen(config.port, "0.0.0.0", () => {
    console.log(`
  ╔══════════════════════════════════════════╗
  ║     Server started on PORT ${config.port}            ║
  ║  🎬  ChunkIt Backend Server (SaaS)      ║
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
