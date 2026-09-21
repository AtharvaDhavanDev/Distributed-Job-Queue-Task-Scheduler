import { client } from "../config/redisClient"
const SCHEDULED_QUEUE_NAME = "scheduled_queue";


export const getJobStatus = async(jobId : string) => {
    return await client.hgetall(`job:${jobId}`)
}

export const findJobInQueues = async (
    jobId: string,
    queues: string[]
) => {

    for (const queue of queues) {

        let jobs: string[];

        if (queue === SCHEDULED_QUEUE_NAME) {
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