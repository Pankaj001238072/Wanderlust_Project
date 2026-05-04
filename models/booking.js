const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const bookingSchema = new Schema({
  listing: {
    type: Schema.Types.ObjectId,
    ref: "Listing",
    required: true,
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  checkIn: {
    type: Date,
    required: true,
  },
  checkOut: {
    type: Date,
    required: true,
  },
  people: {
    type: Number,
    required: true,
    min: 1,
  },
  kids: {
    type: Number,
    default: 0,
    min: 0,
  },
  infants: {
    type: Number,
    default: 0,
    min: 0,
  },
  pets: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalPrice: Number,

  // 🎁 Selected Add-on Experiences
  addOns: [
    {
      name:  { type: String },
      price: { type: Number },
      icon:  { type: String },
    },
  ],
  addOnsTotal: { type: Number, default: 0 },

  // 💸 Wallet Coins Redeemed
  walletCoinsUsed: { type: Number, default: 0 },
  walletDiscount:  { type: Number, default: 0 },

  // 👥 Split Booking Reference
  splitBooking: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     "SplitBooking",
    default: null,
  },

  // 📊 Dynamic Pricing Breakdown (for audit/display)
  pricingBreakdown: [
    {
      label:  { type: String },
      change: { type: String },
    },
  ],
  paymentStatus: {
    type: String,
    enum: ["paid", "failed"],
    default: "paid",
  },
  stripeCheckoutSessionId: {
    type: String,
    default: null,
  },
  stripePaymentIntentId: {
    type: String,
    default: null,
  },
  status: {
    type: String,
    enum: ["confirmed", "cancelled", "pending_split"],
    default: "confirmed",
  },
  negotiatedOfferId: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Booking", bookingSchema);
