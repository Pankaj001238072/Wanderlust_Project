const express = require("express"); // Importing Express framework
const router = express.Router({ mergeParams: true }); // Creating a new router instance with merged parameters
const wrapAsync = require("../utils/wrapAsync.js"); // Importing wrapAsync utility for error handling in async functions
const {
  validateReview,
  isLoggedIn,
  isReviewAuthor,
} = require("../middleware.js"); // Importing middleware functions to validate review data, check if the user is logged in, and check if the user is the author of the review
const reviewController = require("../controllers/reviews.js"); // Importing the reviews controller which contains the logic for creating and deleting reviews

// Post Review Route
router.post(
  "/",
  isLoggedIn,
  validateReview,
  wrapAsync(reviewController.createReview),
);

// Delete Review Route
router.delete(
  "/:reviewId",
  isLoggedIn,
  isReviewAuthor,
  wrapAsync(reviewController.destroyReview),
);

module.exports = router;
