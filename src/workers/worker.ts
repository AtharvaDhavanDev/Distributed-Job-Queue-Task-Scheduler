import { jobType } from "../types/types";

import {
  getMaxAttempts,
  incrementJobAttempts,
  scheduleRetry,
  returnJob,
  updateJobStatus,
  moveToDLQ,
  acknowledgeJob
} from "../controllers/job.contro";

import { sendEmail } from "../jobs/jobHandlers";
import { client } from "../config/redisClient";

const workerId = process.argv[2] || "worker-1";
let isShuttingDown = false;
let activeJobs = 0;

const processJobs = async () => {
  console.log(`${workerId} started | PID: ${process.pid}`);

  while (!isShuttingDown) {
    try {
      const parsedJob = await returnJob(() => isShuttingDown);

      if (!parsedJob) break;

      activeJobs++;

      const job = JSON.parse(parsedJob) as jobType;

      await client.hset(
        `job:${job.jobId}`,
        {
          processingAt : Date.now().toString(),
          workerId
        }
      )

      console.log("\n\n")

      console.log(
        `${workerId} picked job ${job.jobId} | PID: ${process.pid}`
      );

      const attempts = await incrementJobAttempts(job.jobId);

      await updateJobStatus(job.jobId, "processing");

      console.log(
        `${workerId} processing attempt ${attempts}/3 for job ${job.jobId}`
      );

      try {
        
        if (job.type === "send-email") {
          await sendEmail(job.payload);
        }
        else{
          throw new Error(`Unsupported job type: ${job.type}`);
        }

        await updateJobStatus(job.jobId, "completed");
        await acknowledgeJob(job);

        console.log(
          `${workerId} completed job ${job.jobId} ✅`
        );

      } catch (error) {
        console.error(error);

        const maxAttempts = await getMaxAttempts(job.jobId);

        if (attempts < maxAttempts) {
          const delay = 2000 * Math.pow(2, attempts - 1);

          console.log(
            `${workerId} failed job ${job.jobId}. ` +
            `Retrying in ${delay / 1000}s...`
          );

          await scheduleRetry(job , delay);

        } else {
          await moveToDLQ(
            job,
            error instanceof Error
              ? error.message
              : "Unknown error"
          );

          console.log(
            `${workerId} permanently failed job ${job.jobId} ` +
            `after ${attempts} attempts ❌`
          );
        }
      }
      finally{
        await client.hdel(
          `job:${job.jobId}`,
          "processingAt",
          "workerId"
        )
        activeJobs--;
      }

    } catch (error) {
      console.error(
        `${workerId} worker-level error:`,
        error
      );
    }
  }
};

processJobs().catch(error => {
  console.error("Fatal worker error:", error);
});

const shutdown = async (signal: string) => {
  if (isShuttingDown) return;

  console.log(`${signal} received. Starting graceful shutdown...`);

  isShuttingDown = true;

  const checkInterval = setInterval(async () => {
    if (activeJobs === 0) {
      clearInterval(checkInterval);

      console.log("No active jobs remaining.");
      console.log("Closing Redis connection...");

      await client.quit();

      console.log("Worker shut down gracefully.");
      process.exit(0);
    }
  }, 500);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));