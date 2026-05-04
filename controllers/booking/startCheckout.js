const {
  Booking,
  Listing,
  stripe,
  stripePublishableKey,
  MS_PER_DAY,
  GST_RATE,
  getDraftPaymentKey,
} = require("./common");
const {
  resolveDraftPaymentIntent,
} = require("./pendingIntent");
const {
  parseGuestCounts,
  areGuestCountsValid,
  getListingLimits,
  getListingLimitError,
} = require("./validateBookingInput");
const { computeDynamicPrice } = require("../../helpers/dynamicPricing.js");

const startCheckout = async (req, res) => {
  if (!stripe || !stripePublishableKey) {
    req.flash(
      "error",
      "Payment gateway is not configured. Add STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY in .env",
    );
    return req.session.save(() => res.redirect(`/listings/${req.params.id}`));
  }

  const { id } = req.params;
  const { checkIn, checkOut } = req.body.booking;
  const { people, kids, infants, pets } = parseGuestCounts(req.body.booking);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // 🚀 Fetch all required data in parallel
  const [listing, overlappingBooking, nearBooking, activeOffer, wallet] = await Promise.all([
    Listing.findById(id),
    Booking.findOne({
      listing: id,
      $or: [
        { status: "confirmed" },
        { 
          status: "pending_split", 
          createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) }, // 60-min block window
        }
      ],
      checkIn: { $lt: new Date(checkOut) },
      checkOut: { $gt: new Date(checkIn) },
    }),
    Booking.findOne({
      listing: id,
      status: "confirmed",
      checkIn: { $lte: new Date(Date.now() + 2 * 86400000) },
      checkOut: { $gte: new Date() },
    }),
    require("../../models/offer.js").findOne({
      listing: id,
      validTill: { $gte: todayStart }
    }),
    require("../../models/wallet.js").findOne({ user: req.user._id })
  ]);

  if (!listing) {
    req.flash("error", "Listing not found.");
    return req.session.save(() => res.redirect("/listings"));
  }

  if (!areGuestCountsValid({ people, kids, infants, pets })) {
    req.flash("error", "Please enter valid people, kids, infants and pets counts within allowed limits.");
    return req.session.save(() => res.redirect(`/listings/${id}`));
  }

  const limits = getListingLimits(listing);
  const listingLimitError = getListingLimitError({ people, kids, infants, pets }, limits);
  if (listingLimitError) {
    req.flash("error", listingLimitError);
    return req.session.save(() => res.redirect(`/listings/${id}`));
  }

  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);
  if (checkOutDate <= checkInDate) {
    req.flash("error", "Check-out date must be after check-in date.");
    return req.session.save(() => res.redirect(`/listings/${id}`));
  }

  if (overlappingBooking) {
    const reason = overlappingBooking.status === "pending_split" 
      ? "These dates are currently held for a pending group payment. Please try again later or choose other dates."
      : "Selected dates are not available for this listing.";
    req.flash("error", reason);
    return req.session.save(() => res.redirect(`/listings/${id}`));
  }

  const numberOfNights = Math.ceil((checkOutDate - checkInDate) / MS_PER_DAY);
  if (numberOfNights <= 0) {
    req.flash("error", "Please select valid booking dates.");
    return req.session.save(() => res.redirect(`/listings/${id}`));
  }

  const extraGuestFeePerNight = Number(listing.extraGuestFeePerNight) || 0;
  const extraGuestCount = Math.max(0, people - limits.baseGuests);
  const extraGuestCharge = extraGuestCount * extraGuestFeePerNight * numberOfNights;

  // 📊 Unified Dynamic Pricing (Additive)
  const isAvailableToday = !nearBooking;
  const offerPercent = (activeOffer && activeOffer.discount > 0) ? activeOffer.discount : 0;
  
  // Calculate price WITHOUT offer first for the subtotal line
  const { finalPrice: nightlyWithoutOffer, breakdown: pricingBreakdown } =
    computeDynamicPrice(listing.price, checkInDate, isAvailableToday, 0);

  // Calculate the actual discount amount based on the subtotal shown to user
  const offerDiscountPerNight = Math.round(nightlyWithoutOffer * (offerPercent / 100));
  const totalOfferDiscount = offerDiscountPerNight * numberOfNights;

  const dynamicSubtotal = (numberOfNights * nightlyWithoutOffer) + extraGuestCharge;
  const subtotalAfterDiscount = dynamicSubtotal - totalOfferDiscount;
  const totalPrice = Math.round(subtotalAfterDiscount * (1 + GST_RATE));

  const metadata = {
    listingId: String(listing._id),
    userId: String(req.user._id),
    checkIn: checkInDate.toISOString(),
    checkOut: checkOutDate.toISOString(),
    people: String(people),
    kids: String(kids),
    infants: String(infants),
    pets: String(pets),
    listingBaseGuests: String(limits.baseGuests),
    extraGuestFeePerNight: String(extraGuestFeePerNight),
    extraGuestCount: String(extraGuestCount),
    extraGuestCharge: String(Math.round(extraGuestCharge)),
    subtotal: String(Math.round(dynamicSubtotal)),
    offerDiscount: String(totalOfferDiscount),
    offerPercent: String(offerPercent),
    gstRate: String(GST_RATE),
    totalPrice: String(totalPrice),
    pricingBreakdown: JSON.stringify(pricingBreakdown || []),
  };

  const draftKey = getDraftPaymentKey({
    userId: metadata.userId,
    listingId: metadata.listingId,
    checkIn: metadata.checkIn,
    checkOut: metadata.checkOut,
    people: metadata.people,
    kids: metadata.kids,
    infants: metadata.infants,
    pets: metadata.pets,
  });

  let paymentIntent = await resolveDraftPaymentIntent({
    stripe,
    req,
    draftKey,
    totalPrice,
  });

  if (!paymentIntent) {
    paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalPrice * 100),
      currency: "inr",
      automatic_payment_methods: { enabled: true },
      metadata,
    });

    req.session.pendingPaymentIntents[draftKey] = {
      id: paymentIntent.id,
      createdAt: Date.now(),
    };
  }

  const walletBalance = wallet ? wallet.balance : 0;

  const isLastMinute = checkInDate < (new Date(Date.now() + 2 * 60 * 60 * 1000));

  return res.render("bookings/checkout.ejs", {
    listing,
    checkInDate,
    checkOutDate,
    numberOfNights,
    subtotal: dynamicSubtotal,
    extraGuestCount,
    extraGuestCharge,
    extraGuestFeePerNight,
    offerDiscount: totalOfferDiscount,
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
    isLastMinute,
  });
};

module.exports = startCheckout;
