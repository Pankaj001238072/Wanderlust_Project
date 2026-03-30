const Listing = require("../models/listing.js");    // Importing the Listing model
const Review = require("../models/review.js");        // Importing the Review model

module.exports.createReview = async (req, res) => {
    let listing = await Listing.findById(req.params.id);
    let newReview = new Review(req.body.review);
    newReview.author = req.user._id; // Setting the author of the review to the current user's ID
    listing.reviews.push(newReview);

    await newReview.save();
    await listing.save();
    req.flash("success", "Review Created!"); // Setting a success flash message
    res.redirect(`/listings/${listing._id}`);
  };


  module.exports.destroyReview = async (req, res) => {
    const { id, reviewId } = req.params;

    await Listing.findByIdAndUpdate(id, { $pull: { reviews: reviewId } });
    await Review.findByIdAndDelete(reviewId);
    req.flash("success", "Review Deleted!"); // Setting a success flash message
    res.redirect(`/listings/${id}`);
  };