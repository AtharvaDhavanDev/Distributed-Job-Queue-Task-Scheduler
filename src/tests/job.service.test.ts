import {describe, it, expect, vi, beforeEach} from 'vitest';
import { addJob, getJobStatus, getMaxAttempts, incrementJobAttempts, updateJobStatus, findJobInQueues, cancelJob } from '../services/job.service';
import { QUEUE_NAMES } from '../config/queue.config';

const {
    mockHset,
     mockZadd,
      mockRpush,
       mockHincrby,
        mockHget,
         mockHgetAll,
          mockZrange,
           mockLrange, 
           mockLrem,
           mockZrem 
} = vi.hoisted(() => ({
    mockHset : vi.fn(),
    mockZadd : vi.fn(),
    mockRpush : vi.fn(),
    mockHincrby : vi.fn(),
    mockHget : vi.fn(),
    mockHgetAll : vi.fn(),
    mockZrange : vi.fn(),
    mockLrange : vi.fn(),
    mockLrem : vi.fn(),
    mockZrem : vi.fn()
}));

vi.mock("../config/redisClient" , () => ({
    client : {
        hset : mockHset,
        zadd : mockZadd,
        rpush : mockRpush,
        hincrby : mockHincrby,
        hget : mockHget,
        hgetall : mockHgetAll,
        zrange : mockZrange,
        lrange : mockLrange,
        lrem : mockLrem,
        zrem : mockZrem
    }
}))


describe("updateJobStatus" , () => {
    beforeEach(() => {
        vi.clearAllMocks()

        mockHset.mockResolvedValue(1);
    });

    it("Should update job status" , async() => {

        await updateJobStatus("job-123" , "completed");

        expect(mockHset).toHaveBeenCalledOnce();

        expect(mockHset).toHaveBeenCalledWith(
            "job:job-123",
            expect.objectContaining({
                status : "completed",
            })
        )
    })

    it("Should throw an error when redis fails" , async() =>{

        mockHset.mockRejectedValue(new Error("Redis connection failed"))

        await expect(updateJobStatus("job-123" , "completed")).rejects.toThrow("Redis connection failed")
    } )
})

describe("incrementJobAttempts" , () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockHincrby.mockResolvedValue(1);
    })

    it("Should increment job attempt count" , async() => {

        const result = await incrementJobAttempts("job-123");

        expect(mockHincrby).toHaveBeenCalledOnce();
        expect(mockHincrby).toHaveBeenCalledWith("job:job-123" , "attempts" , 1)

        expect(result).toBe(1);

    })

    it("Should thrown an Redis error when Redis fails." , async() => {

        mockHincrby.mockRejectedValue(new Error("Redis failed"))
        await expect(incrementJobAttempts("job-123")).rejects.toThrow("Redis failed")

    })
})

describe("getMaxAttempts" , () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockHget.mockResolvedValue("5");
    })

    it("Return max attempts" , async() => {

        const result = await getMaxAttempts("job-123");

        expect(mockHget).toHaveBeenCalledOnce();
        expect(mockHget).toHaveBeenCalledWith("job:job-123", "maxAttempts");

        expect(result).toBe(5);
    })

    it("Should throw an Error when Redis fails" , async() => {
        mockHget.mockRejectedValue(new Error("Redis failed"));
        await expect(getMaxAttempts("job-123")).rejects.toThrow("Redis failed")
    })

    it("Should return default max attempts when value is missing" , async() => {

        mockHget.mockResolvedValue(null);

        const result = await getMaxAttempts("job-123");

        expect(result).toBe(3);
    })
})

describe("getJobStatus" , () => {
    beforeEach(() => {
        vi.clearAllMocks();
    })

    it("Should return job status" , async() => {

        const mockJob = {
            jobId: "job-123",
            status: "completed",
            attempts: "2",
            maxAttempts: "3"
        };

        mockHgetAll.mockResolvedValue(mockJob);

        const result = await getJobStatus("job-123");

        expect(mockHgetAll).toHaveBeenCalledOnce();
        expect(mockHgetAll).toHaveBeenCalledWith("job:job-123");

        expect(result).toBe(mockJob)
    })

    it("Should throw an Error when redis fails" , async() => {
        mockHgetAll.mockRejectedValue(new Error("Redis failed"));

        await expect(getJobStatus("job-123")).rejects.toThrow("Redis failed");
    })
})

describe("addJob", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockHset.mockResolvedValue(1);
        mockRpush.mockResolvedValue(1);
        mockZadd.mockResolvedValue(1);
    });

    it("Should add an immediate job to the main queue", async () => {
        const job = {
            jobId: "job-123",
            type: "email",
            payload: {
                to: "test@example.com",
                email : "unkownn@gmail.com",
                message : "hello"
            }
        };

        await addJob(job);

        expect(mockHset).toHaveBeenCalledOnce();
        expect(mockHset).toHaveBeenCalledWith(
            "job:job-123",
            expect.objectContaining({
                status: "pending",
                attempts: 0,
                maxAttempts: 3
            })
        );

        expect(mockRpush).toHaveBeenCalledOnce();
        expect(mockRpush).toHaveBeenCalledWith(
            expect.any(String),
            JSON.stringify(job)
        );

        expect(mockZadd).not.toHaveBeenCalled();
    });

    it("Should add a delayed job to the scheduled queue", async () => {
        const job = {
            jobId: "job-456",
            type: "email",
            payload: {
                to: "test@example.com",
                email : "unkownn@gmail.com",
                message : "hello"
            }
        };

        await addJob(job, 5000);

        expect(mockHset).toHaveBeenCalledTimes(2);
        expect(mockHset).toHaveBeenCalledWith(
            "job:job-456",
            expect.objectContaining({
                status: "scheduled",
                attempts: 0,
                maxAttempts: 3
            })
        );

        expect(mockZadd).toHaveBeenCalledOnce();
        expect(mockZadd).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(Number),
            JSON.stringify(job)
        );

        expect(mockRpush).not.toHaveBeenCalled();
    });

    it("Should throw an error when Redis fails", async () => {
        const job = {
            jobId: "job-789",
            type: "email",
            payload: {
                to: "test@example.com",
                email : "unkownn@gmail.com",
                message : "hello"
            }
        };

        mockRpush.mockRejectedValue(
            new Error("Redis connection failed")
        );

        await expect(addJob(job)).rejects.toThrow(
            "Redis connection failed"
        );
    });

    it("Should save the job metadata with the correct initial values", async () => {
        const job = {
            jobId: "job-101",
            type: "email",
            payload: {
                to: "test@example.com",
                email : "unkownn@gmail.com",
                message : "hello"
            }
        };

        await addJob(job);

        expect(mockHset).toHaveBeenCalledWith(
            "job:job-101",
            expect.objectContaining({
                id: "job-101",
                status: "pending",
                attempts: 0,
                maxAttempts: 3
            })
        );
    });
});

describe("findJobInQueues", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockLrange.mockResolvedValue([]);
        mockZrange.mockResolvedValue([]);
    });

    const queues = [
        QUEUE_NAMES.MAIN,
        QUEUE_NAMES.SCHEDULED,
    ];

    it("should find a job in the main queue", async () => {
        const job = {
            jobId: "job-123",
            type: "email",
            payload: { to: "test@example.com" },
        };

        mockLrange.mockResolvedValueOnce([JSON.stringify(job)]);

        const result = await findJobInQueues("job-123", queues);

        expect(result).toBe(JSON.stringify(job));
        expect(mockLrange).toHaveBeenCalledWith(
            QUEUE_NAMES.MAIN, "0", "-1"
        );
        expect(mockZrange).not.toHaveBeenCalled();
    });

    it("should find a job in the scheduled queue", async () => {
        const job = {
            jobId: "job-456",
            type: "email",
            payload: { to: "test@example.com" },
        };

        mockZrange.mockResolvedValueOnce([JSON.stringify(job)]);

        const result = await findJobInQueues("job-456", queues);

        expect(result).toBe(JSON.stringify(job));
        expect(mockLrange).toHaveBeenCalledWith(
            QUEUE_NAMES.MAIN, "0", "-1"
        );
        expect(mockZrange).toHaveBeenCalledWith(
            QUEUE_NAMES.SCHEDULED, "0", "-1"
        );
    });

    it("should return null when the job does not exist", async () => {
        const result = await findJobInQueues("missing-job", queues);

        expect(result).toBeNull();
        expect(mockLrange).toHaveBeenCalled();
        expect(mockZrange).toHaveBeenCalled();
    });

    it("should find the correct job among multiple jobs", async () => {
        const firstJob = {
            jobId: "job-111",
            type: "email",
            payload: { to: "first@example.com" },
        };

        const targetJob = {
            jobId: "job-222",
            type: "email",
            payload: { to: "second@example.com" },
        };

        mockLrange.mockResolvedValueOnce([
            JSON.stringify(firstJob),
            JSON.stringify(targetJob),
        ]);

        const result = await findJobInQueues("job-222", queues);

        expect(result).toBe(JSON.stringify(targetJob));
    });

    it("should reject when Redis throws an error", async () => {
        mockLrange.mockRejectedValueOnce(
            new Error("Redis connection failed")
        );

        await expect(
            findJobInQueues("job-123", queues)
        ).rejects.toThrow("Redis connection failed");
    });
});

describe("cancelJob", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default Redis responses
        mockHgetAll.mockResolvedValue({});
        mockLrange.mockResolvedValue([]);
        mockZrange.mockResolvedValue([]);
        mockLrem.mockResolvedValue(1);
        mockZrem.mockResolvedValue(1);
        mockHset.mockResolvedValue(1);
    });

    it("should return not_found when job metadata does not exist", async () => {
        mockHgetAll.mockResolvedValue({});

        const result = await cancelJob("job-123");

        expect(result).toEqual({
            success: false,
            reason: "not_found",
        });

        expect(mockLrem).not.toHaveBeenCalled();
        expect(mockZrem).not.toHaveBeenCalled();
    });

    it("should reject cancellation for a completed job", async () => {
        mockHgetAll.mockResolvedValue({
            status: "completed",
        });

        const result = await cancelJob("job-123");

        expect(result).toEqual({
            success: false,
            reason: "not_cancellable",
            status: "completed",
        });

        expect(mockLrange).not.toHaveBeenCalled();
        expect(mockZrange).not.toHaveBeenCalled();
    });

    it("should return job_not_found_in_queue when the job is missing from queues", async () => {
        mockHgetAll.mockResolvedValue({
            status: "pending",
        });

        const result = await cancelJob("job-123");

        expect(result).toEqual({
            success: false,
            reason: "job_not_found_in_queue",
        });

        expect(mockLrem).not.toHaveBeenCalled();
        expect(mockZrem).not.toHaveBeenCalled();
    });

    it("should cancel a pending job successfully", async () => {
        const job = {
            jobId: "job-123",
            type: "email",
            payload: { to: "test@example.com" },
        };

        const serializedJob = JSON.stringify(job);

        mockHgetAll.mockResolvedValue({
            status: "pending",
        });

        mockLrange.mockResolvedValueOnce([serializedJob]);

        const result = await cancelJob("job-123");

        expect(result).toEqual({
            success: true,
        });

        expect(mockLrem).toHaveBeenCalledWith(
            QUEUE_NAMES.MAIN,
            1,
            serializedJob
        );

        expect(mockHset).toHaveBeenCalledWith(
            "job:job-123",
            expect.objectContaining({
                status: "cancelled",
            })
        );

        expect(mockZrem).not.toHaveBeenCalled();
    });

    it("should cancel a scheduled job successfully", async () => {
        const job = {
            jobId: "job-456",
            type: "email",
            payload: { to: "test@example.com" },
        };

        const serializedJob = JSON.stringify(job);

        mockHgetAll.mockResolvedValue({
            status: "scheduled",
        });

        mockZrange.mockResolvedValueOnce([serializedJob]);

        const result = await cancelJob("job-456");

        expect(result).toEqual({
            success: true,
        });

        expect(mockZrem).toHaveBeenCalledWith(
            QUEUE_NAMES.SCHEDULED,
            serializedJob
        );

        expect(mockHset).toHaveBeenCalledWith(
            "job:job-456",
            expect.objectContaining({
                status: "cancelled",
            })
        );

        expect(mockLrem).not.toHaveBeenCalled();
    });

    it("should handle a pending job that disappears before removal", async () => {
        const job = {
            jobId: "job-789",
            type: "email",
            payload: { to: "test@example.com" },
        };

        mockHgetAll.mockResolvedValue({
            status: "pending",
        });

        mockLrange.mockResolvedValueOnce([
            JSON.stringify(job),
        ]);

        // Redis reports that no job was removed.
        mockLrem.mockResolvedValueOnce(0);

        const result = await cancelJob("job-789");

        expect(result).toEqual({
            success: false,
            reason: "job_not_found_in_queue",
        });

        expect(mockHset).not.toHaveBeenCalled();
    });

    it("should reject when Redis fails to fetch job metadata", async () => {
        mockHgetAll.mockRejectedValueOnce(
            new Error("Redis connection failed")
        );

        await expect(
            cancelJob("job-123")
        ).rejects.toThrow("Redis connection failed");
    });
});


