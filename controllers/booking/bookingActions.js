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
    return req.session.save(() => res.redirect("/bookings/my"));
  }

  if (!canCancelBooking(booking)) {
    req.flash(
      "error",
      "Cancellation window has expired. You can cancel within 30 minutes of booking or at least 2 hours before check-in.",
    );
    return req.session.save(() => res.redirect("/bookings/my"));
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

  const wasPendingSplit = booking.status === "pending_split";

  booking.status = "cancelled";
  await booking.save();

  // 🪙 Revert Wallet Coins for ALL users involved in this booking
  try {
    const Wallet = require("../../models/wallet.js");
    // Find all wallets that have transactions for this booking
    const walletsToFix = await Wallet.find({ "transactions.bookingId": booking._id });
    
    for (const wallet of walletsToFix) {
      let coinsToRefund = 0;
      let coinsToRevoke = 0;
      for (const tx of wallet.transactions) {
        if (tx.bookingId && tx.bookingId.equals(booking._id)) {
          if (tx.type === "debit") coinsToRefund += tx.coins;
          if (tx.type === "credit") coinsToRevoke += tx.coins;
        }
      }
      if (coinsToRefund > 0) {
        await Wallet.credit(wallet.user, coinsToRefund, `Refund for cancelled booking: ${booking._id}`, booking._id, "refund");
      }
      if (coinsToRevoke > 0) {
        await Wallet.debit(wallet.user, coinsToRevoke, `Revoked earned coins for cancelled booking: ${booking._id}`, booking._id, "revoke");
      }
    }
  } catch (err) {
    console.error("Wallet Reversal Error:", err);
  }

  // Email & Notification (Non-blocking Background Task)
  if (userEmail) {
    setImmediate(async () => {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
          port: process.env.SMTP_PORT == "465" ? 2525 : parseInt(process.env.SMTP_PORT) || 2525,
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        let subject, text;
        let refundDisplayAmount = booking.totalPrice || 0;
        let splitData = null;

        if (booking.splitBooking) {
          const SplitBooking = require("../../models/splitBooking.js");
          splitData = await SplitBooking.findById(booking.splitBooking);
          if (splitData) {
            refundDisplayAmount = splitData.amountPerPerson * splitData.paidShares;
          } else {
            refundDisplayAmount = Math.round(refundDisplayAmount / 2); // Fallback
          }
        }

        if (refundSuccess) {
          subject = "Your Booking Refund is Initiated";
          if (splitData) {
            text = `Your group booking has been cancelled. A total refund of ₹${refundDisplayAmount} (for ${splitData.paidShares} paid shares) has been initiated across all participants. A refund of your individual share (₹${splitData.amountPerPerson}) will reflect in your account in 5-7 business days.`;
          } else {
            text = `Your booking has been cancelled and your payment refund of ₹${refundDisplayAmount} has been initiated. The refund will reflect in your account in 5-7 business days.`;
          }
        } else if (refundError) {
          subject = "Booking Cancelled - Refund Failed";
          text = `Your booking was cancelled, but the payment refund of ₹${refundDisplayAmount} failed. Reason: ${refundError}\nPlease contact support if you do not receive your refund.`;
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
          from: `"Wanderlust Support" <${process.env.CONTACT_EMAIL_RECEIVER || process.env.SMTP_USER}>`,
          to: userEmail,
          subject,
          text,
        });

        if (splitData && splitData.friendEmails && splitData.friendEmails.length > 0) {
          const friendText = refundSuccess
            ? `The group booking you paid for has been cancelled. A refund of your share (₹${splitData.amountPerPerson}) has been initiated and will reflect in 5-7 business days.`
            : `The group booking you paid for has been cancelled.`;

          for (const fEmail of splitData.friendEmails) {
            await transporter.sendMail({
              from: `"Wanderlust Support" <${process.env.CONTACT_EMAIL_RECEIVER || process.env.SMTP_USER}>`,
              to: fEmail,
              subject: "Group Booking Cancelled",
              text: friendText,
            }).catch(e => console.error("Error emailing friend:", e.message));
          }
        }
      } catch (e) {
        console.error("Background Cancellation Email Error:", e.message);
      }
    });
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
  req.session.save(() => res.redirect("/bookings/my"));
};

module.exports = {
  myBookings,
  cancelBooking,
};
