const {
  Booking,
  Listing,
  stripe,
  reusableIntentStatuses,
  clearPendingIntentFromSession,
} = require("./common");
const nodemailer = require("nodemailer");
const User = require("../../models/user");
const Notification = require("../../models/notification");

const paymentSuccess = async (req, res) => {
  if (!stripe) {
    req.flash(
      "error",
      "Payment gateway is not configured. Add STRIPE_SECRET_KEY in .env",
    );
    return res.redirect("/listings");
  }

  const paymentIntentId = req.query.payment_intent;
  if (!paymentIntentId) {
    req.flash("error", "Missing payment session details.");
    return res.redirect("/listings");
  }

  const paymentIntent =
    await stripe.paymentIntents.retrieve(paymentIntentId);

  if (
    !paymentIntent ||
    paymentIntent.status !== "succeeded" ||
    !paymentIntent.metadata
  ) {
    const listingId = paymentIntent?.metadata?.listingId;
    req.flash("error", "Payment was not completed.");
    return res.redirect(
      listingId ? `/listings/${listingId}` : "/listings",
    );
  }

  if (
    paymentIntent.metadata.userId !== String(req.user._id)
  ) {
    req.flash("error", "Unauthorized payment session.");
    return res.redirect("/listings");
  }

  const existingBooking = await Booking.findOne({
    stripePaymentIntentId: paymentIntent.id,
  });
  if (existingBooking) {
    req.flash("success", "Booking already confirmed.");
    return res.redirect("/bookings/my");
  }

  const listing = await Listing.findById(
    paymentIntent.metadata.listingId,
  );
  if (!listing) {
    req.flash(
      "error",
      "Listing not found for this payment.",
    );
    return res.redirect("/listings");
  }

  const checkInDate = new Date(
    paymentIntent.metadata.checkIn,
  );
  const checkOutDate = new Date(
    paymentIntent.metadata.checkOut,
  );
  const people = Number.parseInt(
    paymentIntent.metadata.people,
    10,
  );
  const kids = Number.parseInt(
    paymentIntent.metadata.kids,
    10,
  );
  const infants = Number.parseInt(
    paymentIntent.metadata.infants || "0",
    10,
  );
  const pets = Number.parseInt(
    paymentIntent.metadata.pets,
    10,
  );

  if (
    !Number.isFinite(people) ||
    people < 1 ||
    !Number.isFinite(kids) ||
    kids < 0 ||
    !Number.isFinite(infants) ||
    infants < 0 ||
    !Number.isFinite(pets) ||
    pets < 0
  ) {
    req.flash(
      "error",
      "Invalid booking details in payment session. Please try booking again.",
    );
    return res.redirect(`/listings/${listing._id}`);
  }

  const listingMaxInfants = Number.isFinite(
    listing.maxInfants,
  )
    ? listing.maxInfants
    : 0;
  if (infants > listingMaxInfants) {
    req.flash(
      "error",
      `This listing allows maximum ${listingMaxInfants} infants.`,
    );
    return res.redirect(`/listings/${listing._id}`);
  }

  const overlappingBooking = await Booking.findOne({
    listing: listing._id,
    status: "confirmed",
    checkIn: { $lt: checkOutDate },
    checkOut: { $gt: checkInDate },
  });

  if (overlappingBooking) {
    req.flash(
      "error",
      "Payment received but selected dates are no longer available. Please contact support.",
    );
    return res.redirect(`/listings/${listing._id}`);
  }

  const booking = new Booking({
    listing: listing._id,
    user: req.user._id,
    checkIn: checkInDate,
    checkOut: checkOutDate,
    people,
    kids,
    infants,
    pets,
    totalPrice: Number(paymentIntent.metadata.totalPrice),
    paymentStatus: "paid",
    stripePaymentIntentId: paymentIntent.id,
    status: "confirmed",
  });

  await booking.save();
  clearPendingIntentFromSession(
    req.session,
    paymentIntent.id,
  );

  // Send confirmation email to user
  try {
    const user = await User.findById(req.user._id);
    const userEmail = user?.email || null;
    if (userEmail) {
      const subject =
        "Booking Confirmed & Payment Successful";
      const totalAmount =
        Number(paymentIntent.metadata.totalPrice) ||
        booking.totalPrice;
      const text = `Dear ${user.username || "User"},\n\nYour booking has been confirmed and payment was successful!\n\nDetails:\n- Listing: ${listing.title}\n- Check-in: ${checkInDate.toDateString()}\n- Check-out: ${checkOutDate.toDateString()}\n- Guests: ${people}${kids ? ", Kids: " + kids : ""}${infants ? ", Infants: " + infants : ""}${pets ? ", Pets: " + pets : ""}\n- Total Amount Paid: ₹${totalAmount}\n\nThank you for booking with us!`;

      await Notification.create({
        user: req.user._id,
        message: `Your booking for ${listing.title} is confirmed. Amount Paid: ₹${totalAmount}.`,
        type: "success",
      });

      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: userEmail,
        subject,
        text,
      });
    }
  } catch (e) {
    // Optionally log email error
  }

  req.flash(
    "success",
    "Payment successful! Booking confirmed. A confirmation email has been sent.",
  );
  res.redirect("/bookings/my");
};

const paymentCancel = async (req, res) => {
  const paymentIntentId = req.query.payment_intent;

  if (stripe && paymentIntentId) {
    try {
      const paymentIntent =
        await stripe.paymentIntents.retrieve(
          paymentIntentId,
        );
      if (
        paymentIntent &&
        reusableIntentStatuses.has(paymentIntent.status)
      ) {
        await stripe.paymentIntents.cancel(paymentIntentId);
      }
    } catch (err) {
      console.log(
        "Payment intent cancel skipped:",
        err.message,
      );
    }
  }

  clearPendingIntentFromSession(
    req.session,
    paymentIntentId,
  );
  req.flash("error", "Payment was cancelled.");
  res.redirect(`/listings/${req.params.id}`);
};

module.exports = {
  paymentSuccess,
  paymentCancel,
};
