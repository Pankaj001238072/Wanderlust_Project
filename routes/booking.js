const express = require("express");
const router = express.Router({ mergeParams: true });
const wrapAsync = require("../utils/wrapAsync.js");
const bookingController = require("../controllers/bookings.js");
const {
  isLoggedIn,
  validateBooking,
  isBookingOwner,
} = require("../middleware.js");

router.post(
  "/",
  isLoggedIn,
  validateBooking,
  wrapAsync(bookingController.startCheckout),
);

router.get(
  "/",
  isLoggedIn,
  wrapAsync(bookingController.renderCheckout),
);

router.get(
  "/payment/success",
  isLoggedIn,
  wrapAsync(bookingController.paymentSuccess),
);

router.post(
  "/update-payment-intent",
  isLoggedIn,
  wrapAsync(bookingController.updatePaymentIntent),
);

router.post(
  "/payment/cancel/:id",
  isLoggedIn,
  wrapAsync(bookingController.paymentCancel),
);

router.get(
  "/my",
  isLoggedIn,
  wrapAsync(bookingController.myBookings),
);

router.delete(
  "/:bookingId",
  isLoggedIn,
  isBookingOwner,
  wrapAsync(bookingController.cancelBooking),
);

module.exports = router;
