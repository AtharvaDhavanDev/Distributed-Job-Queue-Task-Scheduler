

export const sendEmail = async(payload : {to : string, email : string, message : string}) => {

    console.log("Email is processing...📌");

    console.log("------------------------------------")
    console.log(`Sending email to ${payload.to}...`)
    console.log(`Email : ${payload.email}...`)
    console.log(`Message - ${payload.message}...`)
    console.log("------------------------------------")

    await new Promise(resolve => setTimeout(resolve , 10000));
    throw new Error("Worker failed !")


    // console.log('Email sent successfully ✅');
}
