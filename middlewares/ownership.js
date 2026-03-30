const Listing = require("../models/listing");
const Review = require("../models/review");
const Booking = require("../models/booking");

const isOwner = async (req, res, next) => {
  const { id } = req.params;
  const listing = await Listing.findById(id);

  if (!listing) {
    req.flash("error", "Listing not found!");
    return res.redirect("/listings");
  }

  if (!listing.owner.equals(res.locals.currUser._id)) {
    req.flash(
      "error",
      "You are not the owner of this listing!",
    );
    return res.redirect(`/listings/${id}`);
  }

  next();
};

const isReviewAuthor = async (req, res, next) => {
  const { id, reviewId } = req.params;
  const review = await Review.findById(reviewId);

  if (!review.author.equals(res.locals.currUser._id)) {
    req.flash(
      "error",
      "You are not the author of this review!",
    );
    return res.redirect(`/listings/${id}`);
  }

  next();
};

const isBookingOwner = async (req, res, next) => {
  const { bookingId } = req.params;
  const booking = await Booking.findById(bookingId);

  if (!booking) {
    req.flash("error", "Booking not found.");
    return res.redirect("/bookings/my");
  }

  if (!booking.user.equals(res.locals.currUser._id)) {
    req.flash(
      "error",
      "You are not allowed to cancel this booking.",
    );
    return res.redirect("/bookings/my");
  }

  res.locals.booking = booking;
  next();
};

module.exports = {
  isOwner,
  isReviewAuthor,
  isBookingOwner,
};
