import dotenv from "dotenv";
dotenv.config();

import express from "express";
const app = express();
const port = process.env.PORT || 3001;
import cookieParser from 'cookie-parser';
import jobRoute from './routes/job.route'


//middlewares
app.use(express.json());
app.use(cookieParser());

//routes
app.use('/api' , jobRoute)

app.listen(port , () => {
    console.log(`Server is running on PORT : ${port}`)
})

