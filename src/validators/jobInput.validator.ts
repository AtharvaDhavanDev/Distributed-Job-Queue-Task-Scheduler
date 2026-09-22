import joi from 'joi';

export const jobInputJoi = joi.object({
    type : joi.string().required().trim(),

    payload : joi.object({
        to : joi.string().trim().required(),
        email: joi.string().email().trim().required(),
        message: joi.string().trim().required(),
    }).required(),

    delay : joi.number().integer().min(0).optional()
})