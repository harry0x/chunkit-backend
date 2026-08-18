import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import path from "path";
import fs from "fs/promises";
import { jobStore } from "../jobStore.js";
import { config } from "../config.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export async function processVideo(jobId: string): Promise<void> {
  const job = jobStore.get(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  const inputPath = path.join(
    job.jobDir,
    `original${path.extname(job.originalFileName)}`,
  );
  const outputPattern = path.join(job.jobDir, "chunk_%03d.mp4");

  jobStore.update(jobId, { status: "processing", percent: 0 });

  return new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        "-c copy", // Zero quality loss & uses almost zero RAM/CPU (perfect for Render Free Tier)
        "-map 0",
        `-segment_time ${config.chunkDurationSeconds}`,
        "-f segment",
        "-reset_timestamps 1",
      ])
      .output(outputPattern)
      .on("progress", (progress) => {
        const percent = Math.min(Math.round(progress.percent ?? 0), 100);
        jobStore.update(jobId, { percent });
      })
      .on("end", async () => {
        try {
          // Count the generated chunks
          const files = await fs.readdir(job.jobDir);
          const chunks = files.filter(
            (f) => f.startsWith("chunk_") && f.endsWith(".mp4"),
          );

          jobStore.update(jobId, {
            status: "done",
            percent: 100,
            chunkCount: chunks.length,
          });

          console.log(`✅ Job ${jobId}: ${chunks.length} chunks created`);
          resolve();
        } catch (err) {
          const error =
            err instanceof Error ? err.message : "Failed to count chunks";
          jobStore.update(jobId, { status: "failed", error });
          reject(err);
        }
      })
      .on("error", (err, stdout, stderr) => {
        console.error(`❌ Job ${jobId} FFmpeg error:`, err.message);
        if (stderr) console.error("FFmpeg stderr:", stderr);
        jobStore.update(jobId, {
          status: "failed",
          error: err.message || "FFmpeg processing failed",
        });
        reject(err);
      })
      .run();
  });
}
