const Joi = require("joi");

const reviewSchema = Joi.object({
  review: Joi.object({
    rating: Joi.number().required().min(1).max(5),
    comment: Joi.string().required(),
  }).required(),
  _csrf: Joi.string().optional(),
});

module.exports = reviewSchema;
