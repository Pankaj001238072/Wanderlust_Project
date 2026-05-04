const mongoose = require("mongoose"); // Importing mongoose for MongoDB interactions
const Schema = mongoose.Schema; // Getting the Schema constructor from mongoose
const passportLocalMongoose =
  require("passport-local-mongoose").default; // Importing passport-local-mongoose for handling user authentication

const userSchema = new Schema({
  email: {
    type: String,
    required: true,
    trim: true,
  },
  username: {
    type: String,
    required: true,
    trim: true,
  },
  phone: {
    type: String,
    default: "",
  },
  photo: {
    type: String, // URL to photo
    default: "",
  },
  photoPublicId: {
    type: String,
    default: "",
  },

  wishlist: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
    },
  ],

  // ── Forgot-Password ───────────────────────────────────
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },

  // ── Email Verification ────────────────────────────────
  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String },
  verificationTokenExpires: { type: Date },

  // 🎁 Loyalty – referral code (generated on first login/signup)
  referCode: { type: String, unique: true, sparse: true },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
});

userSchema.plugin(passportLocalMongoose); // Adding passport-local-mongoose plugin to the userSchema to handle password hashing and authentication methods

module.exports = mongoose.model("User", userSchema); // Exporting the User model based on the userSchema for use in other parts of the application
