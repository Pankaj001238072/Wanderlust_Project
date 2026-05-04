/**
 * Socket.io Chat Server for Real-time Negotiation
 * Each chat room = listingId (host ↔ potential guest)
 *
 * Events:
 *  Client → Server:
 *    join_room           { listingId, userId, username }
 *    send_message        { listingId, message, username }
 *    make_offer          { listingId, offeredPrice, username, userId, checkIn, checkOut }
 *    accept_offer        { listingId, offerId, userId }
 *    reject_offer        { listingId, offerId }
 *
 *  Server → Client:
 *    new_message         { username, message, timestamp }
 *    offer_made          { offerId, offeredPrice, username, checkIn, checkOut }
 *    offer_accepted      { offerId, checkoutUrl }
 *    offer_rejected      { offerId }
 */

const crypto  = require("crypto");
const Listing = require("./models/listing.js");
const Booking = require("./models/booking.js");
const Chat    = require("./models/chat.js");
const User    = require("./models/user.js");
const nodemailer = require("nodemailer");

// In-memory offer store for quick expiry/token checks (can be moved to DB later if needed, but keeping for logic)
const activeOffers = new Map();

const initSocket = (io) => {
  io.on("connection", (socket) => {
    console.log(`[Socket] New connection: ${socket.id}`);

    // ── Join a listing chat room ────────────────────────────────────────────
    socket.on("join_room", ({ listingId, guestId, userId, username }) => {
      const roomName = `listing_${listingId}_${guestId}`;
      socket.join(roomName);
      socket.data = { listingId, guestId, userId, username };
      console.log(`[Socket] ${username} joined room ${roomName}`);
    });

    // ── Regular chat message ────────────────────────────────────────────────
    socket.on("send_message", async ({ listingId, guestId, message, username }) => {
      const timestamp = new Date();
      const formattedTime = timestamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      const roomName = `listing_${listingId}_${guestId}`;

      io.to(roomName).emit("new_message", {
        username,
        message,
        timestamp: formattedTime,
      });

      // Persist to DB
      try {
        const listing = await Listing.findById(listingId);
        if (!listing) return;

        const userId = socket.data.userId;
        
        let chat = await Chat.findOne({ listing: listingId, guest: guestId }); 
        
        if (!chat) {
          chat = new Chat({
            listing: listingId,
            guest: guestId,
            host: listing.owner
          });
        }

        if (chat) {
          chat.messages.push({
            sender: userId,
            text: message,
            type: "text",
            timestamp
          });
          chat.lastUpdated = timestamp;

          // 🔔 Set Unread Flags
          if (String(userId) === String(chat.guest)) {
            chat.unreadByHost = true;
          } else {
            chat.unreadByGuest = true;
          }

          await chat.save();
        }
      } catch (err) {
        console.error("[Socket] DB Save Error:", err);
      }
    });

    // ── Guest makes a price offer ───────────────────────────────────────────
    socket.on("make_offer", async ({ listingId, guestId, offeredPrice, username, userId, checkIn, checkOut }) => {
      try {
        const listing = await Listing.findById(listingId);
        if (!listing) return;

        const offerId = crypto.randomBytes(8).toString("hex");
        const timestamp = new Date();
        const roomName = `listing_${listingId}_${guestId}`;

        activeOffers.set(offerId, {
          listingId,
          userId,
          offeredPrice: Number(offeredPrice),
          checkIn,
          checkOut,
          expiresAt: Date.now() + 10 * 60 * 1000,
        });

        io.to(roomName).emit("offer_made", {
          offerId,
          offeredPrice,
          username,
          checkIn,
          checkOut,
        });

        // Persist offer to DB chat history
        let chat = await Chat.findOne({ listing: listingId, guest: guestId });
        if (!chat) {
          chat = new Chat({ listing: listingId, guest: guestId, host: listing.owner });
        }
        chat.messages.push({
          sender: userId,
          text: `Proposed a total stay offer: ₹${offeredPrice} (Inclusive of all taxes)`,
          type: "offer",
          offerDetails: { price: offeredPrice, checkIn, checkOut, offerId, status: "pending" },
          timestamp
        });
        chat.lastUpdated = timestamp;

        // 🔔 Set Unread Flag (Guest always makes the offer in this logic)
        chat.unreadByHost = true;

        await chat.save();
      } catch (err) {
        console.error("[Socket] make_offer error:", err.message);
      }
    });

    // ── Host accepts offer ──────────────────────────────────────────────────
    socket.on("accept_offer", async ({ listingId, guestId, offerId, hostId }) => {
      try {
        let offer = activeOffers.get(offerId);

        // If server restarted, we won't have it in memory. Let's find it in DB.
        if (!offer) {
          const chat = await Chat.findOne({ "messages.offerDetails.offerId": offerId });
          if (chat) {
            const msg = chat.messages.find(m => m.offerDetails && m.offerDetails.offerId === offerId);
            if (msg) {
              offer = {
                userId: chat.guest,
                offeredPrice: msg.offerDetails.price
              };
            }
          }
        }

        if (!offer) {
          console.log(`[Socket] Offer ${offerId} not found in memory or DB.`);
          return;
        }

        const roomName = `listing_${listingId}_${guestId}`;

        const token = crypto
          .createHmac("sha256", process.env.SESSION_SECRET || "secret")
          .update(`${offerId}${offer.userId}${offer.offeredPrice}`)
          .digest("hex")
          .slice(0, 16);

        const checkoutUrl = `/listings/${listingId}/bookings?negotiated=1&offerId=${offerId}&offerToken=${token}`;

        io.to(roomName).emit("offer_accepted", {
          offerId,
          checkoutUrl,
          offeredPrice: offer.offeredPrice,
        });

        // Update DB Status
        await Chat.updateOne(
          { "messages.offerDetails.offerId": offerId },
          { "$set": {
              "messages.$.offerDetails.status": "accepted",
              "unreadByGuest": true,
              "lastUpdated": new Date()
            }
          }
        );

        // 📧 SEND EMAIL TO GUEST (non-blocking, don't let it crash the handler)
        setImmediate(async () => {
          try {
            const guest = await User.findById(guestId).lean();
            if (guest && guest.email) {
              const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
                port: process.env.SMTP_PORT == "465" ? 2525 : parseInt(process.env.SMTP_PORT) || 2525,
                secure: false,
                auth: {
                  user: process.env.SMTP_USER,
                  pass: process.env.SMTP_PASS,
                },
              });

              const baseUrl = process.env.BASE_URL || `http://localhost:8080`;
              const fullCheckoutUrl = `${baseUrl}${checkoutUrl}`;

              await transporter.sendMail({
                from: `"Wanderlust Support" <${process.env.CONTACT_EMAIL_RECEIVER || process.env.SMTP_USER}>`,
                to: guest.email,
                subject: "Your Proposal has been Accepted! 🎉",
                text: `Hi ${guest.username},\n\nGreat news! The host for your stay at Wanderlust has accepted your total offer of ₹${Number(offer.offeredPrice).toLocaleString("en-IN")} (Inclusive of all taxes).\n\nYou can now complete your booking at this special price using the link below:\n\n${fullCheckoutUrl}\n\nHappy travels!`,
              });
              console.log(`[Socket] Acceptance email sent to ${guest.email}`);
            }
          } catch (mailErr) {
            console.error("[Socket] accept_offer email error:", mailErr.message);
          }
        });

        activeOffers.delete(offerId);
      } catch (err) {
        console.error("[Socket] accept_offer error:", err.message);
      }
    });

    // ── Host rejects offer ───────────────────────────────────────────────────
    socket.on("reject_offer", async ({ listingId, guestId, offerId }) => {
      try {
        const roomName = `listing_${listingId}_${guestId}`;
        activeOffers.delete(offerId);
        io.to(roomName).emit("offer_rejected", { offerId });

        // Update DB Status
        await Chat.updateOne(
          { "messages.offerDetails.offerId": offerId },
          { "$set": {
              "messages.$.offerDetails.status": "rejected",
              "unreadByGuest": true,
              "lastUpdated": new Date()
            }
          }
        );
      } catch (err) {
        console.error("[Socket] reject_offer error:", err.message);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
    });
  });
};

module.exports = initSocket;
