const Joi = require("joi");

const profileUpdateSchema = Joi.object({
  username: Joi.string().min(3).required().trim(),
  email: Joi.string()
    .trim()
    .pattern(
      /^[^\s@]+@(gmail\.com|yahoo\.com|outlook\.com)$/,
    )
    .required()
    .messages({
      "string.pattern.base":
        "Only gmail.com, yahoo.com, outlook.com allowed",
    }),
  phone: Joi.string()
    .trim()
    .allow("")
    .pattern(/^[6-9]\d{9}$/)
    .messages({
      "string.pattern.base":
        "Phone must be a valid 10-digit Indian mobile number (starting with 6-9) or left blank.",
    }),
});

module.exports = profileUpdateSchema;
