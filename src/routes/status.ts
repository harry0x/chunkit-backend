import { Router, Request, Response } from "express";
import { jobStore } from "../jobStore.js";

const router = Router();

router.get("/:jobId", (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = jobStore.get(jobId);

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const response: Record<string, unknown> = {
    status: job.status,
    percent: job.percent,
  };

  if (job.chunkCount > 0) {
    response.chunkCount = job.chunkCount;
  }

  if (job.error) {
    response.error = job.error;
  }

  res.json(response);
});

export default router;
