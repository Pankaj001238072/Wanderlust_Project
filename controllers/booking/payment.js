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
const Wallet = require("../../models/wallet.js");

const paymentSuccess = async (req, res) => {
  if (!stripe) {
    req.flash(
      "error",
      "Payment gateway is not configured. Add STRIPE_SECRET_KEY in .env",
    );
    return req.session.save(() => res.redirect("/listings"));
  }

  const paymentIntentId = req.query.payment_intent;
  if (!paymentIntentId) {
    req.flash("error", "Missing payment session details.");
    return req.session.save(() => res.redirect("/listings"));
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
    return req.session.save(() => res.redirect(
      listingId ? `/listings/${listingId}` : "/listings",
    ));
  }

  if (
    paymentIntent.metadata.userId !== String(req.user._id)
  ) {
    req.flash("error", "Unauthorized payment session.");
    return req.session.save(() => res.redirect("/listings"));
  }

  const existingBooking = await Booking.findOne({
    stripePaymentIntentId: paymentIntent.id,
  });
  if (existingBooking) {
    req.flash("success", "Booking already confirmed.");
    return req.session.save(() => res.redirect("/bookings/my"));
  }

  const listing = await Listing.findById(
    paymentIntent.metadata.listingId,
  );
  if (!listing) {
    req.flash(
      "error",
      "Listing not found for this payment.",
    );
    return req.session.save(() => res.redirect("/listings"));
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
    return req.session.save(() => res.redirect(`/listings/${listing._id}`));
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
    return req.session.save(() => res.redirect(`/listings/${listing._id}`));
  }

  const overlappingBooking = await Booking.findOne({
    listing: listing._id,
    $or: [
      { status: "confirmed" },
      { 
        status: "pending_split", 
        createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) }, // 60-min block window
      }
    ],
    checkIn: { $lt: checkOutDate },
    checkOut: { $gt: checkInDate },
  });

  if (overlappingBooking) {
    req.flash(
      "error",
      "Payment received but selected dates are no longer available. Please contact support.",
    );
    return req.session.save(() => res.redirect(`/listings/${listing._id}`));
  }

  const isSplitMode = req.query.mode === "split";
  const originalTotalPrice = Number(paymentIntent.metadata.totalPrice);
  const coinsUsed = parseInt(req.query.coinsUsed) || 0;
  const totalPrice = originalTotalPrice - coinsUsed;
  let selectedAddOns = [];
  let pricingBreakdown = [];
  try {
    selectedAddOns = JSON.parse(paymentIntent.metadata.selectedAddOns || "[]");
    pricingBreakdown = JSON.parse(paymentIntent.metadata.pricingBreakdown || "[]");
  } catch (_) { }

  const addOnsTotal = selectedAddOns.reduce((sum, addon) => sum + (addon.price || 0), 0);

  const booking = new Booking({
    listing: listing._id,
    user: req.user._id,
    checkIn: checkInDate,
    checkOut: checkOutDate,
    people,
    kids,
    infants,
    pets,
    totalPrice,
    paymentStatus: "paid",
    stripePaymentIntentId: paymentIntent.id,
    status: isSplitMode ? "pending_split" : "confirmed",
    pricingBreakdown,
    addOns: selectedAddOns,
    addOnsTotal,
    negotiatedOfferId: paymentIntent.metadata.offerId || null,
  });

  await booking.save();

  // 💸 Debit Wallet Coins if used
  if (coinsUsed > 0) {
    try {
      await Wallet.debit(req.user._id, coinsUsed, `Redeemed for booking ${listing.title}`, booking._id);
    } catch (err) {
      console.error("Wallet Debit Error:", err);
    }
  }

  // 👥 Handle Split Booking Logic (Link generation + Email)
  let splitToken = "";
  let splitWays = 1;
  if (isSplitMode) {
    const SplitBooking = require("../../models/splitBooking.js");
    const crypto = require("crypto");

    splitWays = parseInt(req.query.splitWays) || 2;
    const amountPerPerson = Math.ceil(totalPrice / splitWays);
    splitToken = crypto.randomBytes(20).toString("hex");

    const split = new SplitBooking({
      booking: booking._id,
      initiator: req.user._id,
      totalAmount: totalPrice,
      splitWays: splitWays,
      amountPerPerson: amountPerPerson,
      paidShares: 1,
      paymentToken: splitToken,
      allPaid: false
    });
    await split.save();

    booking.splitBooking = split._id;
    await booking.save();
  }
  clearPendingIntentFromSession(
    req.session,
    paymentIntent.id,
  );

  // 🎁 Credit Wallet Coins (1 coin per ₹100 of what was ACTUALLY paid)
  try {
    const paidAmount = isSplitMode ? Math.ceil(totalPrice / splitWays) : totalPrice;
    const coinsEarned = Math.floor(paidAmount / 100);
    if (coinsEarned > 0) {
      await Wallet.credit(
        req.user._id,
        coinsEarned,
        `Earned for booking ${listing.title}`,
        booking._id,
      );
    }
  } catch (walletErr) {
    console.error("Wallet credit error:", walletErr.message);
  }

  // 🎁 Referral Bonus for Referrer (Only for full payments; split payments handled in split controller)
  if (!isSplitMode) {
    try {
      const userConfirmBookings = await Booking.countDocuments({ user: req.user._id, status: "confirmed" });
      if (userConfirmBookings === 1 && req.user.referredBy) {
        const referrer = await User.findById(req.user.referredBy);
        if (referrer) {
          await Wallet.credit(referrer._id, 50, `Referral reward – friend ${req.user.username} made their first booking!`, booking._id);
          await Notification.create({
            user: referrer._id,
            message: `Congratulations! You earned 50 coins because your friend ${req.user.username} completed their first booking! 🎁`,
            type: "success"
          });
        }
      }
    } catch (refErr) {
      console.error("Referral Bonus Error:", refErr.message);
    }
  }

  // Send confirmation email to user
  try {
    const user = await User.findById(req.user._id);
    const userEmail = user?.email || null;
    const paidAmount = isSplitMode ? Math.ceil(totalPrice / splitWays) : totalPrice;

    if (userEmail) {
      let subject = "Booking Confirmed & Payment Successful";

      // Calculate breakdown for email
      const isNegotiated = paymentIntent.metadata.negotiated === "true";
      const offerDiscount = Number(paymentIntent.metadata.offerDiscount) || 0;
      const offerPercent = Number(paymentIntent.metadata.offerPercent) || 0;
      
      const extraGuestCharge = Number(paymentIntent.metadata.extraGuestCharge) || 0;
      const extraGuestDetail = extraGuestCharge > 0 
        ? `\n- Extra Guest Charge: ₹${extraGuestCharge.toLocaleString("en-IN")}`
        : "";
        
      let roomTotal = (Number(paymentIntent.metadata.subtotal) || 0) - extraGuestCharge;
      let gst = Math.round((roomTotal + extraGuestCharge) * 0.18);
      let offerDetailText = "";

      if (isNegotiated) {
        offerDetailText = `\n- Negotiated Special Offer: -₹${offerDiscount.toLocaleString("en-IN")}`;
        gst = Math.round((totalPrice / 1.18) * 0.18);
      } else if (offerDiscount > 0) {
        offerDetailText = `\n- Special Offer Discount (${offerPercent}%): -₹${offerDiscount.toLocaleString("en-IN")}`;
        gst = Math.round((((roomTotal + extraGuestCharge) - offerDiscount) * 1.18) - ((roomTotal + extraGuestCharge) - offerDiscount));
      }

      const dynamicPricingDetail = pricingBreakdown.length > 0
        ? `\n- Pricing Factors:\n  ${pricingBreakdown.map(p => {
            let factorAmountText = "";
            if (p.change.includes("%")) {
              const percent = parseFloat(p.change) / 100;
              const amount = Math.round(roomTotal * percent);
              factorAmountText = ` (${amount >= 0 ? "+" : ""}₹${Math.abs(amount).toLocaleString("en-IN")})`;
            }
            return `• ${p.label}: ${p.change}${factorAmountText}`;
          }).join("\n  ")}`
        : "";

      const addonsDetail = selectedAddOns.length > 0
        ? `\n- Additional Services:\n  ${selectedAddOns.map(a => `• ${a.name} (+₹${a.price.toLocaleString("en-IN")})`).join("\n  ")}`
        : "";

      const coinsDetailText = coinsUsed > 0
        ? `\n- Wallet Coins Redeemed: -₹${coinsUsed.toLocaleString("en-IN")}`
        : "";

      let billingSummary = `\n--- BILLING SUMMARY ---\n- Listing: ${listing.title}\n- Room Subtotal: ₹${roomTotal.toLocaleString("en-IN")}${extraGuestDetail}${dynamicPricingDetail}${offerDetailText}\n- Taxes (18% GST): ₹${gst.toLocaleString("en-IN")}${addonsDetail}${coinsDetailText}\n- Total Booking Amount: ₹${totalPrice.toLocaleString("en-IN")}\n- Amount Paid (${isSplitMode ? 'Your Share' : 'Total'}): ₹${paidAmount.toLocaleString("en-IN")}${isSplitMode ? ' / person' : ''}\n\n--- BOOKING DETAILS ---\n- Check-in: ${checkInDate.toDateString()} (After 1:00 PM)\n- Check-out: ${checkOutDate.toDateString()} (Before 11:00 AM)\n- Guests: ${people} Adults, ${kids} Kids\n\nThank you for choosing Wanderlust!`;

      let text = `Dear ${user.username || "User"},\n\nYour booking has been confirmed and payment was successful!\n${billingSummary}`;

      const addonNames = selectedAddOns.map(a => typeof a === 'string' ? a : a.name);
      let notificationMsg = `Your booking for ${listing.title} is confirmed. Amount Paid: ₹${paidAmount}.${addonNames.length > 0 ? " (Includes Services: " + addonNames.join(", ") + ")" : ""}${isNegotiated ? " (Negotiated Deal ✅)" : ""}`;

      if (isSplitMode) {
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        subject = "Action Required: Share your booking split link!";
        let actionRequired = `--- ACTION REQUIRED ---\nTo confirm the booking, please share this link with the remaining ${splitWays - 1} friends to pay their shares:\n${baseUrl}/split/pay/${splitToken}`;
        
        // Add urgency warning for same-day bookings in email
        const checkInThreshold = new Date(Date.now() + 2 * 60 * 60 * 1000);
        if (checkInDate < checkInThreshold) {
          actionRequired = `⚠️ URGENT: SAME-DAY STAY DETECTED ⚠️\nPlease complete all pending payments NOW. Otherwise, your booking will be CANCELLED and EXPIRED within 60 minutes to release the dates for other guests.\n\n${actionRequired}`;
        }

        text = `Dear ${user.username || "User"},\n\nYou've paid your share (₹${paidAmount}) for your booking at ${listing.title}.\n${billingSummary}\n\n${actionRequired}\n\nYour booking status is currently: Pending Split. It will be confirmed once the full amount is paid.`;
        notificationMsg = `You've paid your share (₹${paidAmount}) for ${listing.title}. Share your link to complete the booking!`;
      }

      await Notification.create({
        user: req.user._id,
        message: notificationMsg,
        type: "success",
      });

      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
        port: process.env.SMTP_PORT == "465" ? 2525 : parseInt(process.env.SMTP_PORT) || 2525,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const mailOptions = {
        from: `"Wanderlust Support" <${process.env.CONTACT_EMAIL_RECEIVER || process.env.SMTP_USER}>`,
        to: userEmail,
        subject,
        text,
      };

      transporter.sendMail(mailOptions)
        .then(info => console.log("📧 Background Email Sent:", info.response))
        .catch(err => console.error("❌ Background Email Error:", err.message));
    }
  } catch (e) {
    console.error("Error sending payment success email/notification:", e);
  }

  if (isSplitMode) {
    req.flash(
      "success",
      "Your share paid successfully! Please share the link with your friends to confirm the booking.",
    );
    return req.session.save(() => {
      res.redirect(`/split/${booking._id}/split-details`);
    });
  } else {
    req.flash(
      "success",
      "Payment successful! Booking confirmed. A confirmation email has been sent.",
    );
    return req.session.save(() => {
      res.redirect("/bookings/my");
    });
  }
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
  req.session.save(() => res.redirect(`/listings/${req.params.id}`));
};

module.exports = {
  paymentSuccess,
  paymentCancel,
};
