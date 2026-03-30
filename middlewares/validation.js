const ExpressError = require("../utils/ExpressError");
const {
  deleteLocalFile,
} = require("../helpers/fileHelper");
const {
  listingSchema,
  reviewSchema,
  bookingSchema,
  userSchema,
} = require("../schema");

const validateListing = async (req, res, next) => {
  const { error } = listingSchema.validate(req.body);
  if (error) {
    if (req.file) {
      await deleteLocalFile(req.file);
    }
    const errMsg = error.details
      .map((el) => el.message)
      .join(",");
    throw new ExpressError(400, errMsg);
  }
  next();
};

const validateReview = (req, res, next) => {
  const { error } = reviewSchema.validate(req.body);
  if (error) {
    const errMsg = error.details
      .map((el) => el.message)
      .join(", ");
    throw new ExpressError(400, errMsg);
  }
  next();
};

const parseDateOnly = (value) => {
  if (typeof value !== "string") return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
};

const validateBooking = (req, res, next) => {
  const { error } = bookingSchema.validate(req.body);
  if (error) {
    const errMsg = error.details
      .map((el) => el.message)
      .join(", ");
    throw new ExpressError(400, errMsg);
  }

  const checkInDate = parseDateOnly(
    req.body.booking?.checkIn,
  );
  const checkOutDate = parseDateOnly(
    req.body.booking?.checkOut,
  );

  if (!checkInDate || !checkOutDate) {
    throw new ExpressError(
      400,
      "Please enter valid check-in and check-out dates.",
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (checkInDate < today) {
    throw new ExpressError(
      400,
      "Check-in date cannot be in the past.",
    );
  }

  if (checkOutDate <= checkInDate) {
    throw new ExpressError(
      400,
      "Check-out must be after check-in.",
    );
  }

  next();
};

const validateUser = (req, res, next) => {
  const userPayload = req.body.user
    ? {
        username: req.body.user.username,
        email: req.body.user.email,
        password: req.body.user.password,
      }
    : {
        username: req.body.username,
        email: req.body.email,
        password: req.body.password,
      };

  const { error } = userSchema.validate({
    user: userPayload,
    _csrf: req.body._csrf,
  });

  if (error) {
    const errMsg = error.details
      .map((el) => el.message)
      .join(",");
    req.flash("error", errMsg);
    return res.redirect("/signup");
  }

  next();
};

module.exports = {
  validateListing,
  validateReview,
  validateBooking,
  validateUser,
};
