import { client } from "../config/redisClient";

import {QUEUE_NAMES} from '../config/queue.config';

const moveDueJobs = async () => {

    const jobs = await client.zrangebyscore(
        QUEUE_NAMES.SCHEDULED,
        "-inf",
        Date.now()
    );

    for (const serializedJob of jobs) {

        const removed = await client.zrem(
            QUEUE_NAMES.SCHEDULED,
            serializedJob
        );

        if (removed === 1) {

            await client.rpush(
                QUEUE_NAMES.MAIN,
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
                `Scheduled job ${job.jobId} moved to job_queue 📥`
            );
        }
    }
};

const startScheduler = async () => {

    console.log(
        `Scheduled job scheduler started | PID: ${process.pid}`
    );

    while (true) {

        try {
            await moveDueJobs();

            await new Promise(resolve =>
                setTimeout(resolve, 500)
            );

        } catch (error) {

            console.error(
                "Scheduled scheduler error:",
                error
            );

            await new Promise(resolve =>
                setTimeout(resolve, 1000)
            );
        }
    }
};

startScheduler().catch(console.error);