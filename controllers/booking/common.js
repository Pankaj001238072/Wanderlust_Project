const Booking = require("../../models/booking.js");
const Listing = require("../../models/listing.js");

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripePublishableKey =
  process.env.STRIPE_PUBLISHABLE_KEY;
const stripe = stripeSecretKey
  ? require("stripe")(stripeSecretKey)
  : null;

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const paymentSessionTtlMin = Number.parseInt(
  process.env.PAYMENT_SESSION_TTL_MIN,
  10,
);
const PAYMENT_SESSION_TTL_MS =
  (Number.isFinite(paymentSessionTtlMin) &&
  paymentSessionTtlMin > 0
    ? paymentSessionTtlMin
    : 10) *
  60 *
  1000;

const reusableIntentStatuses = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
]);

const GST_RATE = 0.18;
const CANCELLATION_GRACE_MINUTES = 30;
const CANCELLATION_CUTOFF_HOURS = 2;
const MAX_PEOPLE_LIMIT = 20;
const MAX_KIDS_LIMIT = 10;
const MAX_INFANTS_LIMIT = 5;
const MAX_PETS_LIMIT = 10;

const canCancelBooking = (booking, now = new Date()) => {
  if (!booking || booking.status !== "confirmed")
    return false;

  const bookingCreatedAt = new Date(booking.createdAt);
  const checkInDate = new Date(booking.checkIn);
  if (
    Number.isNaN(bookingCreatedAt.getTime()) ||
    Number.isNaN(checkInDate.getTime())
  ) {
    return false;
  }

  const graceWindowEndsAt = new Date(
    bookingCreatedAt.getTime() +
      CANCELLATION_GRACE_MINUTES * 60 * 1000,
  );
  const checkInCutoffAt = new Date(
    checkInDate.getTime() -
      CANCELLATION_CUTOFF_HOURS * 60 * 60 * 1000,
  );

  return now <= graceWindowEndsAt || now <= checkInCutoffAt;
};

const getDraftPaymentKey = ({
  userId,
  listingId,
  checkIn,
  checkOut,
  people,
  kids,
  infants,
  pets,
}) =>
  `${userId}|${listingId}|${checkIn}|${checkOut}|${people}|${kids}|${infants}|${pets}`;

const normalizePendingIntentEntry = (entry) => {
  if (!entry) return null;
  if (typeof entry === "string") {
    return { id: entry, createdAt: Date.now() };
  }
  if (entry.id) {
    return {
      id: entry.id,
      createdAt: entry.createdAt || Date.now(),
    };
  }
  return null;
};

const isPendingIntentExpired = (entry) => {
  if (!entry?.createdAt) return true;
  return (
    Date.now() - entry.createdAt > PAYMENT_SESSION_TTL_MS
  );
};

const clearPendingIntentFromSession = (
  session,
  paymentIntentId,
) => {
  if (!session?.pendingPaymentIntents || !paymentIntentId)
    return;

  for (const key of Object.keys(
    session.pendingPaymentIntents,
  )) {
    const entry = normalizePendingIntentEntry(
      session.pendingPaymentIntents[key],
    );
    if (entry?.id === paymentIntentId) {
      delete session.pendingPaymentIntents[key];
    }
  }
};

module.exports = {
  Booking,
  Listing,
  stripe,
  stripePublishableKey,
  MS_PER_DAY,
  reusableIntentStatuses,
  GST_RATE,
  MAX_PEOPLE_LIMIT,
  MAX_KIDS_LIMIT,
  MAX_INFANTS_LIMIT,
  MAX_PETS_LIMIT,
  canCancelBooking,
  getDraftPaymentKey,
  normalizePendingIntentEntry,
  isPendingIntentExpired,
  clearPendingIntentFromSession,
};
