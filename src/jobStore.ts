export type JobStatus = "pending" | "processing" | "done" | "failed";

export interface Job {
  id: string;
  status: JobStatus;
  percent: number;
  chunkCount: number;
  error?: string;
  originalFileName: string;
  createdAt: Date;
  jobDir: string;
}

const jobs = new Map<string, Job>();

export const jobStore = {
  create(job: Job): void {
    jobs.set(job.id, job);
  },

  get(id: string): Job | undefined {
    return jobs.get(id);
  },

  update(id: string, updates: Partial<Job>): void {
    const job = jobs.get(id);
    if (job) {
      Object.assign(job, updates);
    }
  },

  delete(id: string): void {
    jobs.delete(id);
  },

  getAll(): Map<string, Job> {
    return jobs;
  },
};
