const User = require("../models/user.js");
const Notification = require("../models/notification.js");
const nodemailer = require("nodemailer");
const path = require("path");

// Importing the User model which is used for user registration and authentication
module.exports.renderSignupForm = (req, res) => {
  res.render("users/signup.ejs"); // Rendering the signup page
};

// Handling user signup logic
module.exports.signup = async (req, res) => {
  try {
    const signupBody = req.body.user || req.body;
    let { username, email, password } = signupBody; // Destructuring username, email, and password from the request body
    const newUser = new User({ email, username }); // Creating a new user instance with the provided email and username
    // Registering the user with the provided password (using passport-local-mongoose's register method which handles password hashing and saving the user to the database)
    const registeredUser = await User.register(
      newUser,
      password,
    );
    // Send welcome email in background
    setImmediate(async () => {
      try {
        await Notification.create({
          user: registeredUser._id,
          message: "Welcome to Wanderlust! Your account has been created successfully.",
          type: "success",
        });

        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: registeredUser.email,
          subject: "Welcome to Wanderlust!",
          text: `Hi ${registeredUser.username},\n\nYour account has been created successfully. Enjoy exploring and booking unique stays!`,
        });
      } catch (e) {}
    });
    req.login(registeredUser, (err) => {
      if (err) {
        return next(err);
      }
      req.flash("success", "Welcome to Wanderlust!");
      res.redirect("/listings");
    });
  } catch (e) {
    req.flash("error", e.message); // Setting an error flash message if there was an error during registration
    res.redirect("/signup"); // Redirecting back to the signup page if there was an error
  }
};

// Rendering the login form
module.exports.renderLoginForm = (req, res) => {
  res.render("users/login.ejs"); // Rendering the login page
};

// Handling user login logic
module.exports.login = async (req, res) => {
  req.flash("success", "Welcome back to Wanderlust!"); // Setting a success flash message upon successful login
  let redirectUrl = res.locals.redirectUrl || "/listings"; // Redirecting to the original URL the user was trying to access before being redirected to login, or to the listings page if there is no redirectUrl
  res.redirect(redirectUrl); //Redirecting to the determined redirect URL after successful login
};

// Handling user logout logic
module.exports.logout = (req, res, next) => {
  req.logout((err) => {
    // Calling the logout method provided by Passport to log the user out
    if (err) {
      return next(err); // If there is an error during logout, pass it to the next middleware
    }
    req.flash("success", "You are logged out!");
    res.redirect("/listings");
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
  user.username = username;
  user.email = email;
  user.phone = phone;

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

  user.photo = newPhotoUrl;
  user.photoPublicId = newPhotoPublicId;
  await user.save();
  req.flash(
    "success",
    "Profile updated successfully. A confirmation email has been sent.",
  );
  res.redirect("/profile");
  // Send email notification in background
  setImmediate(async () => {
    try {
      await Notification.create({
        user: user._id,
        message: "Your profile has been updated successfully.",
        type: "success",
      });

      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: user.email,
        subject: "Profile Updated",
        text: `Hi ${user.username},\n\nYour profile has been updated successfully.\n\nIf you did not make this change, please contact support.`,
      });
    } catch (e) {}
  });
};

// Handle account deletion (delete Cloudinary photo if exists)
module.exports.deleteAccount = async (req, res) => {
  const user = await User.findById(req.user._id);
  // Delete photo from Cloudinary if exists
  if (user && user.photoPublicId) {
    try {
      await require("../helpers/cloudHelper").deleteImage(
        user.photoPublicId,
      );
    } catch (e) {}
  }

  // Delete all listings, offers, bookings, reviews related to this user
  const Listing = require("../models/listing");
  const Offer = require("../models/offer");
  const Booking = require("../models/booking");
  const Review = require("../models/review");
  const { deleteImage } = require("../helpers/cloudHelper");

  // Find all listings by this user
  const userListings = await Listing.find({
    owner: req.user._id,
  });
  const userListingIds = userListings.map((l) => l._id);
  for (const listing of userListings) {
    if (listing.image && listing.image.filename) {
      try {
        await deleteImage(listing.image.filename);
      } catch (e) {}
    }
  }
  // Delete all bookings where user is guest
  await Booking.deleteMany({ user: req.user._id });
  // Delete all bookings for listings owned by this user (host)
  if (userListingIds.length > 0) {
    await Booking.deleteMany({
      listing: { $in: userListingIds },
    });
  }
  await Listing.deleteMany({ owner: req.user._id });
  await Offer.deleteMany({ owner: req.user._id });
  await Review.deleteMany({ author: req.user._id });
  await Notification.deleteMany({ user: req.user._id });

  // Delete reports, subscribers, contacts by user email
  const Report = require("../models/report");
  const Subscriber = require("../models/subscriber");
  const Contact = require("../models/contact");
  await Report.deleteMany({ email: req.user.email });
  await Subscriber.deleteMany({ email: req.user.email });
  await Contact.deleteMany({ email: req.user.email });

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
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: deletedUserEmail,
          subject: "Account Permanently Deleted",
          text: `Hi ${deletedUserName},\n\nYour account and all related data (listings, offers, bookings, reviews) have been permanently deleted as per your request. If you did not make this request, please contact support immediately.`,
        });
      } catch (e) {
        // Debug: log any error that occurs
        console.log("Delete email error:", e);
      }
    });
  });
};
