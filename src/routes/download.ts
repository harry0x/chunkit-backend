import { Router, Request, Response } from "express";
import archiver from "archiver";
import path from "path";
import fs from "fs/promises";
import { jobStore } from "../jobStore.js";
import { authenticate } from "../middleware/auth.js";
import { requireActiveSubscription } from "../middleware/subscription.js";

const router = Router();

router.get("/:jobId", authenticate, requireActiveSubscription, async (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;
  const job = jobStore.get(jobId);

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  if (job.status !== "done") {
    res.status(400).json({ error: "Job is not ready for download" });
    return;
  }

  try {
    // Get list of chunk files
    const files = await fs.readdir(job.jobDir);
    const chunks = files
      .filter((f) => f.startsWith("chunk_") && f.endsWith(".mp4"))
      .sort();

    if (chunks.length === 0) {
      res.status(500).json({ error: "No chunks found" });
      return;
    }

    // Generate a clean filename from the original
    const baseName = path.basename(
      job.originalFileName,
      path.extname(job.originalFileName)
    );
    const zipFileName = `${baseName}_chunks.zip`;

    // Set response headers for download
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipFileName}"`);

    // Create archive with no compression (video is already compressed)
    const archive = archiver("zip", {
      zlib: { level: 0 },
    });

    // Handle archive errors
    archive.on("error", (err) => {
      console.error(`Archive error for job ${jobId}:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to create ZIP" });
      }
    });

    // When the response finishes sending, clean up the job
    res.on("finish", async () => {
      console.log(`📦 Download complete for job ${jobId}, cleaning up...`);
      try {
        await fs.rm(job.jobDir, { recursive: true, force: true });
        jobStore.delete(jobId as string);
        console.log(`🗑️  Cleaned up job ${jobId}`);
      } catch (err) {
        console.error(`Failed to clean up job ${jobId}:`, err);
      }
    });

    // Pipe archive directly to response (streaming)
    archive.pipe(res);

    // Add each chunk file to the archive
    for (const chunk of chunks) {
      const chunkPath = path.join(job.jobDir, chunk);
      archive.file(chunkPath, { name: chunk });
    }

    // Finalize the archive
    await archive.finalize();
  } catch (err) {
    console.error(`Download error for job ${jobId}:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to prepare download" });
    }
  }
});

export default router;
