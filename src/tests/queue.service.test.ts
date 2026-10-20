import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockMulti, mockLrem, mockZadd, mockExec, mockHset, mockRpush} = vi.hoisted(() => ({
    mockMulti: vi.fn(),
    mockLrem: vi.fn(),
    mockZadd: vi.fn(),
    mockExec: vi.fn(),
    mockHset: vi.fn(),
    mockRpush : vi.fn()
}));

vi.mock("../config/redisClient", () => ({
    client: {
        multi: mockMulti,
        lrem: mockLrem,
        zadd: mockZadd,
        hset: mockHset,
        rpush : mockRpush
    }
}));

vi.mock("../services/job.service" , () => ({
    updateJobStatus : vi.fn()
}))

import { scheduleRetry , moveToDLQ , acknowledgeJob } from "../services/queue.service";
import { updateJobStatus } from "../services/job.service";
import { QUEUE_NAMES } from "../config/queue.config";

describe("scheduleRetry", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockMulti.mockReturnValue({
            lrem: mockLrem.mockReturnThis(),
            zadd: mockZadd.mockReturnThis(),
            exec: mockExec.mockResolvedValue([])
        });

        mockHset.mockResolvedValue(1);
    });

    it("should move a job to the retry queue", async () => {
        const job = {
            jobId: "job-123",
            type: "email",
            payload: {
                to: "test@example.com",
                email: "test@example.com",
                message: "Hello"
            }
        };

        await scheduleRetry(job, 5000);

        expect(mockMulti).toHaveBeenCalledOnce();
        expect(mockLrem).toHaveBeenCalledOnce();
        expect(mockZadd).toHaveBeenCalledOnce();
        expect(mockExec).toHaveBeenCalledOnce();

        expect(mockHset).toHaveBeenCalledWith(
            "job:job-123",
            expect.objectContaining({
                status: "retrying"
            })
        );
    });

    it("Should throw an error when redis fails" , async() => {
        mockExec.mockRejectedValue(new Error("Redis Conenction Failed"))

        const job = {
            jobId: "job-123",
            type: "email",
            payload: {
                to: "test@example.com",
                email: "test@example.com",
                message: "Hello"
            }
        };

        await expect(scheduleRetry(job , 5000)).rejects.toThrow("Redis Conenction Failed")

    })
});

describe("moveToDLQ" , () => {
    beforeEach(() => {
        vi.clearAllMocks()

        mockMulti.mockReturnValue({
            lrem : mockLrem.mockReturnThis(),
            rpush : mockRpush.mockReturnThis(),
            exec : mockExec.mockResolvedValue([])
        });
    });


    it("Should move job to DLQ queue" , async() => {
        const job = {
            jobId: "job-123",
            type: "email",
            payload: {
                to: "test@example.com",
                email: "test@example.com",
                message: "Hello"
            }
        };

        await moveToDLQ(job , "Random Error");

        expect(mockMulti).toHaveBeenCalledOnce();
        expect(mockLrem).toHaveBeenCalledOnce();
        expect(mockRpush).toHaveBeenCalledOnce();
        expect(mockExec).toHaveBeenCalledOnce();

        expect(updateJobStatus).toHaveBeenCalledWith(
            "job-123",
            "failed"
        );

    })

    it("Should throw an error when redis fails" , async() => {

        mockExec.mockRejectedValue(new Error("Redis connection failed"));

        const job = {
            jobId: "job-123",
            type: "email",
            payload: {
                to: "test@example.com",
                email: "test@example.com",
                message: "Hello"
            }
        };

        await expect(moveToDLQ(job , "Random Error")).rejects.toThrow("Redis connection failed")
    })
})

describe("acknowledgeJob" , () => {
    beforeEach(() => {
        vi.clearAllMocks();
    })

    it("Should acknowledge job" , async() =>{
        
        const job = {
            jobId: "job-123",
            type: "email",
            payload: {
                to: "test@example.com",
                email: "test@example.com",
                message: "Hello"
            }
        }

        await acknowledgeJob(job);

        expect(mockLrem).toHaveBeenCalledOnce();

        expect(mockLrem).toHaveBeenCalledWith(
            QUEUE_NAMES.PROCESSING,
            1,
            JSON.stringify(job)
        )

    })

    it('Should throw an error when redis fails' , async() => {
        mockLrem.mockRejectedValue(new Error("Redis Connection Failed"))

        const job = {
            jobId: "job-123",
            type: "email",
            payload: {
                to: "test@example.com",
                email: "test@example.com",
                message: "Hello"
            }
        }

        await expect(acknowledgeJob(job)).rejects.toThrow("Redis Connection Failed");
    })
})