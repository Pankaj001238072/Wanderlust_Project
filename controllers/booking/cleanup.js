const { Booking, stripe } = require("./common");
const SplitBooking = require("../../models/splitBooking");
const User = require("../../models/user");
const Notification = require("../../models/notification");
const nodemailer = require("nodemailer");

/**
 * Cleanup expired pending split bookings
 * Marks them as cancelled and initiates refunds for any paid shares.
 */
const cleanupExpiredBookings = async () => {
    try {
        // Cancel pending_split bookings that are older than 60 minutes (payment window expired)
        const expiryThreshold = new Date(Date.now() - 60 * 60 * 1000);
        
        const expiredBookings = await Booking.find({
            status: "pending_split",
            createdAt: { $lt: expiryThreshold },
        });

        if (expiredBookings.length === 0) return;

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
            port: process.env.SMTP_PORT == "465" ? 2525 : parseInt(process.env.SMTP_PORT) || 2525,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });

        for (const booking of expiredBookings) {
            console.log(`Cleaning up expired booking: ${booking._id}`);
            
            let refundSuccess = false;
            let splitData = null;

            // 1. Process Refund if payment intent exists
            if (booking.stripePaymentIntentId && stripe) {
                try {
                    await stripe.refunds.create({
                        payment_intent: booking.stripePaymentIntentId,
                    });
                    refundSuccess = true;
                } catch (err) {
                    console.error(`Refund failed for ${booking._id}:`, err.message);
                }
            }

            // 2. Fetch Split Data for multi-user refunds/emails
            if (booking.splitBooking) {
                splitData = await SplitBooking.findById(booking.splitBooking);
            }

            // 3. Mark as cancelled
            booking.status = "cancelled";
            await booking.save();

            // 4. Send Emails & Notifications
            const initiator = await User.findById(booking.user);
            if (initiator) {
                const subject = "Booking Expired & Refund Initiated";
                const text = refundSuccess 
                    ? `Your group booking has expired as it wasn't completed within 24 hours. A refund for any paid shares (₹${splitData ? splitData.amountPerPerson * splitData.paidShares : booking.totalPrice}) has been initiated.`
                    : `Your group booking has expired. No completed payments were found to refund or refund failed. Please contact support if you paid anything.`;

                // Internal Notification
                await Notification.create({
                    user: initiator._id,
                    message: text,
                    type: "warning",
                });

                // Email
                await transporter.sendMail({
                    from: `"Wanderlust Support" <${process.env.CONTACT_EMAIL_RECEIVER || process.env.SMTP_USER}>`,
                    to: initiator.email,
                    subject,
                    text,
                }).catch(e => console.error("Email error:", e.message));
            }

            // 5. Notify Friends if any
            if (splitData && splitData.friendEmails && splitData.friendEmails.length > 0) {
                const friendText = `The group booking you participated in has expired. If you paid your share (₹${splitData.amountPerPerson}), a refund has been initiated and will reflect in 5-7 business days.`;
                for (const fEmail of splitData.friendEmails) {
                    await transporter.sendMail({
                        from: `"Wanderlust Support" <${process.env.CONTACT_EMAIL_RECEIVER || process.env.SMTP_USER}>`,
                        to: fEmail,
                        subject: "Group Booking Expired",
                        text: friendText,
                    }).catch(e => console.error("Friend email error:", e.message));
                }
            }
        }
    } catch (error) {
        console.error("Cleanup Logic Error:", error);
    }
};

module.exports = { cleanupExpiredBookings };
