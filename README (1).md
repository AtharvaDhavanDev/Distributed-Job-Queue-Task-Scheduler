# Distributed Job Queue & Task Scheduler

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Redis-Queue%20Backend-DC382D?logo=redis&logoColor=white" alt="Redis">
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white" alt="Docker">
</p>

---

## Overview

**Distributed Job Queue & Task Scheduler** is an asynchronous backend system built with **Node.js, TypeScript, Express, and Redis**.

A client submits a job through a REST API. The API places the job into Redis, independent workers claim and process jobs, and dedicated scheduler/recovery services handle retries, delayed execution, and stalled jobs.

The project was built to understand the mechanics behind background job systems rather than relying entirely on a queue abstraction.

---

## Architecture

```text
                                   ┌──────────────┐
                                   │    CLIENT    │
                                   └──────┬───────┘
                                          │
                                  POST /api/v1/job
                                          │
                                          ▼
                               ┌────────────────────┐
                               │     EXPRESS API    │
                               │                    │
                               │ Validate → Create  │
                               │ job ID → Metadata  │
                               └─────────┬──────────┘
                                         │
                          ┌──────────────┴──────────────┐
                          │                             │
                    Immediate Job                 Delayed Job
                          │                             │
                          ▼                             ▼
                   ┌─────────────┐             ┌────────────────┐
                   │  job_queue  │             │scheduled_queue │
                   │ Redis List  │             │  Redis ZSET    │
                   └──────┬──────┘             └───────┬────────┘
                          │                             │
                          │                             │ executeAt
                          │                             ▼
                          │                    ┌──────────────────┐
                          │                    │ Scheduled Job    │
                          │                    │ Scheduler        │
                          │                    └────────┬─────────┘
                          │                             │
                          └─────────────────────────────┘
                                        │
                                        ▼
                              ┌─────────────────────┐
                              │     WORKER POOL     │
                              │                     │
                              │ ┌────────┐ ┌──────┐│
                              │ │Worker 1│ │Worker││
                              │ └────┬───┘ │  2   ││
                              │      │     └──┬───┘│
                              └──────┼────────┼─────┘
                                     │        │
                                     └────┬───┘
                                          ▼
                              ┌──────────────────────┐
                              │  processing_queue   │
                              │                      │
                              │ Currently processing│
                              │ jobs                 │
                              └──────────┬───────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │     JOB HANDLER      │
                              └──────────┬───────────┘
                                         │
                       ┌─────────────────┼─────────────────┐
                       │                 │                 │
                    SUCCESS           FAILURE            CRASH
                       │                 │                 │
                       ▼                 ▼                 ▼
                 ┌───────────┐    ┌────────────┐   ┌──────────────┐
                 │ COMPLETED │    │   RETRY    │   │   STALLED    │
                 └─────┬─────┘    └─────┬──────┘   │   RECOVERY   │
                       │                │           └──────┬───────┘
                       │                ▼                  │
                       │        ┌─────────────┐            │
                       │        │ retry_queue │            │
                       │        │ Redis ZSET  │            │
                       │        └──────┬──────┘            │
                       │               │                   │
                       │               ▼                   │
                       │        ┌──────────────┐           │
                       │        │    Retry     │           │
                       │        │   Scheduler  │           │
                       │        └──────┬───────┘           │
                       │               │                   │
                       │               ▼                   │
                       │           job_queue ◄─────────────┘
                       │               │
                       │               ▼
                       │             Worker
                       │
                       ▼
                    ┌───────┐
                    │  END  │
                    └───────┘

                         MAX RETRIES EXCEEDED
                                  │
                                  ▼
                         ┌───────────────────┐
                         │dead_letter_queue  │
                         │     Redis List     │
                         └─────────┬─────────┘
                                   │
                                   ▼
                                ┌───────┐
                                │  END  │
                                └───────┘
```

---

## Complete Job Lifecycle

```text
START
  │
  ▼
Client submits job
  │
  ▼
Express API validates request
  │
  ▼
Job metadata created
  │
  ├─────────────── Immediate ───────────────► job_queue
  │
  └─────────────── Delayed ─────────────────► scheduled_queue
                                                 │
                                                 ▼
                                          Scheduled Scheduler
                                                 │
                                                 ▼
                                             job_queue
                                                 │
                                                 ▼
                                              Worker
                                                 │
                                                 ▼
                                        processing_queue
                                                 │
                                                 ▼
                                           Job Handler
                                                 │
                              ┌──────────────────┼──────────────────┐
                              │                  │                  │
                           SUCCESS            FAILURE             CRASH
                              │                  │                  │
                              ▼                  ▼                  ▼
                          COMPLETED           RETRY          Stalled Recovery
                              │                  │                  │
                              ▼                  ▼                  ▼
                             END           retry_queue          job_queue
                                                 │                  │
                                                 ▼                  │
                                          Retry Scheduler           │
                                                 │                  │
                                                 ▼                  │
                                             job_queue ◄────────────┘
                                                 │
                                                 ▼
                                              Worker
                                                 │
                                                 ▼
                                            Try Again
                                                 │
                                   ┌─────────────┴─────────────┐
                                   │                           │
                              Attempts left              Max attempts
                                   │                           │
                                   ▼                           ▼
                                 RETRY                        DLQ
                                                               │
                                                               ▼
                                                              END
```

---

## Redis Queues

| Redis Key | Type | Responsibility |
|---|---|---|
| `job_queue` | List | Main queue for pending jobs |
| `processing_queue` | List | Jobs currently being processed |
| `retry_queue` | Sorted Set | Jobs waiting for retry |
| `scheduled_queue` | Sorted Set | Delayed jobs waiting for execution |
| `dead_letter_queue` | List | Jobs that permanently failed |

---

## Core Features

### Asynchronous Processing

The API only accepts and queues the job. Workers perform the actual background processing.

```text
Client
  │
  ▼
API
  │
  ▼
Redis
  │
  ▼
Worker
  │
  ▼
Handler
  │
  ▼
Completed
```

### Multiple Workers

Multiple worker processes consume the same queue and can process jobs concurrently.

```text
                    job_queue
                   /         \
                  ▼           ▼
             Worker 1     Worker 2
                  │           │
                  ▼           ▼
                Job A       Job B
```

### Reliable Job Claiming

Workers use Redis list operations to move jobs from:

```text
job_queue
    │
    ▼
processing_queue
```

This keeps claimed jobs visible while they are being processed.

### Retry & Backoff

Failed jobs are placed into a retry schedule rather than being retried immediately.

```text
FAIL
 │
 ▼
retry_queue
 │
 ▼
Retry Scheduler
 │
 ▼
job_queue
 │
 ▼
Worker
```

The retry mechanism uses delayed retry execution with increasing wait periods.

### Dead Letter Queue

Jobs that continue failing until the maximum attempt count is reached are moved to:

```text
dead_letter_queue
```

This prevents permanently failing jobs from being retried forever.

### Delayed Jobs

Jobs can be submitted with a delay:

```json
{
  "type": "send-email",
  "payload": {
    "to": "Luffy",
    "email": "luffy@gmail.com",
    "message": "Hey Luffy!"
  },
  "delay": 5000
}
```

Flow:

```text
scheduled_queue
       │
       │ executeAt reached
       ▼
Scheduled Scheduler
       │
       ▼
  job_queue
       │
       ▼
    Worker
```

### Job Cancellation

Pending and scheduled jobs can be cancelled:

```http
DELETE /api/v1/job/:jobId
```

```text
PENDING / SCHEDULED
        │
        ▼
     CANCEL
        │
        ▼
   CANCELLED
        │
        ▼
       END
```

### Job Status Tracking

Jobs maintain metadata including:

- Job ID
- Job type
- Status
- Attempt count
- Maximum attempts
- Creation timestamp
- Update timestamp
- Retry time when applicable
- Scheduled execution time when applicable

Supported statuses:

```text
pending
processing
completed
failed
retrying
scheduled
cancelled
```

### Stalled Job Recovery

If a worker crashes while processing a job, the stalled-job recovery service can detect the stale job and return it to the main queue.

```text
Worker crashes
      │
      ▼
processing_queue
      │
      ▼
Stall timeout exceeded
      │
      ▼
Stalled Recovery
      │
      ▼
job_queue
      │
      ▼
Another Worker
```

Current stall timeout:

```text
20 seconds
```

### Graceful Shutdown

Workers handle `SIGINT` and `SIGTERM`.

```text
Shutdown Signal
      │
      ▼
Stop accepting new jobs
      │
      ▼
Finish active job
      │
      ▼
Close Redis connection
      │
      ▼
END
```

---

# API

## Create Job

```http
POST /api/v1/job
```

### Request

```json
{
  "type": "send-email",
  "payload": {
    "to": "Luffy",
    "email": "luffy@gmail.com",
    "message": "Hey Luffy, where are you?"
  }
}
```

### Delayed Job

```json
{
  "type": "send-email",
  "payload": {
    "to": "Luffy",
    "email": "luffy@gmail.com",
    "message": "Hey Luffy, where are you?"
  },
  "delay": 5000
}
```

### Response

```http
202 Accepted
```

---

## Get Job Status

```http
GET /api/v1/job/:jobId
```

Example:

```json
{
  "jobId": "8a5c...",
  "type": "send-email",
  "status": "completed",
  "attempts": 1,
  "maxAttempts": 3,
  "createdAt": "2026-09-25T12:00:00.000Z",
  "updatedAt": "2026-09-25T12:00:10.000Z"
}
```

---

## Cancel Job

```http
DELETE /api/v1/job/:jobId
```

Only pending and scheduled jobs can be cancelled.

---

# Project Structure

```text
Distributed-Job-Queue-Task-Scheduler/
│
├── src/
│   ├── config/
│   │   ├── queue.config.ts
│   │   └── redisClient.ts
│   │
│   ├── controllers/
│   │   └── job.controller.ts
│   │
│   ├── jobs/
│   │   └── jobHandlers.ts
│   │
│   ├── routes/
│   │   └── job.route.ts
│   │
│   ├── services/
│   │   ├── job.service.ts
│   │   └── queue.service.ts
│   │
│   ├── types/
│   │   └── types.ts
│   │
│   ├── validators/
│   │   └── jobInput.validator.ts
│   │
│   ├── workers/
│   │   ├── worker.ts
│   │   ├── retryScheduler.ts
│   │   ├── scheduledJobScheduler.ts
│   │   └── stalledJobRecovery.ts
│   │
│   └── index.ts
│
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

# Technology Stack

| Technology | Purpose |
|---|---|
| Node.js | Runtime |
| TypeScript | Application language |
| Express | REST API |
| Redis | Queue and state management |
| ioredis | Redis client |
| Joi | Request validation |
| Docker | Containerization |
| Docker Compose | Multi-service orchestration |

---

# Running Locally

## 1. Install Dependencies

```bash
npm install
```

## 2. Configure Environment Variables

Create a `.env` file:

```env
REDIS_ENDPOINT=your_redis_connection_string
PORT=3001
```

Do not commit `.env` to GitHub.

## 3. Build

```bash
npm run build
```

## 4. Start

```bash
npm start
```

The API runs on:

```text
http://localhost:3001
```

### Development

```bash
npm run dev
```

---

# Docker

The project includes Docker and Docker Compose support.

## Build Image

```bash
docker build -t job-queue .
```

## Start All Services

```bash
docker compose up -d
```

The Compose setup runs:

```text
┌─────────────────────────────────────────────┐
│              Docker Compose                 │
│                                             │
│  API                                        │
│  Worker 1                                   │
│  Worker 2                                   │
│  Retry Scheduler                             │
│  Scheduled Job Scheduler                    │
│  Stalled Job Recovery                       │
│                                             │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
                  Redis Backend
```

## Check Services

```bash
docker compose ps
```

## API Logs

```bash
docker compose logs -f api
```

## Worker Logs

```bash
docker compose logs -f worker-1
docker compose logs -f worker-2
```

## Stop Everything

```bash
docker compose down
```

---

# Reliability Model

The system is designed around several failure scenarios.

### Worker Crash

```text
Worker
  │
  ▼
Processing Job
  │
  X
Crash
  │
  ▼
Stalled Recovery
  │
  ▼
job_queue
  │
  ▼
Another Worker
```

### Temporary Failure

```text
Job
 │
 ▼
FAIL
 │
 ▼
retry_queue
 │
 ▼
Retry Scheduler
 │
 ▼
job_queue
 │
 ▼
Worker
```

### Permanent Failure

```text
Job
 │
 ▼
FAIL
 │
 ▼
Retry
 │
 ▼
FAIL
 │
 ▼
Maximum Attempts
 │
 ▼
dead_letter_queue
 │
 ▼
END
```

### Normal Shutdown

```text
SIGINT / SIGTERM
       │
       ▼
Stop accepting new jobs
       │
       ▼
Finish active jobs
       │
       ▼
Close Redis
       │
       ▼
END
```

---

# Docker Services

```text
                    Docker Compose
                          │
       ┌──────────────────┼──────────────────┐
       │                  │                  │
       ▼                  ▼                  ▼
      API              Worker 1           Worker 2
       │                  │                  │
       └──────────────────┼──────────────────┘
                          │
             ┌────────────┼─────────────┐
             │            │             │
             ▼            ▼             ▼
        Retry         Scheduled       Stalled
       Scheduler       Scheduler      Recovery
             │            │             │
             └────────────┼─────────────┘
                          │
                          ▼
                       Redis
```

---

# Project Goals

This project focuses on understanding the internals of asynchronous backend systems:

```text
Job Creation
     ↓
Queueing
     ↓
Job Claiming
     ↓
Processing
     ↓
Success / Failure
     ↓
Retry & Backoff
     ↓
Dead Letter Queue
     ↓
Scheduling
     ↓
Failure Recovery
     ↓
Graceful Shutdown
```

Rather than treating a queue as a black box, the project implements the core workflow around Redis primitives and separate worker/scheduler processes.

---

# Project Status

| Component | Status |
|---|:---:|
| Basic Queue | ✅ |
| Multiple Workers | ✅ |
| Job Status Tracking | ✅ |
| Retry Mechanism | ✅ |
| Exponential Backoff | ✅ |
| Dead Letter Queue | ✅ |
| Reliable Job Claiming | ✅ |
| Delayed / Scheduled Jobs | ✅ |
| Job Cancellation | ✅ |
| Stalled Job Recovery | ✅ |
| Graceful Shutdown | ✅ |
| Tests | ✅ |
| Docker | ✅ |
| Docker Compose | ✅ |
| Deployment | ✅ |

---

## Author

**Atharva Dhavan**

Built as a backend engineering project focused on asynchronous processing, Redis, reliability, and distributed-system concepts.
