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
    enum: ["confirmed", "cancelled"],
    default: "confirmed",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Booking", bookingSchema);
