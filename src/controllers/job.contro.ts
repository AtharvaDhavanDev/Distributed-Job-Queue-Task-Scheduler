import {Request , Response} from 'express'
import {client} from '../config/redisClient'
import {jobType } from '../types/types';
import { findJobInQueues, getJobStatus } from '../services/job.services';

const QUEUE_NAME = 'job_queue';
const DLQ_NAME = 'dead_letter_queue';
const PROCESSING_QUEUE_NAME = 'processing_queue';
const RETRY_QUEUE_NAME =  "retry_queue";
const SCHEDULED_QUEUE_NAME = "scheduled_queue";

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
            SCHEDULED_QUEUE_NAME,
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
            QUEUE_NAME,
            JSON.stringify(job)
        )

        console.log(`Job ${job.jobId} is added to Redis`)
    }

}

export const returnJob = async (shouldStop : () => boolean) => {
    while (!shouldStop()) {
        const job = await client.rpoplpush(
            QUEUE_NAME,
            PROCESSING_QUEUE_NAME
        );

        if (job) {
            return job;
        }

        await new Promise(resolve => setTimeout(resolve, 250));
    }
    return null;
};

export const handleCreateJob = async(req : Request , res : Response) => { //Producer
    try{
        const {type, payload , delay} = req.body;
        const jobId = crypto.randomUUID()

        await addJob({
            jobId,
            type,
            payload
        } , delay)

        return res.status(202).json({
            msg : "JOB is in the process 📌...",
            jobId 
        })

    }catch(err){
        console.log("Something went wrong : " , err)
        return res.status(500).json({msg : "Something went wrong."})
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

export const scheduleRetry  = async(job : jobType , delay : number) => {
    
    const serializedJob = JSON.stringify(job);
    const retryAt = Date.now() + delay;

    await client.multi()
    .lrem(PROCESSING_QUEUE_NAME, 1, serializedJob)
    .zadd(RETRY_QUEUE_NAME , retryAt, serializedJob)
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

export const getMaxAttempts = async(jobId : string) => {
    const maxAttempt = await client.hget(
        `job:${jobId}`,
        "maxAttempts"
    )
    return Number(maxAttempt) || 3
}

export const moveToDLQ = async(job : jobType , errorMessage : string) => {

    const serializedJob = JSON.stringify(job);

    const deadJob = {
        ...job,
        failureReason : errorMessage,
        failedAt : new Date().toISOString()
    };

    await client.multi()
    .lrem(PROCESSING_QUEUE_NAME , 1 , serializedJob)
    .rpush(DLQ_NAME , JSON.stringify(deadJob))
    .exec();

    await updateJobStatus(job.jobId , "failed");

    console.log(`Job ${job.jobId} moved to DLQ 📌.`)
}

export const acknowledgeJob = async(job : jobType) => {
    await client.lrem(
        PROCESSING_QUEUE_NAME,
        1,
        JSON.stringify(job)
    )

    console.log(`Job ${job.jobId} is acknowledged.`)
}

export const handleGetJobStatus = async(req : Request , res : Response) => {

    try{
        const {jobId} = req.params;
    
        if(!jobId){
            return res.status(400).json({msg : "JobId is missing !"})
        }
    
        const job = await getJobStatus(jobId);
    
        if(!job || Object.keys(job).length === 0){
            return res.status(404).json({
                msg : "Job not found !"
            })
        }
    
        return res.status(200).json({
            msg : "Job found ✅",
            metadata : job
        })
    }
    catch(error){
        console.log("Something went wrong : " , error)
        return res.status(500).json({msg : "Something went wrong !"})
    }
}

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
        QUEUE_NAME,
        SCHEDULED_QUEUE_NAME
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
            QUEUE_NAME,
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
            SCHEDULED_QUEUE_NAME,
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

export const handleCancelJob = async (
    req: Request,
    res: Response
) => {

    try {

        const { jobId } = req.params;

        if (!jobId) {
            return res.status(400).json({
                msg: "JobId is missing!"
            });
        }

        const result = await cancelJob(jobId);

        if (!result.success) {

            if (result.reason === "not_found") {
                return res.status(404).json({
                    msg: "Job not found!"
                });
            }

            if (result.reason === "not_cancellable") {
                return res.status(409).json({
                    msg: `Job cannot be cancelled because it is ${result.status}`
                });
            }

            return res.status(404).json({
                msg: "Job is no longer present in the queue."
            });
        }

        return res.status(200).json({
            msg: "Job cancelled successfully ✅",
            jobId
        });

    } catch (error) {

        console.error(
            "Something went wrong:",
            error
        );

        return res.status(500).json({
            msg: "Something went wrong!"
        });
    }
};
 

