import dotenv from "dotenv";
dotenv.config();

import express from "express";
const app = express();
const port = process.env.PORT || 3001;
import jobRoute from './routes/job.route'


//middlewares
app.use(express.json());

//routes
app.use('/api/v1' , jobRoute)


app.listen(port , () => {
    console.log(`Server is running on PORT : ${port}`)
})

