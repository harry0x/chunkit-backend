import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import path from "path";
import fs from "fs/promises";
import { jobStore } from "../jobStore.js";
import { config } from "../config.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

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
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        return reject(err);
      }

      const format = metadata.format;
      let targetBitrate = format.bit_rate;
      
      // If bitrate is missing from metadata, estimate it from file size and duration
      if (!targetBitrate && format.size && format.duration) {
         targetBitrate = Math.floor((format.size * 8) / format.duration);
      }
      
      // Target 90% of total bitrate for video, assuming 10% audio overhead
      const videoBitrate = targetBitrate ? Math.floor(Number(targetBitrate) * 0.9) : null;

      const options = [
        "-c:v libx264",
        "-preset superfast",
        "-threads 2", // 2 threads doubles the speed of 1, but keeps RAM usage under Render's 512MB limit
        "-c:a copy", // Copy audio to save memory and avoid codec errors
        `-force_key_frames expr:gte(t,n_forced*${config.chunkDurationSeconds})`,
        "-map 0",
        `-segment_time ${config.chunkDurationSeconds}`,
        "-f segment",
        "-reset_timestamps 1",
        "-max_muxing_queue_size 1024", // Prevent memory buildup
      ];

      if (videoBitrate) {
        // EXACT match: Force the output bitrate to exactly match the input file's average bitrate
        options.push(`-b:v ${videoBitrate}`);
        options.push(`-maxrate ${videoBitrate}`);
        options.push(`-bufsize ${videoBitrate * 2}`);
      } else {
        // Safe fallback just in case
        options.push("-crf 26");
      }

      ffmpeg(inputPath)
        .outputOptions(options)
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
  });
}
