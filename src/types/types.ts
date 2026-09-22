

export interface jobType{
    jobId : string,
    type : string,

    payload : {
        to : string,
        email : string,
        message : string
    },
}

export interface jobMetaDataType{
    jobId : string,
    type : string,
    status : "pending" | "processing" | "completed" | "failed" | "retrying" | "scheduled" | "cancelled",
    attempts : number,
    maxAttempts : number,
    retryAt? : string,
    executeAt? : string,
    createdAt : string,
    updatedAt : string
}

export interface createJobInput {
    type: string;
    payload: {
        to: string;
        email: string;
        message: string;
    };
    delay?: number;
}