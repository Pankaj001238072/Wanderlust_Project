const express = require("express");
const router = express.Router();
const offersController = require("../controllers/offers");
const { isLoggedIn } = require("../middlewares/auth");

// Show all offers (only for logged-in users)
router.get("/", isLoggedIn, offersController.listOffers);

// Owner creates new offer (GET form, only for logged-in users)
const Listing = require("../models/listing");
router.get("/new", isLoggedIn, async (req, res) => {
  // Only show listings owned by current user
  const listings = await Listing.find({
    owner: req.user._id,
  });
  res.render("offers/new", { listings });
});

// Owner submits new offer (POST, only for logged-in users)
router.post("/", isLoggedIn, offersController.createOffer);

// Delete offer (only owner)
router.post("/:id/delete", isLoggedIn, async (req, res) => {
  const Offer = require("../models/offer");
  const offer = await Offer.findById(req.params.id);
  if (!offer) {
    req.flash("error", "Offer not found!");
    return res.redirect("/offer");
  }
  if (!offer.owner.equals(req.user._id)) {
    req.flash(
      "error",
      "You are not authorized to delete this offer!",
    );
    return res.redirect("/offer");
  }
  await Offer.findByIdAndDelete(req.params.id);
  req.flash("success", "Offer deleted successfully!");
  res.redirect("/offer");
});

module.exports = router;
