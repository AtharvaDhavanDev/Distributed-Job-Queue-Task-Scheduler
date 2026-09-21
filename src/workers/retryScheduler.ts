import { client } from "../config/redisClient";

const QUEUE_NAME = "job_queue";
const RETRY_QUEUE_NAME = "retry_queue";

const sleep = (ms: number) =>
    new Promise(resolve => setTimeout(resolve, ms));

const moveDueJobs = async () => {
    const now = Date.now();

    const jobs = await client.zrangebyscore(
        RETRY_QUEUE_NAME,
        "-inf",
        now
    );

    if (jobs.length === 0) {
        return;
    }

    for (const serializedJob of jobs) {
        const removed = await client.zrem(
            RETRY_QUEUE_NAME,
            serializedJob
        );

        // Only move it if this scheduler successfully removed it.
        // Prevents duplicate movement.
        if (removed === 1) {
            await client.rpush(
                QUEUE_NAME,
                serializedJob
            );

            const job = JSON.parse(serializedJob);

            await client.hset(
                `job:${job.jobId}`,
                {
                    status: "pending",
                    updatedAt: new Date().toISOString()
                }
            );

            console.log(
                `Scheduler moved job ${job.jobId} back to job_queue 📥`
            );
        }
    }
};

const startScheduler = async () => {
    console.log(`Retry scheduler started | PID: ${process.pid}`);

    while (true) {
        try {
            await moveDueJobs();
            await sleep(500);
        } catch (error) {
            console.error("Scheduler error:", error);
            await sleep(1000);
        }
    }
};

startScheduler().catch(console.error);