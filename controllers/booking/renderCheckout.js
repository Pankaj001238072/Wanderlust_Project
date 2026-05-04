const {
  Listing,
  stripe,
  stripePublishableKey,
  MS_PER_DAY,
  GST_RATE,
  reusableIntentStatuses,
  normalizePendingIntentEntry,
  isPendingIntentExpired,
} = require("./common");

const renderCheckout = async (req, res) => {
  if (!stripe || !stripePublishableKey) {
    req.flash(
      "error",
      "Payment gateway is not configured. Add STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY in .env",
    );
    return res.redirect(`/listings/${req.params.id}`);
  }

  const listingId = String(req.params.id);
  const userId = String(req.user._id);

  // ── NEGOTIATED BOOKING HANDLER ─────────────────────────────────────────────
  if (req.query.negotiated === "1" && req.query.offerId && req.query.offerToken) {
    const { offerId, offerToken } = req.query;
    const Chat = require("../../models/chat.js");
    const crypto = require("crypto");

    try {
      const chat = await Chat.findOne({ 
        listing: listingId, 
        guest: userId,
        "messages.offerDetails.offerId": offerId 
      }).lean();

      if (!chat) {
        req.flash("error", "Negotiation session not found.");
        return req.session.save(() => res.redirect("/listings"));
      }

      const msg = chat.messages.find(m => m.offerDetails && m.offerDetails.offerId === offerId);
      if (!msg || msg.offerDetails.status !== 'accepted') {
        req.flash("error", "Offer not found or not yet accepted.");
        return req.session.save(() => res.redirect("/listings"));
      }

      // Verify Token
      const expectedToken = crypto.createHmac("sha256", process.env.SESSION_SECRET || "secret")
        .update(`${offerId}${userId}${msg.offerDetails.price}`).digest("hex").slice(0, 16);

      if (offerToken !== expectedToken) {
        req.flash("error", "Invalid or expired offer link.");
        return req.session.save(() => res.redirect("/listings"));
      }

      // We have a valid accepted offer. Initialize Stripe Session.
      const listing = await Listing.findById(listingId);
      const checkInDate = new Date(msg.offerDetails.checkIn);
      const checkOutDate = new Date(msg.offerDetails.checkOut);
      const numberOfNights = Math.ceil((checkOutDate - checkInDate) / MS_PER_DAY);

      // 📊 Add Dynamic Badges even for Negotiated flow
      const { computeDynamicPrice } = require("../../helpers/dynamicPricing.js");
      const { breakdown: pricingBreakdown } = computeDynamicPrice(listing.price, checkInDate, true);
      
      // Add a special badge for Negotiated Price
       pricingBreakdown.push({ label: "Negotiated Offer ✅", change: "Special Rate", color: "info" });
      
      const negotiatedTotal = msg.offerDetails.price; // This is now the Total Inclusive Price
      const originalNightly = listing.price;
      const originalSubtotal = originalNightly * numberOfNights;
      const originalTotalWithTax = Math.round(originalSubtotal * (1 + GST_RATE));

      // Backward calculate subtotal for breakdown
      const negotiatedSubtotal = Math.round(negotiatedTotal / (1 + GST_RATE));
      const offerDiscount = Math.max(0, originalSubtotal - negotiatedSubtotal);
      const offerPercent = originalSubtotal > 0 ? Math.round((offerDiscount / originalSubtotal) * 100) : 0;
      
      const totalPrice = negotiatedTotal; // The user pays exactly what they offered

      const metadata = {
        listingId,
        userId,
        checkIn: checkInDate.toISOString(),
        checkOut: checkOutDate.toISOString(),
        people: "1", 
        kids: "0",
        infants: "0",
        pets: "0",
        subtotal: String(Math.round(originalSubtotal)),
        offerDiscount: String(Math.round(offerDiscount)),
        offerPercent: String(offerPercent),
        totalPrice: String(totalPrice),
        pricingBreakdown: JSON.stringify(pricingBreakdown || []),
        negotiated: "true",
        offerId
      };

      const { getDraftPaymentKey } = require("./common");
      const negotiatedDraftKey = getDraftPaymentKey({
        userId, listingId, checkIn: metadata.checkIn, checkOut: metadata.checkOut,
        people: "1", kids: "0", infants: "0", pets: "0"
      });

      if (!req.session.pendingPaymentIntents) req.session.pendingPaymentIntents = {};

      // Clear any existing non-negotiated sessions for this listing to avoid picking up old prices
      for (const key of Object.keys(req.session.pendingPaymentIntents)) {
        if (key.startsWith(`${userId}|${listingId}|`) && key !== negotiatedDraftKey) {
          delete req.session.pendingPaymentIntents[key];
        }
      }

      if (req.session.pendingPaymentIntents[negotiatedDraftKey]) {
        // Verify if the existing session matches the current offerId
        try {
          const existingIntent = await stripe.paymentIntents.retrieve(req.session.pendingPaymentIntents[negotiatedDraftKey].id);
          if (existingIntent.metadata.offerId !== offerId) {
            delete req.session.pendingPaymentIntents[negotiatedDraftKey];
          }
        } catch (e) {
          delete req.session.pendingPaymentIntents[negotiatedDraftKey];
        }
      }

      if (!req.session.pendingPaymentIntents[negotiatedDraftKey]) {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(totalPrice * 100),
          currency: "inr",
          automatic_payment_methods: { enabled: true },
          metadata
        });
        req.session.pendingPaymentIntents[negotiatedDraftKey] = {
          id: paymentIntent.id,
          createdAt: Date.now()
        };
      }
      // Continue to standard render logic which will now find this negotiatedDraftKey

    } catch (err) {
      console.error("[NegotiatedBooking] Error:", err);
      req.flash("error", "Could not initialize negotiated payment.");
      return req.session.save(() => res.redirect(`/listings/${listingId}`));
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  const pendingMap = req.session.pendingPaymentIntents || {};
  const draftKey = Object.keys(pendingMap).find((key) =>
    key.startsWith(`${userId}|${listingId}|`),
  );

  if (!draftKey) {
    req.flash("error", "No pending payment session found. Please try booking through the listing page.");
    return req.session.save(() => res.redirect("/listings"));
  }

  const pendingEntry = normalizePendingIntentEntry(
    pendingMap[draftKey],
  );
  if (!pendingEntry) {
    delete pendingMap[draftKey];
    req.flash("error", "No pending payment session found.");
    return req.session.save(() => res.redirect("/listings"));
  }

  pendingMap[draftKey] = pendingEntry;
  if (isPendingIntentExpired(pendingEntry)) {
    delete pendingMap[draftKey];
    req.flash(
      "error",
      "Payment session timed out. Please start again.",
    );
    return res.redirect(`/listings/${listingId}`);
  }

  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.retrieve(
      pendingEntry.id,
    );
  } catch (err) {
    delete pendingMap[draftKey];
    req.flash(
      "error",
      "Payment session expired. Please try again.",
    );
    return res.redirect(`/listings/${listingId}`);
  }

  if (
    !paymentIntent ||
    !reusableIntentStatuses.has(paymentIntent.status) ||
    !paymentIntent.metadata ||
    paymentIntent.metadata.userId !== userId ||
    paymentIntent.metadata.listingId !== listingId
  ) {
    delete pendingMap[draftKey];
    req.flash(
      "error",
      "Payment session expired. Please try again.",
    );
    return res.redirect(`/listings/${listingId}`);
  }

  const listing = await Listing.findById(listingId);
  if (!listing) {
    delete pendingMap[draftKey];
    req.flash("error", "Listing not found.");
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
    return res.redirect(`/listings/${listing._id}`);
  }

  const totalPrice = Number(
    paymentIntent.metadata.totalPrice,
  );
  const subtotal = Number(paymentIntent.metadata.subtotal);
  const extraGuestCount = Number.parseInt(
    paymentIntent.metadata.extraGuestCount,
    10,
  );
  const extraGuestCharge = Number(
    paymentIntent.metadata.extraGuestCharge,
  );
  const extraGuestFeePerNight = Number(
    paymentIntent.metadata.extraGuestFeePerNight,
  );
  const numberOfNights = Math.ceil(
    (checkOutDate - checkInDate) / MS_PER_DAY,
  );
  
  const offerDiscount = Number(paymentIntent.metadata.offerDiscount) || 0;
  const offerPercent = Number(paymentIntent.metadata.offerPercent) || 0;

  const Wallet = require("../../models/wallet.js");
  const wallet = await Wallet.findOne({ user: userId });
  const walletBalance = wallet ? wallet.balance : 0;

  let pricingBreakdown = [];
  try {
    pricingBreakdown = JSON.parse(paymentIntent.metadata.pricingBreakdown || "[]");
  } catch(e) {}

  return res.render("bookings/checkout.ejs", {
    listing,
    checkInDate,
    checkOutDate,
    numberOfNights,
    subtotal,
    extraGuestCount: Number.isFinite(extraGuestCount)
      ? extraGuestCount
      : 0,
    extraGuestCharge: Number.isFinite(extraGuestCharge)
      ? extraGuestCharge
      : 0,
    extraGuestFeePerNight: Number.isFinite(
      extraGuestFeePerNight,
    )
      ? extraGuestFeePerNight
      : 0,
    offerDiscount,
    offerPercent,
    totalPrice,
    people,
    kids,
    infants,
    pets,
    pricingBreakdown,
    paymentIntentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret,
    publishableKey: stripePublishableKey,
    walletBalance,
  });
};

module.exports = renderCheckout;
