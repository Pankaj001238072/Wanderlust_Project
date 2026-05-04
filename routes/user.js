const express = require("express"); // Importing express for creating the router
const router = express.Router(); // Creating a new router instance
const wrapAsync = require("../utils/wrapAsync"); // Importing wrapAsync for handling async errors in route handlers
const passport = require("passport"); // Importing passport for authentication
const rateLimit = require("express-rate-limit");
const {
  saveRedirectUrl,
  validateUser,
  redirectIfLoggedIn,
} = require("../middleware.js"); // Importing the saveRedirectUrl and redirectIfLoggedIn middleware

const userController = require("../controllers/users.js"); // Importing the user controller which contains the signup function
const { isLoggedIn } = require("../middleware.js"); // Importing the isLoggedIn middleware to check if the user is logged in

// Multer and helpers for profile photo upload
const multer = require("multer");
const path = require("path");
const {
  uploadImage,
  deleteImage,
} = require("../helpers/cloudHelper");
const { compressImage } = require("../helpers/imageHelper");
const fs = require("fs");

// Multer config for local temp storage (before compression)
const profileUploadPath = path.join(__dirname, "../public/uploads/profile");
if (!fs.existsSync(profileUploadPath)) {
  fs.mkdirSync(profileUploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync(profileUploadPath)) {
      fs.mkdirSync(profileUploadPath, { recursive: true });
    }
    cb(null, profileUploadPath);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + Date.now() + ext);
  },
});
const upload = multer({ storage });

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    req.flash(
      "error",
      "Too many login attempts. Please try again after 15 minutes.",
    );
    return res.redirect("/login");
  },
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash(
      "error",
      "Too many signup attempts. Please try again later.",
    );
    return res.redirect("/signup");
  },
});

// Route to render the signup form and handle user signup
router
  .route("/signup")
  .get(redirectIfLoggedIn, userController.renderSignupForm) // Route to render the signup form
  // .post(wrapAsync(userController.signup)); // Route to handle user signup
  .post(
    // Route to handle user signup with validation middleware to validate the user data before calling the signup controller function and if the data is invalid, it will throw an error with a message containing all validation errors
    redirectIfLoggedIn,
    signupLimiter,
    validateUser,
    wrapAsync(userController.signup),
  );

// Route to render the login form and handle user login
router
  .route("/login")
  .get(redirectIfLoggedIn, userController.renderLoginForm) // Route to render the login form
  .post(
    // Route to handle user login
    redirectIfLoggedIn,
    loginLimiter,
    saveRedirectUrl,
    (req, res, next) => {
      console.log("--- LOGIN ATTEMPT ---");
      console.log("Device:", req.headers["user-agent"]);
      console.log("Username Received:", `'${req.body.username}'`);
      console.log("Username Length:", req.body.username ? req.body.username.length : 0);
      next();
    },
    (req, res, next) => {
      passport.authenticate("local", (err, user, info) => {
        if (err) return next(err);
        if (!user) {
          req.flash("error", info ? info.message : "Invalid username or password");
          return req.session.save(() => res.redirect("/login"));
        }
        req.logIn(user, (err) => {
          if (err) return next(err);
          req.session.save(() => {
            userController.login(req, res);
          });
        });
      })(req, res, next);
    },
  );

// Route to handle user logout
router.get("/logout", userController.logout);

// ── Forgot / Reset Password (OTP-based, mobile-friendly) ───────
// Step 1: enter email
router.get("/forgot-password", userController.renderForgotPassword);
router.post("/forgot-password", wrapAsync(userController.forgotPassword));
// Step 2: enter OTP
router.get("/forgot-password/verify", wrapAsync(userController.renderForgotPasswordVerify));
router.post("/forgot-password/verify", wrapAsync(userController.forgotPasswordVerify));
router.post("/forgot-password/resend", wrapAsync(userController.resendResetOtp));
// Step 3: set new password (session-gated, no token in URL)
router.get("/reset-password", wrapAsync(userController.renderResetPassword));
router.post("/reset-password", wrapAsync(userController.resetPassword));

// ── Email Verification ─────────────────────────────────────────
router.get("/verify-email", userController.renderVerifyEmail);
router.post("/verify-email", wrapAsync(userController.verifyEmail));
router.post("/resend-otp", wrapAsync(userController.resendOtp));


// Legal info pages linked from footer
router.get("/privacy", (req, res) => {
  res.render("privacy.ejs");
});

router.get("/terms", (req, res) => {
  res.render("terms.ejs");
});

// User profile page (must be logged in)
router.get(
  "/profile",
  isLoggedIn,
  wrapAsync(async (req, res) => {
    // req.user is populated by passport
    res.render("users/profile.ejs", { user: req.user });
  }),
);

// Edit profile form
router.get(
  "/profile/edit",
  isLoggedIn,
  userController.renderEditProfile,
);

// Profile update validation middleware
const {
  validateProfileUpdate,
} = require("../middlewares/profileValidation");

// Update profile (with photo upload and Joi validation)
router.post(
  "/profile/edit",
  isLoggedIn,
  upload.single("photo"),
  validateProfileUpdate,
  wrapAsync(userController.updateProfile),
);

// Delete account
router.post(
  "/profile/delete",
  isLoggedIn,
  wrapAsync(userController.deleteAccount),
);

module.exports = router; // Exporting the router to be used in other parts of the application
