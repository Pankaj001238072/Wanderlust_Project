const User = require("../models/user.js");
const Notification = require("../models/notification.js");
const Listing = require("../models/listing");
const Offer = require("../models/offer");
const Booking = require("../models/booking");
const Review = require("../models/review");
const Report = require("../models/report");
const Subscriber = require("../models/subscriber");
const Contact = require("../models/contact");
const Chat = require("../models/chat");
const Wallet = require("../models/wallet");
const SplitBooking = require("../models/splitBooking");
const { deleteImage } = require("../helpers/cloudHelper");
const nodemailer = require("nodemailer");
const path = require("path");
const crypto = require("crypto");

// ─────────────────────────────────────────────────────────────
//  Shared SMTP transporter
// ─────────────────────────────────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
    port:
      process.env.SMTP_PORT == "465"
        ? 2525
        : parseInt(process.env.SMTP_PORT) || 2525,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// Importing the User model which is used for user registration and authentication
module.exports.renderSignupForm = (req, res) => {
  res.render("users/signup.ejs"); // Rendering the signup page
};

// Handling user signup logic – sends verification email instead of logging in immediately
module.exports.signup = async (req, res) => {
  try {
    const signupBody = req.body.user || req.body;
    let { username, email, password } = signupBody;

    // Generate a 6-digit OTP with 10-minute expiry
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const newUser = new User({ email, username });
    const registeredUser = await User.register(newUser, password);

    // Store OTP on the user document (unverified state)
    registeredUser.isVerified = false;
    registeredUser.verificationToken = otp;
    registeredUser.verificationTokenExpires = otpExpires;
    await registeredUser.save();

    // Persist pending user id in session for the verify step
    req.session.pendingUserId = registeredUser._id.toString();

    // Send OTP email (non-blocking)
    setImmediate(async () => {
      try {
        const transporter = createTransporter();
        await transporter.sendMail({
          from: `"Wanderlust" <${process.env.CONTACT_EMAIL_RECEIVER || process.env.SMTP_USER}>`,
          to: registeredUser.email,
          subject: "Verify your Wanderlust account",
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border-radius:12px;border:1px solid #eee">
              <h2 style="color:#ff385c;margin-bottom:8px">Wanderlust</h2>
              <p>Hi <strong>${registeredUser.username}</strong>,</p>
              <p>Use the code below to verify your email address. It expires in <strong>10 minutes</strong>.</p>
              <div style="font-size:2.4rem;font-weight:800;letter-spacing:10px;text-align:center;color:#ff385c;padding:20px 0">${otp}</div>
              <p style="color:#888;font-size:0.85rem">If you didn't create a Wanderlust account, you can safely ignore this email.</p>
            </div>`,
        });
      } catch (e) {
        console.error("Verification email error:", e.message);
      }
    });

    req.flash("success", `A 6-digit verification code has been sent to ${email}. Please check your inbox.`);
    // Save session to DB BEFORE redirect so pendingUserId is available on next page
    req.session.save(() => res.redirect("/verify-email"));
  } catch (e) {
    req.flash("error", e.message);
    req.session.save(() => res.redirect("/signup"));
  }
};

// ─── Render verify-email page ───────────────────────────────
module.exports.renderVerifyEmail = (req, res) => {
  if (!req.session.pendingUserId) {
    req.flash("error", "Nothing to verify. Please sign up first.");
    return req.session.save(() => res.redirect("/signup"));
  }
  res.render("users/verifyEmail.ejs");
};

// ─── Handle OTP submission ──────────────────────────────────
module.exports.verifyEmail = async (req, res) => {
  const pendingId = req.session.pendingUserId;
  if (!pendingId) {
    req.flash("error", "Session expired. Please sign up again.");
    return req.session.save(() => res.redirect("/signup"));
  }

  const { otp } = req.body;
  if (!otp || !otp.trim()) {
    req.flash("error", "Please enter the verification code.");
    return req.session.save(() => res.redirect("/verify-email"));
  }

  // ⚡ Single atomic DB operation: validate OTP + mark verified in one round trip
  const user = await User.findOneAndUpdate(
    {
      _id: pendingId,
      verificationToken: otp.trim(),
      verificationTokenExpires: { $gt: new Date() },
    },
    {
      $set: { isVerified: true },
      $unset: { verificationToken: "", verificationTokenExpires: "" },
    },
    { new: true }
  );

  if (!user) {
    req.flash("error", "Invalid or expired verification code. Please try again.");
    return req.session.save(() => res.redirect("/verify-email"));
  }

  delete req.session.pendingUserId;

  // Create welcome notification + email (non-blocking background)
  setImmediate(async () => {
    try {
      await Notification.create({
        user: user._id,
        message: "Welcome to Wanderlust! Your account has been verified successfully.",
        type: "success",
      });
      const transporter = createTransporter();
      await transporter.sendMail({
        from: `"Wanderlust" <${process.env.CONTACT_EMAIL_RECEIVER || process.env.SMTP_USER}>`,
        to: user.email,
        subject: "Welcome to Wanderlust!",
        text: `Hi ${user.username},\n\nYour email has been verified. Welcome to Wanderlust!`,
      });
    } catch (e) {}
  });

  // Log in the verified user
  req.login(user, (err) => {
    if (err) return res.redirect("/login");
    req.flash("success", "Email verified! Welcome to Wanderlust 🎉");
    req.session.save(() => res.redirect("/listings"));
  });
};

// ─── Resend OTP ─────────────────────────────────────────────
module.exports.resendOtp = async (req, res) => {
  const pendingId = req.session.pendingUserId;
  if (!pendingId) {
    req.flash("error", "Session expired. Please sign up again.");
    return req.session.save(() => res.redirect("/signup"));
  }

  const user = await User.findById(pendingId);
  if (!user) {
    req.flash("error", "User not found. Please sign up again.");
    return req.session.save(() => res.redirect("/signup"));
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  user.verificationToken = otp;
  user.verificationTokenExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  await user.save();

  setImmediate(async () => {
    try {
      const transporter = createTransporter();
      await transporter.sendMail({
        from: `"Wanderlust" <${process.env.CONTACT_EMAIL_RECEIVER || process.env.SMTP_USER}>`,
        to: user.email,
        subject: "Your new Wanderlust verification code",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border-radius:12px;border:1px solid #eee">
            <h2 style="color:#ff385c">Wanderlust</h2>
            <p>Hi <strong>${user.username}</strong>, here is your new verification code:</p>
            <div style="font-size:2.4rem;font-weight:800;letter-spacing:10px;text-align:center;color:#ff385c;padding:20px 0">${otp}</div>
            <p style="color:#888;font-size:0.85rem">Expires in 10 minutes.</p>
          </div>`,
      });
    } catch (e) {
      console.error("Resend OTP error:", e.message);
    }
  });

  req.flash("success", "A new verification code has been sent to your email.");
  req.session.save(() => res.redirect("/verify-email"));
};

// Rendering the login form
module.exports.renderLoginForm = (req, res) => {
  res.render("users/login.ejs"); // Rendering the login page
};

// Handling user login logic
module.exports.login = async (req, res) => {
  req.flash("success", "Welcome back to Wanderlust!");
  let redirectUrl = res.locals.redirectUrl || "/listings";
  // Save session to DB before redirecting so flash is never lost
  req.session.save(() => {
    res.redirect(redirectUrl);
  });
};

// Handling user logout logic
module.exports.logout = (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);

    req.flash("success", "You are logged out!");
    // Save session to DB before redirecting so flash is never lost
    req.session.save(() => {
      res.redirect("/listings");
    });
  });
};

// Render edit profile form
module.exports.renderEditProfile = (req, res) => {
  res.render("users/editProfile.ejs", { user: req.user });
};

// Handle profile update (with photo upload, compression, Cloudinary)
module.exports.updateProfile = async (req, res) => {
  const { username, email, phone } = req.body;
  const user = await User.findById(req.user._id);

  let newPhotoUrl = user.photo;
  let newPhotoPublicId = user.photoPublicId;
  let oldPhotoPublicId = user.photoPublicId;

  // If a new photo is uploaded
  if (req.file) {
    const tempPath = req.file.path;
    const outputDir = path.dirname(tempPath);
    let compressedPath = null;
    try {
      // Compress image
      compressedPath =
        await require("../helpers/imageHelper").compressImage(
          tempPath,
          outputDir,
        );
      // Upload to Cloudinary
      const uploadResult =
        await require("../helpers/cloudHelper").uploadImage(
          compressedPath,
        );
      newPhotoUrl = uploadResult.url;
      newPhotoPublicId = uploadResult.filename;
      // Delete old photo from Cloudinary if exists
      if (oldPhotoPublicId) {
        await require("../helpers/cloudHelper").deleteImage(
          oldPhotoPublicId,
        );
      }
      // Clean up local files
      await require("../helpers/fileHelper").deleteLocalFile(
        { path: tempPath },
      );
      await require("../helpers/fileHelper").deleteLocalFile(
        { path: compressedPath },
      );
    } catch (err) {
      // Always try to clean up temp and compressed files, even on error
      if (tempPath) {
        await require("../helpers/fileHelper").deleteLocalFile(
          { path: tempPath },
        );
      }
      if (compressedPath) {
        await require("../helpers/fileHelper").deleteLocalFile(
          { path: compressedPath },
        );
      }
      req.flash(
        "error",
        "Photo upload failed: " + err.message,
      );
      return res.redirect("/profile/edit");
    }
  }

  // Check if any text data actually changed
  const isDataChanged = 
    user.username !== username || 
    user.email !== email || 
    user.phone !== (phone || "");

  // If no changes at all (text + photo), just redirect back
  if (!isDataChanged && !req.file) {
    return res.redirect("/profile");
  }

  // Update fields
  user.username = username;
  user.email = email;
  user.phone = phone;
  user.photo = newPhotoUrl;
  user.photoPublicId = newPhotoPublicId;
  
  // Save to DB
  const updatedUser = await user.save();

  // 🔄 REFRESH SESSION: This is the critical step that keeps the user logged in
  // even after changing their username.
  req.login(updatedUser, (err) => {
    if (err) {
      console.error("Session refresh error:", err);
      req.flash("error", "Profile updated, but session refresh failed. Please log in again.");
      return res.redirect("/login");
    }

    req.flash(
      "success",
      "Profile updated successfully. A confirmation email has been sent.",
    );
    
    // 🛡️ FORCE SAVE: Ensure session is fully committed to DB before redirecting.
    // This is crucial to prevent the "must be logged in" race condition.
    req.session.save((saveErr) => {
      if (saveErr) console.error("Session save error:", saveErr);
      res.redirect("/profile");
    });
  });
  // Send email notification in background
  setImmediate(async () => {
    try {
      console.log("DEBUG: Attempting to send profile update email via Brevo...");
      await Notification.create({
        user: user._id,
        message: "Your profile has been updated successfully.",
        type: "success",
      });

      console.log("DEBUG RENDER ENV: USER=", process.env.SMTP_USER, " PASS length=", process.env.SMTP_PASS ? process.env.SMTP_PASS.length : "UNDEFINED", " PORT=", process.env.SMTP_PORT);
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
        port: process.env.SMTP_PORT == '465' ? 2525 : (parseInt(process.env.SMTP_PORT) || 2525),
        secure: false, // true for 465, false for 587
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      console.log("DEBUG: Profile transporter created. Sending mail...");
      await transporter.sendMail({
        from: process.env.CONTACT_EMAIL_RECEIVER || process.env.SMTP_USER,
        to: user.email,
        subject: "Profile Updated",
        text: `Hi ${user.username},\n\nYour profile has been updated successfully.\n\nIf you did not make this change, please contact support.`,
      });
      console.log("✅ Profile update email sent successfully.");
    } catch (e) {
      console.error("❌ Profile update email failed:", e.message);
      console.error("DEBUG: Full error stack:", e.stack);
    }
  });
};

// Handle account deletion (delete Cloudinary photo if exists)
module.exports.deleteAccount = async (req, res) => {
  const user = await User.findById(req.user._id).lean();
  // Delete photo from Cloudinary if exists
  if (user && user.photoPublicId) {
    try {
      await require("../helpers/cloudHelper").deleteImage(
        user.photoPublicId,
      );
    } catch (e) {}
  }

  // Find all listings by this user and map their IDs
  const userListings = await Listing.find({ owner: req.user._id }).lean();
  const userListingIds = userListings.map((l) => l._id);

  // Delete all listing images from Cloudinary
  for (const listing of userListings) {
    if (listing.image && listing.image.filename) {
      try {
        await deleteImage(listing.image.filename);
      } catch (e) {
        console.error("Cloudinary listing deletion error:", e.message);
      }
    }
  }

  // Delete all bookings where user is guest
  await Booking.deleteMany({ user: req.user._id });

  // Delete all bookings for listings owned by this user (where user is host)
  if (userListingIds.length > 0) {
    await Booking.deleteMany({
      listing: { $in: userListingIds },
    });
  }

  await Listing.deleteMany({ owner: req.user._id });
  await Offer.deleteMany({ owner: req.user._id });
  await Review.deleteMany({ author: req.user._id });
  await Notification.deleteMany({ user: req.user._id });
  await Wallet.deleteMany({ user: req.user._id });
  await Chat.deleteMany({ $or: [{ guest: req.user._id }, { host: req.user._id }] });
  await SplitBooking.deleteMany({ initiator: req.user._id });

  // Delete reports, subscribers, contacts by user email (Fallback check)
  if (req.user.email) {
    await Report.deleteMany({ email: req.user.email });
    await Subscriber.deleteMany({ email: req.user.email });
    await Contact.deleteMany({ email: req.user.email });
  }

  // Store user email and username before deleting
  const deletedUserEmail = req.user.email;
  const deletedUserName = req.user.username;

  await User.findByIdAndDelete(req.user._id);

  req.logout(() => {
    req.flash(
      "success",
      "Your account and all related data have been deleted.",
    );
    res.redirect("/signup");
    // Send email notification in background
    setImmediate(async () => {
      try {
        // Debug: log user info before sending email
        console.log(
          "Delete Account:",
          deletedUserEmail,
          deletedUserName,
        );
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT == '465' ? 2525 : (parseInt(process.env.SMTP_PORT) || 2525),
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
        await transporter.sendMail({
          from: process.env.CONTACT_EMAIL_RECEIVER || process.env.SMTP_USER,
          to: deletedUserEmail,
          subject: "Account Permanently Deleted",
          text: `Hi ${deletedUserName},\n\nYour account and all related data (listings, offers, bookings, reviews, wallet coins, chat logs, split bookings, reports, subscribers, contacts) have been permanently deleted as per your request. If you did not make this request, please contact support immediately.`,
        });
      } catch (e) {
        // Debug: log any error that occurs
        console.log("Delete email error:", e);
      }
    });
  });
};

// ════════════════════════════════════════════════════════════════
//  FORGOT PASSWORD  (OTP-based — mobile-friendly, no link clicks)
//
//  Step 1: POST /forgot-password      → send 6-digit OTP to email
//  Step 2: GET/POST /forgot-password/verify → user enters OTP
//  Step 3: GET/POST /reset-password   → user sets new password
// ════════════════════════════════════════════════════════════════

// GET /forgot-password  – render the request-email form
module.exports.renderForgotPassword = (req, res) => {
  res.render("users/forgotPassword.ejs");
};

// POST /forgot-password  – generate 6-digit OTP & email it
module.exports.forgotPassword = async (req, res) => {
  // Accept email in the 'identifier' field
  const identifier = (req.body.identifier || req.body.email || "").trim();

  // Always show the same message (don't reveal if account exists)
  const successMsg =
    "If an account with that email exists, a 6-digit code has been sent.";

  // Search by username first, then by email (case-insensitive)
  const user = await User.findOne({
    $or: [
      { username: identifier },
      { email: new RegExp(`^${identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i") },
    ],
  });

  if (!user) {
    req.flash("success", successMsg);
    return req.session.save(() => res.redirect("/forgot-password"));
  }

  if (!user.email) {
    req.flash("error", "No email address linked to this account. Please contact support.");
    return req.session.save(() => res.redirect("/forgot-password"));
  }

  // Generate a 6-digit OTP with 10-minute expiry
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  user.resetPasswordToken = otp;
  user.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  await user.save();

  // Save userId in session so verify step can look up the user
  req.session.resetUserId = user._id.toString();

  // Send OTP email (non-blocking)
  setImmediate(async () => {
    try {
      const transporter = createTransporter();
      await transporter.sendMail({
        from: `"Wanderlust" <${process.env.CONTACT_EMAIL_RECEIVER || process.env.SMTP_USER}>`,
        to: user.email,
        subject: "Your Wanderlust password reset code",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border-radius:12px;border:1px solid #eee">
            <h2 style="color:#ff385c;margin-bottom:8px">Wanderlust</h2>
            <p>Hi <strong>${user.username}</strong>,</p>
            <p>Use the code below to reset your password. It expires in <strong>10 minutes</strong>.</p>
            <div style="font-size:2.4rem;font-weight:800;letter-spacing:10px;text-align:center;color:#ff385c;padding:20px 0">${otp}</div>
            <p style="color:#888;font-size:0.85rem">If you didn't request this, you can safely ignore this email. Your password will not change.</p>
          </div>`,
      });
    } catch (e) {
      console.error("Reset OTP email error:", e.message);
    }
  });

  req.flash("success", successMsg);
  // Save session to DB BEFORE redirect so resetUserId is available on verify page
  req.session.save(() => res.redirect("/forgot-password/verify"));
};

// GET /forgot-password/verify  – render OTP entry form
module.exports.renderForgotPasswordVerify = (req, res) => {
  if (!req.session.resetUserId) {
    req.flash("error", "Session expired. Please start again.");
    return req.session.save(() => res.redirect("/forgot-password"));
  }
  res.render("users/forgotPasswordVerify.ejs");
};

// POST /forgot-password/verify  – validate OTP → allow password reset
module.exports.forgotPasswordVerify = async (req, res) => {
  const resetUserId = req.session.resetUserId;
  if (!resetUserId) {
    req.flash("error", "Session expired. Please start again.");
    return req.session.save(() => res.redirect("/forgot-password"));
  }

  const user = await User.findById(resetUserId);
  if (!user) {
    req.flash("error", "User not found. Please try again.");
    return req.session.save(() => res.redirect("/forgot-password"));
  }

  const { otp } = req.body;

  if (
    !user.resetPasswordToken ||
    user.resetPasswordToken !== otp.trim() ||
    user.resetPasswordExpires < Date.now()
  ) {
    req.flash("error", "Invalid or expired code. Please try again.");
    return req.session.save(() => res.redirect("/forgot-password/verify"));
  }

  // OTP correct — promote to resetVerified state
  req.session.resetVerifiedUserId = resetUserId;
  delete req.session.resetUserId;

  // Save session to DB BEFORE redirect — renderResetPassword reads this key
  req.session.save(() => res.redirect("/reset-password"));
};

// POST /forgot-password/resend  – resend OTP
module.exports.resendResetOtp = async (req, res) => {
  const resetUserId = req.session.resetUserId;
  if (!resetUserId) {
    req.flash("error", "Session expired. Please start again.");
    return req.session.save(() => res.redirect("/forgot-password"));
  }

  const user = await User.findById(resetUserId);
  if (!user) {
    req.flash("error", "User not found. Please start again.");
    return req.session.save(() => res.redirect("/forgot-password"));
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  user.resetPasswordToken = otp;
  user.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();

  setImmediate(async () => {
    try {
      const transporter = createTransporter();
      await transporter.sendMail({
        from: `"Wanderlust" <${process.env.CONTACT_EMAIL_RECEIVER || process.env.SMTP_USER}>`,
        to: user.email,
        subject: "Your new Wanderlust password reset code",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border-radius:12px;border:1px solid #eee">
            <h2 style="color:#ff385c">Wanderlust</h2>
            <p>Hi <strong>${user.username}</strong>, here is your new reset code:</p>
            <div style="font-size:2.4rem;font-weight:800;letter-spacing:10px;text-align:center;color:#ff385c;padding:20px 0">${otp}</div>
            <p style="color:#888;font-size:0.85rem">Expires in 10 minutes.</p>
          </div>`,
      });
    } catch (e) {
      console.error("Resend reset OTP error:", e.message);
    }
  });

  req.flash("success", "A new code has been sent to your email.");
  req.session.save(() => res.redirect("/forgot-password/verify"));
};

// GET /reset-password  – render new password form (session-gated)
module.exports.renderResetPassword = async (req, res) => {
  if (!req.session.resetVerifiedUserId) {
    req.flash("error", "Please verify your code first.");
    return req.session.save(() => res.redirect("/forgot-password"));
  }
  res.render("users/resetPassword.ejs");
};

// POST /reset-password  – save new password
module.exports.resetPassword = async (req, res) => {
  const verifiedId = req.session.resetVerifiedUserId;
  if (!verifiedId) {
    req.flash("error", "Session expired. Please start the reset process again.");
    return req.session.save(() => res.redirect("/forgot-password"));
  }

  const { password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    req.flash("error", "Passwords do not match.");
    return req.session.save(() => res.redirect("/reset-password"));
  }

  if (password.length < 4) {
    req.flash("error", "Password must be at least 4 characters.");
    return req.session.save(() => res.redirect("/reset-password"));
  }

  const user = await User.findById(verifiedId);
  if (!user) {
    req.flash("error", "User not found.");
    return req.session.save(() => res.redirect("/forgot-password"));
  }

  await user.setPassword(password);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  // Clean up reset session keys
  delete req.session.resetVerifiedUserId;

  // Auto-login so the user doesn't have to type the new password again
  req.login(user, (loginErr) => {
    if (loginErr) {
      // If auto-login fails for any reason, just redirect to login page
      req.flash("success", "Password reset! Please log in with your new password.");
      return req.session.save(() => res.redirect("/login"));
    }

    // Confirmation email (non-blocking)
    setImmediate(async () => {
      try {
        const transporter = createTransporter();
        await transporter.sendMail({
          from: `"Wanderlust" <${process.env.CONTACT_EMAIL_RECEIVER || process.env.SMTP_USER}>`,
          to: user.email,
          subject: "Your Wanderlust password has been changed",
          text: `Hi ${user.username},\n\nYour password was successfully reset. If you did not perform this action, please contact support immediately.`,
        });
      } catch (e) {}
    });

    req.flash("success", "Password reset successfully! You are now logged in.");
    req.session.save(() => res.redirect("/listings"));
  });
};