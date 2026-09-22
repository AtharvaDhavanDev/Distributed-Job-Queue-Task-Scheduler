import { client } from "../config/redisClient";

const PROCESSING_QUEUE_NAME = "processing_queue";
const QUEUE_NAME = "job_queue";

const STALL_TIMEOUT = 20000; // 15 seconds

const recoverStalledJobs = async () => {

    const jobs = await client.lrange(
        PROCESSING_QUEUE_NAME,
        0,
        -1
    );

    for (const serializedJob of jobs) {

        const job = JSON.parse(serializedJob);

        const metadata = await client.hgetall(
            `job:${job.jobId}`
        );

        if (!metadata.processingAt) {
            continue;
        }

        const processingTime = Number(metadata.processingAt);
        const elapsed = Date.now() - processingTime;

        if (elapsed < STALL_TIMEOUT) {
            continue;
        }

        console.log(
            `Recovering stalled job ${job.jobId}...`
        );

        const removed = await client.lrem(
            PROCESSING_QUEUE_NAME,
            1,
            serializedJob
        );

        if (removed === 1) {

            await client.rpush(
                QUEUE_NAME,
                serializedJob
            );

            await client.hset(
                `job:${job.jobId}`,
                {
                    status: "pending",
                    updatedAt: new Date().toISOString()
                }
            );

            await client.hdel(
                `job:${job.jobId}`,
                "processingAt",
                "workerId"
            );

            console.log(
                `Recovered job ${job.jobId} 📥`
            );
        }
    }
};

const startRecovery = async () => {

    console.log(
        `Stalled job recovery started | PID: ${process.pid}`
    );

    while (true) {

        try {
            await recoverStalledJobs();

            await new Promise(resolve =>
                setTimeout(resolve, 5000)
            );

        } catch (error) {

            console.error(
                "Stalled recovery error:",
                error
            );

            await new Promise(resolve =>
                setTimeout(resolve, 5000)
            );
        }
    }
};

startRecovery().catch(console.error);