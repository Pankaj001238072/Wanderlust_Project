const mongoose = require("mongoose");
const Schema   = mongoose.Schema;

/**
 * SplitBooking – tracks group payment splits
 * When user books with friends, one booking is created
 * and each friend gets an email with their payment link.
 */
const splitBookingSchema = new Schema({
  booking: {
    type:     Schema.Types.ObjectId,
    ref:      "Booking",
    required: true,
  },
  initiator: {
    type:     Schema.Types.ObjectId,
    ref:      "User",
    required: true,
  },
  totalAmount:      { type: Number, required: true },
  splitWays:        { type: Number, required: true, default: 2 },
  amountPerPerson:  { type: Number, required: true },
  paidShares:       { type: Number, default: 1 }, // Initiator pays 1 share initially
  paymentToken:     { type: String, required: true }, // Single sharable link for the group
  allPaid:          { type: Boolean, default: false },
  friendEmails:     [{ type: String }],
  createdAt:        { type: Date, default: Date.now },
});

module.exports = mongoose.model("SplitBooking", splitBookingSchema);
