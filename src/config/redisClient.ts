import dotenv from 'dotenv';
dotenv.config()

import {Redis} from 'ioredis';

export const client = new Redis(
    process.env.REDIS_ENDPOINT!
);

client.on('connect', () => {
    console.log('Redis DB connected ✅')
})

client.on('ready', () => {
    console.log('Redis DB ready 🟢')
})

client.on('close', () => {
    console.log('Redis close event ⚠️')
})

client.on('reconnecting', () => {
    console.log('Redis reconnecting 🔄')
})

client.on('error', (error) => {
    console.error("Redis connection error:", error)
})

// process.on("SIGINT", async () => {
//     console.log("SIGINT received — shutting down worker ⚠️");

//     await client.quit();

//     console.log("Redis Connection Closed ❌");
//     process.exit(0);
// });

// process.on("SIGTERM", () => {
//     console.log("SIGTERM received ⚠️");
// });

process.on("uncaughtException", (error) => {
    console.error("UNCAUGHT EXCEPTION:", error);
});

process.on("unhandledRejection", (error) => {
    console.error("UNHANDLED REJECTION:", error);
});