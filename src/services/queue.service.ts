import {client} from '../config/redisClient'
import {jobType } from '../types/types';
import { updateJobStatus } from './job.services';
import { QUEUE_NAMES } from '../config/queue.config';

export const returnJob = async (shouldStop : () => boolean) => {
    while (!shouldStop()) {
        const job = await client.rpoplpush(
            QUEUE_NAMES.MAIN,
            QUEUE_NAMES.PROCESSING
        );

        if (job) {
            return job;
        }

        await new Promise(resolve => setTimeout(resolve, 250));
    }
    return null;
};

export const scheduleRetry  = async(job : jobType , delay : number) => {
    
    const serializedJob = JSON.stringify(job);
    const retryAt = Date.now() + delay;

    await client.multi()
    .lrem(QUEUE_NAMES.PROCESSING, 1, serializedJob)
    .zadd(QUEUE_NAMES.RETRY , retryAt, serializedJob)
    .exec();

    await client.hset(
        `job:${job.jobId}`,
        {
            status : "retrying",
            retryAt : retryAt.toString(),
            updatedAt : new Date().toISOString()
        }
    )

    console.log(
        `Job ${job.jobId} scheduled for retry at ${new Date(retryAt).toISOString()} 🔄`
    );
}

export const moveToDLQ = async(job : jobType , errorMessage : string) => {

    const serializedJob = JSON.stringify(job);

    const deadJob = {
        ...job,
        failureReason : errorMessage,
        failedAt : new Date().toISOString()
    };

    await client.multi()
    .lrem(QUEUE_NAMES.PROCESSING , 1 , serializedJob)
    .rpush(QUEUE_NAMES.DLQ , JSON.stringify(deadJob))
    .exec();

    await updateJobStatus(job.jobId , "failed");

    console.log(`Job ${job.jobId} moved to DLQ 📌.`)
}

export const acknowledgeJob = async(job : jobType) => {
    await client.lrem(
        QUEUE_NAMES.PROCESSING,
        1,
        JSON.stringify(job)
    )

    console.log(`Job ${job.jobId} is acknowledged.`)
}

