const Joi = require("joi");

const listingSchema = Joi.object({
  listing: Joi.object({
    title: Joi.string().required(),
    description: Joi.string().required(),
    location: Joi.string().required(),
    country: Joi.string().required(),
    price: Joi.number().required().min(0),
    baseGuests: Joi.number()
      .integer()
      .min(1)
      .max(20)
      .required(),
    maxGuests: Joi.number()
      .integer()
      .min(1)
      .max(20)
      .required(),
    maxKids: Joi.number()
      .integer()
      .min(0)
      .max(10)
      .required(),
    maxInfants: Joi.number()
      .integer()
      .min(0)
      .max(5)
      .required(),
    maxPets: Joi.number()
      .integer()
      .min(0)
      .max(10)
      .required(),
    extraGuestFeePerNight: Joi.number()
      .min(0)
      .max(50000)
      .required(),
    category: Joi.string()
      .valid(
        "trending",
        "rooms",
        "iconic",
        "mountains",
        "castles",
        "pools",
        "camping",
        "farms",
        "arctic",
        "domes",
        "boats",
      )
      .required(),
    image: Joi.any(),
    addOns: Joi.any().optional(),
  })
    .required()
    .custom((value, helpers) => {
      if (value.maxGuests < value.baseGuests) {
        return helpers.error("any.custom", {
          message:
            "Maximum guests must be greater than or equal to base guests",
        });
      }
      return value;
    })
    .messages({
      "any.custom": "{{#message}}",
    }),
  _csrf: Joi.string().optional(),
});

module.exports = listingSchema;
