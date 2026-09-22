import express from 'express';
import { handleCancelJob, handleCreateJob, handleGetJobStatus } from '../controllers/job.controller';
const route = express.Router();

route.post('/job' , handleCreateJob);

route.get('/job/:jobId' , handleGetJobStatus);

route.delete('/job/:jobId', handleCancelJob);

export default route;