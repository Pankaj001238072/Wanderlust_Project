const {
  reusableIntentStatuses,
  normalizePendingIntentEntry,
  isPendingIntentExpired,
} = require("./common");

const resolveDraftPaymentIntent = async ({
  stripe,
  req,
  draftKey,
  totalPrice,
}) => {
  if (!req.session.pendingPaymentIntents) {
    req.session.pendingPaymentIntents = {};
  }

  let paymentIntent;
  const existingPendingEntry = normalizePendingIntentEntry(
    req.session.pendingPaymentIntents[draftKey],
  );

  if (existingPendingEntry) {
    req.session.pendingPaymentIntents[draftKey] =
      existingPendingEntry;
  }

  if (
    existingPendingEntry &&
    !isPendingIntentExpired(existingPendingEntry)
  ) {
    try {
      const existingIntent =
        await stripe.paymentIntents.retrieve(
          existingPendingEntry.id,
        );
      if (
        existingIntent &&
        reusableIntentStatuses.has(existingIntent.status) &&
        existingIntent.amount ===
          Math.round(totalPrice * 100)
      ) {
        paymentIntent = existingIntent;
      }
    } catch (err) {
      req.session.pendingPaymentIntents[draftKey] = null;
    }
  } else if (existingPendingEntry) {
    delete req.session.pendingPaymentIntents[draftKey];
  }

  return paymentIntent;
};

module.exports = {
  resolveDraftPaymentIntent,
};
