/**
 * Split Booking Controller
 * POST /split/:bookingId – divide bill among friends and send email links
 */

const crypto = require("crypto");
const nodemailer = require("nodemailer");
const Booking = require("../models/booking.js");
const SplitBooking = require("../models/splitBooking.js");
const Listing = require("../models/listing.js");
const User = require("../models/user.js");
const Notification = require("../models/notification.js");

// ─── Mailer setup ─────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
  port: process.env.SMTP_PORT == "465" ? 2525 : parseInt(process.env.SMTP_PORT) || 2525,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const createSplitBooking = async (req, res) => {
  const { bookingId } = req.params;
  const { friendEmails } = req.body; // CSV or array of emails

  const booking = await Booking.findById(bookingId).populate("listing");
  if (!booking) {
    req.flash("error", "Booking not found.");
    return req.session.save(() => res.redirect("/listings"));
  }

  // Only the booking owner can split
  if (String(booking.user) !== String(req.user._id)) {
    req.flash("error", "You can only split your own bookings.");
    return req.session.save(() => res.redirect("/listings"));
  }

  // Parse emails
  const rawEmails = Array.isArray(friendEmails)
    ? friendEmails
    : String(friendEmails)
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

  if (rawEmails.length === 0) {
    req.flash("error", "Please provide at least one friend's email.");
    return req.session.save(() => res.redirect(`/listings/${booking.listing._id}`));
  }

  const totalPeople = rawEmails.length + 1; // friends + you
  const amountPerPerson = Math.round(booking.totalPrice / totalPeople);

  // Build participants (friends only – initiator pays via existing booking)
  const participants = rawEmails.map((email) => ({
    email,
    amount: amountPerPerson,
    paid: false,
    paymentToken: crypto.randomBytes(20).toString("hex"),
  }));

  // Save split booking
  const split = new SplitBooking({
    booking: booking._id,
    initiator: req.user._id,
    totalAmount: booking.totalPrice,
    participants,
  });
  await split.save();

  // Update booking reference
  booking.splitBooking = split._id;
  await booking.save();

  // Send emails
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 8080}`;

  for (const participant of participants) {
    const payLink = `${baseUrl}/split/pay/${participant.paymentToken}`;
    await transporter.sendMail({
      from: `"Wanderlust" <${process.env.CONTACT_EMAIL_RECEIVER || process.env.SMTP_USER}>`,
      to: participant.email,
      subject: `🏠 You've been invited to split a stay!`,
      html: `
        <div style="font-family: sans-serif; max-width:540px; margin:auto; padding:24px; border:1px solid #eee; border-radius:12px;">
          <h2 style="color:#ff385c;">Wanderlust – Group Booking Split</h2>
          <p><b>${req.user.username}</b> has booked <b>${booking.listing?.title || "a stay"}</b> and invited you to share the cost!</p>
          <p style="font-size:1.2rem;">Your share: <b>₹${amountPerPerson.toLocaleString("en-IN")}</b></p>
          <a href="${payLink}" style="display:inline-block;padding:12px 28px;background:#ff385c;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">
            Pay Your Share
          </a>
          <p style="margin-top:16px;color:#888;font-size:0.85rem;">Link expires in 48 hours. If you didn't expect this, ignore this email.</p>
        </div>
      `,
    }).catch((err) => console.error("Split email error:", err.message));
  }

  req.flash("success", `Payment links sent to ${rawEmails.length} friend(s)! Booking is pending until all pay.`);
  req.session.save(() => res.redirect(`/listings/${booking.listing._id}`));
};

/**
 * GET /split/pay/:token – friend opens their payment link
 */
const showSplitPayPage = async (req, res) => {
  const { token } = req.params;
  const split = await SplitBooking.findOne({
    "paymentToken": token,
  }).populate({ path: "booking", populate: { path: "listing" } });

  if (!split) {
    req.flash("error", "Invalid or expired payment link.");
    return req.session.save(() => res.redirect("/"));
  }

  // Check if booking is cancelled
  if (split.booking.status === "cancelled") {
    req.flash("error", "This booking was cancelled by the host or initiator. Payment link is no longer valid.");
    return req.session.save(() => res.redirect("/"));
  }

  if (split.allPaid || split.paidShares >= split.splitWays) {
    req.flash("success", "This booking is already fully paid!");
    return req.session.save(() => res.redirect("/"));
  }

  let walletBalance = 0;
  if (req.user) {
    const Wallet = require("../models/wallet.js");
    const wallet = await Wallet.findOne({ user: req.user._id });
    walletBalance = wallet ? wallet.balance : 0;
  }

  // ⏰ Calculate Time Remaining for Last-Minute Bookings
  let minutesRemaining = null;
  const checkInThreshold = new Date(Date.now() + 2 * 60 * 60 * 1000);
  if (split.booking.checkIn < checkInThreshold) {
    const expiryTime = new Date(split.booking.createdAt.getTime() + 60 * 60 * 1000);
    minutesRemaining = Math.max(0, Math.ceil((expiryTime - Date.now()) / (60 * 1000)));
  }

  res.render("split/pay.ejs", { split, walletBalance, minutesRemaining });
};

/**
 * POST /split/pay/:token/confirm – mark participant as paid
 */
const confirmSplitPayment = async (req, res) => {
  const { token } = req.params;
  const split = await SplitBooking.findOne({ "paymentToken": token })
    .populate({ path: "booking", populate: { path: "listing" } });

  if (!split) {
    return res.status(404).json({ error: "Invalid token" });
  }

  if (split.booking.status === "cancelled") {
    req.flash("error", "This booking has been cancelled. Payment cannot be processed.");
    return req.session.save(() => res.redirect("/"));
  }

  if (split.allPaid || split.paidShares >= split.splitWays) {
    req.flash("error", "This booking is already fully paid.");
    return req.session.save(() => res.redirect("/"));
  }

  const friendEmail = req.body.email;
  const coinsUsed = parseInt(req.body.coinsUsed) || 0;

  if (friendEmail && !split.friendEmails.includes(friendEmail)) {
    split.friendEmails.push(friendEmail);
  }

  // 🪙 Debit Wallet Coins if used by the friend
  if (coinsUsed > 0 && req.user) {
    try {
      const Wallet = require("../models/wallet.js");
      const wallet = await Wallet.findOne({ user: req.user._id });
      if (wallet && wallet.balance >= coinsUsed) {
        await Wallet.debit(
          req.user._id,
          coinsUsed,
          `Used for split payment share at ${split.booking.listing.title}`,
          split.booking._id
        );
      }
    } catch (walletErr) {
      console.error("Split Debit Wallet Error:", walletErr.message);
    }
  }

  split.paidShares += 1;

  // Check if all paid
  if (split.paidShares >= split.splitWays) {
    split.allPaid = true;
  }
  await split.save();

  const localTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
    port: process.env.SMTP_PORT == "465" ? 2525 : parseInt(process.env.SMTP_PORT) || 2525,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  // 🏎️ Non-blocking Notifications & Emails
  const processPostPayment = async () => {
    try {
      if (split.allPaid) {
        const booking = await Booking.findById(split.booking._id).populate("listing");
        booking.status = "confirmed";
        await booking.save();

        // 🎁 Referral Bonus for Referrer
        try {
          const initiatorUser = await User.findById(split.initiator);
          const initiatorConfirmBookings = await Booking.countDocuments({ user: split.initiator, status: "confirmed" });
          if (initiatorConfirmBookings === 1 && initiatorUser.referredBy) {
            const referrer = await User.findById(initiatorUser.referredBy);
            if (referrer) {
              await Wallet.credit(referrer._id, 50, `Referral reward – friend ${initiatorUser.username} made their first booking (Split)!`, booking._id);
              await Notification.create({
                user: referrer._id,
                message: `Congratulations! You earned 50 coins because your friend ${initiatorUser.username} completed their first booking! 🎁`,
                type: "success"
              });
            }
          }
        } catch (refErr) {
          console.error("Split Referral Bonus Error:", refErr.message);
        }

        const initiator = await User.findById(split.initiator);
        const successMessage = `Your split booking for ${booking.listing.title} is now fully paid and CONFIRMED! 🎉`;

        if (initiator) {
          Notification.create({ user: initiator._id, message: successMessage, type: "success" }).catch(e => { });

          if (initiator.email) {
            const subject = "Booking Confirmed! (Split Payment Complete)";
            const text = `Great news!\n\nThe remaining share (₹${split.amountPerPerson}) for your booking at ${booking.listing.title} has been paid by ${friendEmail || 'a friend'}. Your booking is now fully CONFIRMED.\n\nEnjoy your trip!`;
            localTransporter.sendMail({
              from: `"Wanderlust Support" <${process.env.CONTACT_EMAIL_RECEIVER || process.env.SMTP_USER}>`,
              to: initiator.email,
              subject, text
            }).catch(e => { });
          }
        }

        if (split.friendEmails && split.friendEmails.length > 0) {
          const subject = "Booking Confirmed! (Split Payment Complete)";
          const text = `Great news!\n\nThe remaining share (₹${split.amountPerPerson}) for your booking at ${split.booking.listing.title} has been paid. Your booking is now fully CONFIRMED.`;
          for (const fEmail of split.friendEmails) {
            localTransporter.sendMail({
              from: `"Wanderlust Support" <${process.env.CONTACT_EMAIL_RECEIVER || process.env.SMTP_USER}>`,
              to: fEmail,
              subject, text
            }).catch(e => { });
          }
        }
      } else {
        const initiator = await User.findById(split.initiator);
        if (initiator) {
          const msg = `${friendEmail || 'Someone'} just paid a share (₹${split.amountPerPerson}) for your booking at ${split.booking.listing.title}! (${split.paidShares}/${split.splitWays} paid)`;
          Notification.create({ user: initiator._id, message: msg, type: "success" }).catch(e => { });

          if (initiator.email) {
            localTransporter.sendMail({
              from: `"Wanderlust Support" <${process.env.CONTACT_EMAIL_RECEIVER || process.env.SMTP_USER}>`,
              to: initiator.email,
              subject: "Update: Share Paid for your Booking!",
              text: `Good news!\n\n${msg}\n\nYour booking will be fully confirmed once all shares are paid.`
            }).catch(e => { });
          }
        }
      }

      if (friendEmail) {
        // 🪙 Credit Wallet Coins to the friend if they are a registered user
        try {
          const friendUser = await User.findOne({ email: friendEmail });
          if (friendUser) {
            const Wallet = require("../models/wallet.js");
            const coinsToEarn = Math.floor(split.amountPerPerson / 100);
            if (coinsToEarn > 0) {
              await Wallet.credit(
                friendUser._id,
                coinsToEarn,
                `Earned for paying your share in booking at ${split.booking.listing.title}`,
                split.booking._id
              );

              // Also notify them internally if they are logged in
              Notification.create({
                user: friendUser._id,
                message: `You earned ${coinsToEarn} coins for your payment of ₹${split.amountPerPerson}!`,
                type: "success"
              }).catch(() => { });
            }
          }
        } catch (walletErr) {
          console.error("Split Friend Wallet Error:", walletErr.message);
        }

        let text = `Hi there,\n\nYour payment of ₹${split.amountPerPerson.toLocaleString("en-IN")} for the group booking at ${split.booking.listing.title} was successful.`;
        if (coinsUsed > 0) {
          text += `\n(Wallet Coins Redeemed: -₹${coinsUsed.toLocaleString("en-IN")})`;
        }
        text += `\n\nThank you for using Wanderlust!`;

        localTransporter.sendMail({
          from: `"Wanderlust Support" <${process.env.CONTACT_EMAIL_RECEIVER || process.env.SMTP_USER}>`,
          to: friendEmail,
          subject: "Payment Successful - Wanderlust",
          text
        }).catch(e => { });
      }
    } catch (err) {
      console.error("Background split processing error:", err);
    }
  };

  // Run cleanup/notifications in background
  processPostPayment();

  // Ensure flash is saved before redirecting
  const successMsg = split.allPaid ? "Payment complete! Booking is confirmed! 🎉" : "Your payment share has been recorded! 🎉";
  req.flash("success", successMsg);
  
  req.session.save(() => {
    res.redirect(`/listings/${split.booking.listing._id}`);
  });
};

module.exports = { createSplitBooking, showSplitPayPage, confirmSplitPayment };
