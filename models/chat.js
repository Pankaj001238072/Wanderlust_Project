const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const chatSchema = new Schema({
  listing: {
    type: Schema.Types.ObjectId,
    ref: "Listing",
    required: true
  },
  guest: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  host: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  messages: [
    {
      sender: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
      },
      text: {
        type: String,
        required: true
      },
      type: {
        type: String,
        enum: ["text", "offer"],
        default: "text"
      },
      offerDetails: {
        price: Number,
        checkIn: String,
        checkOut: String,
        status: {
          type: String,
          enum: ["pending", "accepted", "rejected"],
          default: "pending"
        },
        offerId: String
      },
      timestamp: {
        type: Date,
        default: Date.now
      }
    }
  ],
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  unreadByHost: {
    type: Boolean,
    default: false
  },
  unreadByGuest: {
    type: Boolean,
    default: false
  }
});

// Index for quick lookup of chat between a guest and a listing
chatSchema.index({ listing: 1, guest: 1 }, { unique: true });

module.exports = mongoose.model("Chat", chatSchema);
