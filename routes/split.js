const express = require("express");
const router  = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const { createSplitBooking, showSplitPayPage, confirmSplitPayment } = require("../controllers/split.js");

// Auth guard
const isLoggedIn = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  req.flash("error", "You must be logged in.");
  return req.session.save(() => res.redirect("/login"));
};

router.post("/:bookingId", isLoggedIn, wrapAsync(createSplitBooking));

// Initiator success page
router.get("/:bookingId/split-details", isLoggedIn, wrapAsync(async (req, res) => {
    const Booking = require("../models/booking.js");
    const SplitBooking = require("../models/splitBooking.js");
    
    const booking = await Booking.findById(req.params.bookingId).populate("listing");
    const split = await SplitBooking.findOne({ booking: booking._id });
    
    if (!split) return res.redirect("/bookings/my");

    // ⏰ Calculate Time Remaining for Last-Minute Bookings
    let minutesRemaining = null;
    const checkInThreshold = new Date(Date.now() + 2 * 60 * 60 * 1000);
    if (booking.checkIn < checkInThreshold) {
      const expiryTime = new Date(booking.createdAt.getTime() + 60 * 60 * 1000);
      minutesRemaining = Math.max(0, Math.ceil((expiryTime - Date.now()) / (60 * 1000)));
    }

    res.render("bookings/splitDetails.ejs", { 
        booking, 
        split,
        minutesRemaining,
        baseUrl: process.env.BASE_URL || `${req.protocol}://${req.get('host')}`
    });
}));

router.get("/pay/:token",             wrapAsync(showSplitPayPage));
router.post("/pay/:token/confirm",    wrapAsync(confirmSplitPayment));

module.exports = router;
