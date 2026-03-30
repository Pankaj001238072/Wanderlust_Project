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

const startCheckout = async (req, res) => {
  if (!stripe || !stripePublishableKey) {
    req.flash(
      "error",
      "Payment gateway is not configured. Add STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY in .env",
    );
    return res.redirect(`/listings/${req.params.id}`);
  }

  const { id } = req.params;
  const listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Listing not found.");
    return res.redirect("/listings");
  }

  const { checkIn, checkOut } = req.body.booking;
  const { people, kids, infants, pets } = parseGuestCounts(
    req.body.booking,
  );

  if (
    !areGuestCountsValid({ people, kids, infants, pets })
  ) {
    req.flash(
      "error",
      "Please enter valid people, kids, infants and pets counts within allowed limits.",
    );
    return res.redirect(`/listings/${id}`);
  }

  const limits = getListingLimits(listing);
  const listingLimitError = getListingLimitError(
    { people, kids, infants, pets },
    limits,
  );
  if (listingLimitError) {
    req.flash("error", listingLimitError);
    return res.redirect(`/listings/${id}`);
  }

  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);
  if (checkOutDate <= checkInDate) {
    req.flash(
      "error",
      "Check-out date must be after check-in date.",
    );
    return res.redirect(`/listings/${id}`);
  }

  const overlappingBooking = await Booking.findOne({
    listing: id,
    status: "confirmed",
    checkIn: { $lt: checkOutDate },
    checkOut: { $gt: checkInDate },
  });

  if (overlappingBooking) {
    req.flash(
      "error",
      "Selected dates are not available for this listing.",
    );
    return res.redirect(`/listings/${id}`);
  }

  const numberOfNights = Math.ceil(
    (checkOutDate - checkInDate) / MS_PER_DAY,
  );
  if (numberOfNights <= 0) {
    req.flash(
      "error",
      "Please select valid booking dates.",
    );
    return res.redirect(`/listings/${id}`);
  }

  const extraGuestFeePerNight =
    Number(listing.extraGuestFeePerNight) || 0;
  const extraGuestCount = Math.max(
    0,
    people - limits.baseGuests,
  );
  const extraGuestCharge =
    extraGuestCount *
    extraGuestFeePerNight *
    numberOfNights;
  const subtotal =
    numberOfNights * listing.price + extraGuestCharge;
  const totalPrice = Math.round(subtotal * (1 + GST_RATE));

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
    subtotal: String(Math.round(subtotal)),
    gstRate: String(GST_RATE),
    totalPrice: String(totalPrice),
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

  return res.render("bookings/checkout.ejs", {
    listing,
    checkInDate,
    checkOutDate,
    numberOfNights,
    subtotal,
    extraGuestCount,
    extraGuestCharge,
    extraGuestFeePerNight,
    totalPrice,
    people,
    kids,
    infants,
    pets,
    paymentIntentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret,
    publishableKey: stripePublishableKey,
  });
};

module.exports = startCheckout;
