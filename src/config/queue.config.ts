

export const QUEUE_NAMES = {
    MAIN: "job_queue",
    PROCESSING: "processing_queue",
    RETRY: "retry_queue",
    SCHEDULED: "scheduled_queue",
    DLQ: "dead_letter_queue",
} as const;