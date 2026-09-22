import { client } from "../config/redisClient"
import {jobType } from '../types/types';
import { QUEUE_NAMES } from "../config/queue.config";

export const addJob = async(job : jobType , delay? : number) => {

    await client.hset(`job:${job.jobId}` , { //MetaData hash
        id : job.jobId,
        type : job.type,
        status : delay ? "scheduled" : "pending",
        attempts : 0,
        maxAttempts : 3,
        createdAt : new Date().toISOString(),
        updatedAt : new Date().toISOString()
    });

    if(delay){
        const executeAt = Date.now() + delay;

        await client.zadd(
            QUEUE_NAMES.SCHEDULED,
            executeAt,
            JSON.stringify(job)
        );

        await client.hset(
            `job:${job.jobId}`,
            {
                executeAt : executeAt.toString()
            }
        )

        console.log(
            `Job ${job.jobId} scheduled for ${new Date(executeAt).toISOString()} 📅`
        )

    }else{
        await client.rpush(
            QUEUE_NAMES.MAIN,
            JSON.stringify(job)
        )

        console.log(`Job ${job.jobId} is added to Redis`)
    }

}

export const updateJobStatus = async(jobId : string , status : string) => {
    await client.hset(
        `job:${jobId}`,
        {
            status,
            updatedAt : new Date().toISOString()
        }
    )
}

export const incrementJobAttempts = async(jobId : string) => {
    return await client.hincrby(
        `job:${jobId}`,
        "attempts",
        1
    );
}

export const getMaxAttempts = async(jobId : string) => {
    const maxAttempt = await client.hget(
        `job:${jobId}`,
        "maxAttempts"
    )
    return Number(maxAttempt) || 3
}

export const getJobStatus = async(jobId : string) => {
    return await client.hgetall(`job:${jobId}`)
}

export const findJobInQueues = async (
    jobId: string,
    queues: string[]
) => {

    for (const queue of queues) {

        let jobs: string[];

        if (queue === QUEUE_NAMES.SCHEDULED) {
            jobs = await client.zrange(
                queue,
                "0",
                "-1"
            );
        } else {
            jobs = await client.lrange(
                queue,
                "0",
                "-1"
            );
        }

        for (const serializedJob of jobs) {

            const job = JSON.parse(serializedJob);

            if (job.jobId === jobId) {
                return serializedJob;
            }
        }
    }

    return null;
};

export const cancelJob = async (jobId: string) => {

    const jobKey = `job:${jobId}`;

    const job = await client.hgetall(jobKey);

    if (!job || Object.keys(job).length === 0) {
        return {
            success: false,
            reason: "not_found"
        };
    }

    if (job.status !== "pending" && job.status !== "scheduled") {
        return {
            success: false,
            reason: "not_cancellable",
            status: job.status
        };
    }

    // We need the actual serialized job to remove it
    // from the queue.
    const queues = [
        QUEUE_NAMES.MAIN,
        QUEUE_NAMES.SCHEDULED
    ];

    const serializedJob = await findJobInQueues(
        jobId,
        queues
    );

    if (!serializedJob) {
        return {
            success: false,
            reason: "job_not_found_in_queue"
        };
    }

    if (job.status === "pending") {
        const removed = await client.lrem(
            QUEUE_NAMES.MAIN,
            1,
            serializedJob
        );

        if(removed !== 1){
            return{
                success : false,
                reason : "job_not_found_in_queue"
            }
        }
    }

    if (job.status === "scheduled") {
        const removed = await client.zrem(
            QUEUE_NAMES.SCHEDULED,
            serializedJob
        );

        if(removed !== 1){
            return{
                success : false,
                reason : "job_not_found_in_queue" 
            }
        }
    }


    await client.hset(
        jobKey,
        {
            status: "cancelled",
            updatedAt: new Date().toISOString()
        }
    );

    return {
        success: true
    };
};

