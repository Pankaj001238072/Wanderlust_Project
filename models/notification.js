const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const notificationSchema = new Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  link: {
    type: String,
    default: "",
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  type: {
    type: String,
    enum: ["success", "info", "warning", "error"],
    default: "info",
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 604800, // Automatically delete after 7 days (604800 seconds)
  },
});

module.exports = mongoose.model("Notification", notificationSchema);
