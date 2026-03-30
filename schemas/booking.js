const Joi = require("joi");

const bookingSchema = Joi.object({
  booking: Joi.object({
    checkIn: Joi.string()
      .pattern(/^\d{4}-\d{2}-\d{2}$/)
      .required()
      .messages({
        "string.pattern.base": "Check-in date is invalid",
      }),
    checkOut: Joi.string()
      .pattern(/^\d{4}-\d{2}-\d{2}$/)
      .required()
      .messages({
        "string.pattern.base": "Check-out date is invalid",
      }),
    people: Joi.number()
      .integer()
      .min(1)
      .max(20)
      .required()
      .messages({
        "number.max":
          "People count is too high. Please enter up to 20.",
        "number.unsafe":
          "People count is too large. Please enter a smaller number.",
      }),
    kids: Joi.number()
      .integer()
      .min(0)
      .max(10)
      .required()
      .messages({
        "number.max":
          "Kids count is too high. Please enter up to 10.",
        "number.unsafe":
          "Kids count is too large. Please enter a smaller number.",
      }),
    infants: Joi.number()
      .integer()
      .min(0)
      .max(5)
      .required()
      .messages({
        "number.max":
          "Infants count is too high. Please enter up to 5.",
        "number.unsafe":
          "Infants count is too large. Please enter a smaller number.",
      }),
    pets: Joi.number()
      .integer()
      .min(0)
      .max(10)
      .required()
      .messages({
        "number.max":
          "Pets count is too high. Please enter up to 10.",
        "number.unsafe":
          "Pets count is too large. Please enter a smaller number.",
      }),
  }).required(),
  _csrf: Joi.string().optional(),
});

module.exports = bookingSchema;
