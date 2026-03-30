const Joi = require("joi");

const userSchema = Joi.object({
  user: Joi.object({
    username: Joi.string().min(3).required(),
    email: Joi.string()
      .pattern(
        /^[^\s@]+@(gmail\.com|yahoo\.com|outlook\.com)$/,
      )
      .required()
      .messages({
        "string.pattern.base":
          "Only gmail.com, yahoo.com, outlook.com allowed",
      }),
    password: Joi.string().min(4).required(),
  }).required(),
  _csrf: Joi.string().optional(),
});

module.exports = userSchema;
