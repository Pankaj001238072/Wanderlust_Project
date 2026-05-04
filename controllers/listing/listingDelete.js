const Listing = require("../../models/listing.js");
const { deleteImage } = require("../../helpers/cloudHelper");

const destroyListing = async (req, res) => {
  try {
    const { id } = req.params;
    const listing = await Listing.findById(id);

    if (!listing) {
      req.flash("error", "Listing not found.");
      return req.session.save(() => res.redirect("/listings"));
    }

    // 🚀 INSTANT REDIRECT - No more delay for the Host
    req.flash("success", "Listing Deleted!");
    req.session.save(() => res.redirect("/listings"));

    // 🏎️ ALL HEAVY PROCESSING IN PARALLEL BACKGROUND
    setImmediate(async () => {
      try {
        const Offer = require("../../models/offer");
        const { Booking, stripe } = require("../booking/common");
        const SplitBooking = require("../../models/splitBooking");
        const Notification = require("../../models/notification");
        const User = require("../../models/user");
        const Wallet = require("../../models/wallet");
        const nodemailer = require("nodemailer");

        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
          port: process.env.SMTP_PORT == "465" ? 2525 : parseInt(process.env.SMTP_PORT) || 2525,
          secure: false,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });

        const activeBookings = await Booking.find({ listing: id, status: { $in: ["confirmed", "pending_split"] } });

        // 1. Process all bookings simultaneously
        await Promise.allSettled(activeBookings.map(async (booking) => {
          try {
            // A. Parallel Refund (Stripe + Wallet)
            const refundPromises = [];
            if (booking.stripePaymentIntentId) {
              refundPromises.push(stripe.refunds.create({ payment_intent: booking.stripePaymentIntentId }).catch(() => { }));
            }

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
                refundPromises.push(Wallet.credit(wallet.user, coinsToRefund, `Refund for cancelled booking: ${booking._id}`, booking._id, "refund").catch(() => { }));
              }
              if (coinsToRevoke > 0) {
                refundPromises.push(Wallet.debit(wallet.user, coinsToRevoke, `Revoked earned coins for cancelled booking: ${booking._id}`, booking._id, "revoke").catch(() => { }));
              }
            }
            await Promise.all(refundPromises);

            // B. History Update
            booking.status = "cancelled";
            await booking.save();

            const initiator = await User.findById(booking.user);
            const splitData = await SplitBooking.findOne({ booking: booking._id });
            const fromMail = process.env.CONTACT_EMAIL_RECEIVER || process.env.SMTP_USER;
            const datesStr = `${booking.checkIn.toLocaleDateString()} to ${booking.checkOut.toLocaleDateString()}`;

            // C. Parallel Notifications & Detailed Emails
            const notifyPromises = [];
            const buildMsg = (name, total, paid) => `Dear ${name},\n\nYour booking for "${listing.title}" was cancelled by the host.\n\n--- SUMMARY ---\n- Listing: ${listing.title}\n- Dates: ${datesStr}\n\n--- BILLING ---\n- Total Price: ₹${total.toLocaleString("en-IN")}\n- Amount Paid by You: ₹${paid.toLocaleString("en-IN")}\n- Refund Amount: ₹${paid.toLocaleString("en-IN")}\n\nRefund initiated to your original payment method.\n\nTeam Wanderlust`;

            if (initiator) {
              const initiatorPaid = splitData ? splitData.amountPerPerson : booking.totalPrice;
              notifyPromises.push(Notification.create({ user: initiator._id, message: `Refund processed for "${listing.title}".`, type: "error" }).catch(() => { }));
              notifyPromises.push(transporter.sendMail({
                from: `"Wanderlust Support" <${fromMail}>`,
                to: initiator.email,
                subject: "Booking Cancelled & Refund Processed",
                text: buildMsg(initiator.username, booking.totalPrice, initiatorPaid)
              }).catch(() => { }));
            }

            if (splitData && splitData.friendEmails) {
              splitData.friendEmails.forEach(fEmail => {
                notifyPromises.push(transporter.sendMail({
                  from: `"Wanderlust Support" <${fromMail}>`,
                  to: fEmail,
                  subject: "Group Booking Cancelled",
                  text: buildMsg("Guest", booking.totalPrice, splitData.amountPerPerson)
                }).catch(() => { }));
              });
            }
            await Promise.all(notifyPromises);
            console.log(`[DeleteListing] Booking ${booking._id} handled parallely.`);
          } catch (err) { console.error(`[DeleteListing] Task Error:`, err.message); }
        }));

        // 2. Parallel Cleanup
        await Promise.all([
          Offer.deleteMany({ listing: id }),
          Listing.findByIdAndDelete(id),
          listing.image && listing.image.filename ? deleteImage(listing.image.filename).catch(() => { }) : Promise.resolve()
        ]);
        console.log(`[DeleteListing] Background cleanup done for ${id}`);
      } catch (e) { console.error("[DeleteListing] Background Error:", e.message); }
    });

  } catch (globalErr) {
    req.flash("error", "Error during deletion.");
    req.session.save(() => res.redirect("/listings"));
  }
};

module.exports = { destroyListing };
