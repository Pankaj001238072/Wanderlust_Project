const {
  Listing,
  stripe,
  stripePublishableKey,
  MS_PER_DAY,
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

  const pendingMap =
    req.session.pendingPaymentIntents || {};
  const draftKey = Object.keys(pendingMap).find((key) =>
    key.startsWith(`${userId}|${listingId}|`),
  );

  if (!draftKey) {
    req.flash("error", "No pending payment session found.");
    return res.redirect(`/listings/${listingId}`);
  }

  const pendingEntry = normalizePendingIntentEntry(
    pendingMap[draftKey],
  );
  if (!pendingEntry) {
    delete pendingMap[draftKey];
    req.flash("error", "No pending payment session found.");
    return res.redirect(`/listings/${listingId}`);
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

module.exports = renderCheckout;
