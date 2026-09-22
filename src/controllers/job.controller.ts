import {Request , Response} from 'express'
import { addJob, cancelJob, getJobStatus } from '../services/job.services';
import { jobInputJoi } from '../validators/jobInput.validator';
import { createJobInput } from '../types/types';


export const handleCreateJob = async(req : Request , res : Response) => { //Producer
    try{

        const {error , value} = jobInputJoi.validate(req.body , {
            abortEarly : false
        });

        if(error){
            return res.status(400).json({
                msg : error.details[0].message
            })
        }

        const {type, payload , delay} = value as createJobInput;
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

export const handleCancelJob = async (req: Request , res: Response) => {
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
 

