const mongoose = require("mongoose");
const Schema   = mongoose.Schema;

/**
 * Wallet – one document per user
 * Stores coin balance and transaction history.
 * Earn rate : 1 Coin per ₹100 spent
 * Redeem rate: 1 Coin = ₹1 off at checkout
 * Max redeem per booking: 20% of totalPrice
 */
const transactionSchema = new Schema({
  type:        { type: String, enum: ["credit", "debit"], required: true },
  coins:       { type: Number, required: true },
  description: { type: String, default: "" },
  bookingId:   { type: Schema.Types.ObjectId, ref: "Booking", default: null },
  createdAt:   { type: Date, default: Date.now },
});

const walletSchema = new Schema({
  user: {
    type:     Schema.Types.ObjectId,
    ref:      "User",
    required: true,
    unique:   true,
    index:    true,
  },
  balance:      { type: Number, default: 0, min: 0 },
  transactions: [transactionSchema],
  referCode: {
    type:    String,
    unique:  true,
    sparse:  true,
  },
  referredBy:   { type: Schema.Types.ObjectId, ref: "User", default: null },
  totalEarned:  { type: Number, default: 0 },
  totalRedeemed:{ type: Number, default: 0 },
}, { timestamps: true });

// ─── Static helpers ──────────────────────────────────────────────────────────
walletSchema.statics.EARN_RATE   = 1;   // coins per ₹100
walletSchema.statics.REDEEM_RATE = 1;   // ₹1 per coin
walletSchema.statics.MAX_REDEEM_PCT = 0.20; // max 20% of total

/**
 * Atomically credit coins to a user's wallet (or create it)
 */
walletSchema.statics.credit = async function (userId, coins, desc, bookingId = null, statUpdate = "earn") {
  const incObj = { balance: coins };
  if (statUpdate === "earn") incObj.totalEarned = coins;
  if (statUpdate === "refund") incObj.totalRedeemed = -coins;

  return this.findOneAndUpdate(
    { user: userId },
    {
      $inc:  incObj,
      $push: {
        transactions: {
          type:        "credit",
          coins,
          description: desc,
          bookingId,
          createdAt:   new Date(),
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

/**
 * Atomically debit coins (returns false if insufficient balance)
 */
walletSchema.statics.debit = async function (userId, coins, desc, bookingId = null, statUpdate = "redeem") {
  const incObj = { balance: -coins };
  if (statUpdate === "redeem") incObj.totalRedeemed = coins;
  if (statUpdate === "revoke") incObj.totalEarned = -coins;

  const wallet = await this.findOneAndUpdate(
    { user: userId, balance: { $gte: coins } },
    {
      $inc:  incObj,
      $push: {
        transactions: {
          type:        "debit",
          coins,
          description: desc,
          bookingId,
          createdAt:   new Date(),
        },
      },
    },
    { new: true },
  );
  return wallet !== null;
};

module.exports = mongoose.model("Wallet", walletSchema);
