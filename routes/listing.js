const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn } = require("../middlewares/auth.js");
const { isOwner } = require("../middlewares/ownership.js");
const {
  validateListing,
} = require("../middlewares/validation.js");
const listingController = require("../controllers/listings.js"); // Importing the listing controller to handle the logic for each route
const multer = require("multer"); // Importing multer for handling file uploads
const User = require("../models/user");

// temporary upload to local folder (will be uploaded to Cloudinary only after validation)
const path = require("path");
const uploadDir = path.join(__dirname, "..", "uploads");
const upload = multer({ dest: uploadDir });

// Index Route to display all listings and Create Route to add a new listing
router
  .route("/")
  .get(wrapAsync(listingController.index)) // Index Route to display all listings
  .post(
    // Create Route to add a new listing
    isLoggedIn,
    upload.single("listing[image]"), // Handling image upload for the listing using multer
    validateListing,
    wrapAsync(listingController.createListing),
  );

// New Route
router.get(
  "/new",
  isLoggedIn,
  listingController.renderNewForm,
);

// Wishlist Route
router.get(
  "/wishlist",
  isLoggedIn,
  wrapAsync(listingController.userWishlist),
);

// Show Route, Update Route, and Delete Route for a specific listing by ID
router
  .route("/:id")
  .get(wrapAsync(listingController.showListing)) // Show Route to display a specific listing by ID
  .put(
    // Update Route to update a specific listing by ID
    isLoggedIn,
    isOwner,
    upload.single("listing[image]"), // Handling image upload for the listing using multer
    validateListing,
    wrapAsync(listingController.updateListing),
  )
  .delete(
    // Delete Route to delete a specific listing by ID
    isLoggedIn,
    isOwner,
    wrapAsync(listingController.destroyListing),
  );

// Edit Route
router.get(
  "/:id/edit",
  isLoggedIn,
  isOwner,
  wrapAsync(listingController.renderEditForm),
);

// ✅ ADD TO WISHLIST
router.post(
  "/:id/wishlist",
  isLoggedIn,
  wrapAsync(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (
      !user.wishlist.some(
        (id) => id.toString() === req.params.id,
      )
    ) {
      user.wishlist.push(req.params.id);
      await user.save();
    }

    res.json({ success: true });
  }),
);

// ❌ REMOVE FROM WISHLIST
router.delete(
  "/:id/wishlist",
  isLoggedIn,
  wrapAsync(async (req, res) => {
    const user = await User.findById(req.user._id);

    user.wishlist = user.wishlist.filter(
      (id) => id.toString() !== req.params.id,
    );

    await user.save();

    res.json({ success: true });
  }),
);

module.exports = router;
