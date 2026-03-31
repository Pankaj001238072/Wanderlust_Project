const { Booking, canCancelBooking } = require("./common");
const { stripe } = require("./common");
const nodemailer = require("nodemailer");
const User = require("../../models/user");
const Notification = require("../../models/notification");

const myBookings = async (req, res) => {
  const bookings = await Booking.find({
    user: req.user._id,
  })
    .populate("listing")
    .sort({ createdAt: -1 });

  res.render("bookings/index.ejs", { bookings });
};

const cancelBooking = async (req, res) => {
  const booking = res.locals.booking;

  // Fetch user email
  let userEmail = null;
  try {
    const user = await User.findById(booking.user);
    userEmail = user?.email || null;
  } catch (e) {}

  if (booking.status === "cancelled") {
    req.flash("error", "Booking is already cancelled.");
    return res.redirect("/bookings/my");
  }

  if (!canCancelBooking(booking)) {
    req.flash(
      "error",
      "Cancellation window has expired. You can cancel within 30 minutes of booking or at least 2 hours before check-in.",
    );
    return res.redirect("/bookings/my");
  }

  let refundSuccess = false;
  let refundError = null;
  if (booking.stripePaymentIntentId && stripe) {
    try {
      await stripe.refunds.create({
        payment_intent: booking.stripePaymentIntentId,
      });
      refundSuccess = true;
    } catch (err) {
      refundError = err.message || "Refund failed.";
    }
  }

  booking.status = "cancelled";
  await booking.save();

  // Email setup
  if (userEmail) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
        port: process.env.SMTP_PORT == '465' ? 2525 : (parseInt(process.env.SMTP_PORT) || 2525),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      let subject, text;
      const totalAmount = booking.totalPrice || 0;
      if (refundSuccess) {
        subject = "Your Booking Refund is Initiated";
        text = `Your booking has been cancelled and your payment refund of ₹${totalAmount} has been initiated. The refund will reflect in your account in 5-7 business days.`;
      } else if (refundError) {
        subject = "Booking Cancelled - Refund Failed";
        text = `Your booking was cancelled, but the payment refund of ₹${totalAmount} failed. Reason: ${refundError}\nPlease contact support if you do not receive your refund.`;
      } else {
        subject = "Booking Cancelled";
        text = `Your booking was cancelled. (No payment to refund or refund not processed)`;
      }

      if (booking.user) {
        await Notification.create({
          user: booking.user,
          message: text,
          type: "warning",
        });
      }

      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: userEmail,
        subject,
        text,
      });
    } catch (e) {
      // Optionally log email error
    }
  }

  if (refundSuccess) {
    req.flash(
      "success",
      "Booking cancelled and payment refund initiated. Refund will reflect in your account in 5-7 business days. A confirmation email has been sent.",
    );
  } else if (refundError) {
    req.flash(
      "error",
      `Booking cancelled, but refund failed: ${refundError} Please contact support. Email notification sent.`,
    );
  } else {
    req.flash(
      "success",
      "Booking cancelled successfully. (No payment to refund or refund not processed) Email notification sent.",
    );
  }
  res.redirect("/bookings/my");
};

module.exports = {
  myBookings,
  cancelBooking,
};
