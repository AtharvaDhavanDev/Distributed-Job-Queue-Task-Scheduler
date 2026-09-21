

export interface jobType{
    jobId : string,
    type : string,

    payload : {
        to : string,
        email : string,
        message : string
    }
}

export interface jobMetaDataType{
    jobId : string,
    type : string,
    status : "pending" | "processing" | "completed" | "failed" | "retrying",
    attempts : number,
    maxAttempts : number,
    retryAt? : string,
    createdAt : string,
    updatedAt : string
}