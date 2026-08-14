import cron from "node-cron";
import fs from "fs/promises";
import path from "path";
import { config } from "../config.js";
import { jobStore } from "../jobStore.js";
import prisma from "../lib/prisma.js";

export function startCleanupCron(): void {
  const cronExpression = `*/${config.cleanupIntervalMinutes} * * * *`;

  cron.schedule(cronExpression, async () => {
    console.log("🧹 Running cleanup cron...");

    try {
      // Clean up expired jobs from memory and disk
      const jobs = jobStore.getAll();
      const now = Date.now();
      const maxAge = config.jobMaxAgeMinutes * 60 * 1000;

      for (const [id, job] of jobs) {
        if (now - job.createdAt.getTime() > maxAge) {
          console.log(`🗑️  Cleaning up expired job: ${id}`);
          try {
            await fs.rm(job.jobDir, { recursive: true, force: true });
          } catch {
            // Folder may already be deleted
          }
          jobStore.delete(id);
        }
      }

      // Also scan the temp directory for orphaned folders
      try {
        const tempDir = config.tempDir;
        const entries = await fs.readdir(tempDir);

        for (const entry of entries) {
          const fullPath = path.join(tempDir, entry);
          const stat = await fs.stat(fullPath);

          if (stat.isDirectory() && now - stat.mtimeMs > maxAge) {
            // Check if this folder is tracked by any active job
            const isTracked = Array.from(jobs.values()).some((j) => j.jobDir === fullPath);
            if (!isTracked) {
              console.log(`🗑️  Cleaning up orphaned folder: ${entry}`);
              await fs.rm(fullPath, { recursive: true, force: true });
            }
          }
        }
      } catch {
        // Temp dir may not exist yet, that's fine
      }
    } catch (err) {
      console.error("Cleanup cron error:", err);
    }
  });

  console.log(`🧹 Cleanup cron scheduled: every ${config.cleanupIntervalMinutes} minutes`);

  // Daily cron: expire subscriptions where expires_at < now()
  cron.schedule("0 0 * * *", async () => {
    console.log("📅 Running daily subscription expiry check...");
    try {
      const result = await prisma.subscription.updateMany({
        where: {
          status: "active",
          expiresAt: { lt: new Date() },
        },
        data: { status: "expired" },
      });

      if (result.count > 0) {
        console.log(`📅 Expired ${result.count} subscription(s)`);
      }
    } catch (err) {
      console.error("Subscription expiry cron error:", err);
    }
  });

  console.log("📅 Subscription expiry cron scheduled: daily at midnight");
}
