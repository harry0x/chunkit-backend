import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import { config, ALLOWED_MIMETYPES, ALLOWED_EXTENSIONS } from "../config.js";
import { jobStore } from "../jobStore.js";
import { processVideo } from "../services/ffmpeg.js";

const router = Router();

// Configure multer storage
const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    const jobId = uuidv4();
    const jobDir = path.join(config.tempDir, jobId);
    await fs.mkdir(jobDir, { recursive: true });

    // Attach jobId to request for later use
    (_req as any).__jobId = jobId;
    (_req as any).__jobDir = jobDir;

    cb(null, jobDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `original${ext}`);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeOk = ALLOWED_MIMETYPES.includes(file.mimetype);
  const extOk = ALLOWED_EXTENSIONS.includes(ext);

  if (mimeOk || extOk) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.maxUploadSizeBytes,
  },
});

router.post("/", (req: Request, res: Response) => {
  upload.single("video")(req, res, async (err) => {
    if (err) {
      // Handle multer errors
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({
            error: `File too large. Maximum size is ${config.maxUploadSizeMB}MB`,
          });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "No video file provided" });
      return;
    }

    const jobId = (req as any).__jobId as string;
    const jobDir = (req as any).__jobDir as string;

    // Create job entry in store
    jobStore.create({
      id: jobId,
      status: "pending",
      percent: 0,
      chunkCount: 0,
      originalFileName: req.file.originalname,
      createdAt: new Date(),
      jobDir,
    });

    // Start FFmpeg processing in the background (don't await)
    processVideo(jobId).catch((error) => {
      console.error(`Job ${jobId} failed:`, error);
    });

    res.status(200).json({ jobId });
  });
});

export default router;
