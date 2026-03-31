// Start temp uploads cleanup (deletes old temp files every 1 min)
require("./helpers/cleanupTempUploads");

if (process.env.NODE_ENV !== "production") {
  // Check if the environment is not production, if true then load environment variables from .env file (useful for development)
  require("dotenv").config(); // Load environment variables from .env file in development mode
}

const express = require("express"); // Importing the express module, use to create routes like GET, POST
const app = express(); // Creating an instance of express
app.set('trust proxy', 2); // Trust the reverse proxy chain (like Render's multiple load balancer IPs) to ensure correct IP and Secure cookie handling
const mongoose = require("mongoose"); // Importing mongoose for MongoDB interaction
const path = require("path"); // Importing path module for handling file paths
const compression = require("compression"); // Importing compression for gzip response
const methodOverride = require("method-override"); // Importing method-override for supporting PUT and DELETE methods
const ejsMate = require("ejs-mate"); // Importing ejs-mate for EJS templating engine
const ExpressError = require("./utils/ExpressError.js"); // Importing custom ExpressError class for error handling (utils folder-> ExpressError.js)
const listingRouter = require("./routes/listing.js"); // Importing the listings router (routes folder-> listing.js)
const reviewRouter = require("./routes/review.js"); // Importing the reviews router (routes folder-> review.js)
const userRouter = require("./routes/user.js"); // Importing the user router (routes folder-> user.js)
const bookingRouter = require("./routes/booking.js");
const contactRouter = require("./routes/contact.js");
const reportRouter = require("./routes/report.js");
const session = require("express-session"); // Importing express-session for handling sessions
const MongoStore = require("connect-mongo").default; // Importing connect-mongo for storing session data in MongoDB
const flash = require("connect-flash"); // Importing connect-flash for flash messages (used for showing success messages)
const passport = require("passport"); // Importing passport for authentication
const LocalStrategy = require("passport-local"); // Importing passport-local for local authentication strategy
const User = require("./models/user.js"); // Importing the User model (models folder-> user.js)
const Notification = require("./models/notification.js");
const rateLimit = require("express-rate-limit"); // Importing express-rate-limit for rate limiting (security measure to prevent brute-force attacks)
let helmet; // Importing helmet for setting various HTTP headers for security (optional, will check if it's installed)
let csurf; // Importing csurf for CSRF protection (optional, will check if it's installed)

try {
  helmet = require("helmet");
} catch (err) {
  helmet = null;
}
try {
  csurf = require("csurf");
} catch (err) {
  csurf = null;
}

// const MONGO_URL = "mongodb://127.0.0.1:27017/wanderlust"; // MongoDB connection URL
const dbUrl = process.env.ATLASDB_URL;

main() // Connecting to MongoDB
  .then(() => {
    console.log("Connected to DB");
  })
  .catch((err) => {
    console.log(err);
  });

async function main() {
  // Async function to connect to MongoDB
  await mongoose.connect(dbUrl);
  // await mongoose.connect(MONGO_URL);
}

app.set("view engine", "ejs"); // Setting EJS as the templating engine
app.set("views", path.join(__dirname, "views")); // Setting the views directory
app.use(express.json()); // Middleware to parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Middleware to parse URL-encoded bodies
app.use(methodOverride("_method")); // Middleware to support PUT and DELETE methods via query parameter
app.engine("ejs", ejsMate); // Using ejs-mate as the engine for EJS templates
app.use(compression()); // Zips the responses to drastically improve load times
app.use(express.static(path.join(__dirname, "public"))); // Safe ETag caching to avoid stale files

const store = MongoStore.create({
  mongoUrl: dbUrl, // MongoDB connection URL for storing session data
  crypto: {
    //session encryption
    secret: process.env.SESSION_SECRET, // Secret string for encrypting session data (using environment variable for security)
  },
  touchAfter: 24 * 3600, // Time period in seconds to update session in the database (24 hours)
});

const sessionOptions = {
  store, // Using MongoDB to store session data
  secret: process.env.SESSION_SECRET, // Secret string for signing the session ID cookie (using environment variable for security)
  resave: false, // Don't save session if unmodified
  saveUninitialized: false, // Save session only when data exists
  name: "wanderlust.sid",
  cookie: {
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // Set cookie to expire in 7 days
    maxAge: 7 * 24 * 60 * 60 * 1000, // Set max age of cookie to 7 days
    httpOnly: true, // Mitigate risk of client side script accessing the protected cookie(security purpose-> cross-site scripting attacks prevention)
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  },
};

app.use(session(sessionOptions)); // Using session middleware with the defined options
app.use(flash()); // Using flash middleware for flash messages

// Fix for flash message delay: save session explicitly before redirecting
app.use((req, res, next) => {
  const originalRedirect = res.redirect;
  res.redirect = function (...args) {
    if (req.session) {
      req.session.save(() => {
        originalRedirect.apply(res, args);
      });
    } else {
      originalRedirect.apply(res, args);
    }
  };
  next();
});

if (helmet) {
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
}

if (csurf) {
  app.use(csurf());
  app.use((req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    next();
  });
}

app.use(passport.initialize()); // Initializing passport for authentication
app.use(passport.session()); // remembering the user across different requests (persistent login sessions)
passport.use(new LocalStrategy(User.authenticate())); // Using the local strategy for authentication with the User model

passport.serializeUser(User.serializeUser()); // saving user id to the session
passport.deserializeUser(User.deserializeUser()); // remove user id from the session when logging out

// Setting up rate limiting middleware to limit the number of requests from a single IP address (security measure to prevent brute-force attacks)
const limiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 200, // max 200 requests per IP
  message:
    "Too many requests from this IP, please try again later.",
});

app.use(limiter);

// Middleware to set flash messages and current user in response locals for access in templates
app.use(async (req, res, next) => {
  res.locals.success = req.flash("success"); // Setting success flash message in response locals
  res.locals.error = req.flash("error"); // Setting error flash message in response locals
  res.locals.currUser = req.user; // Setting the current user in response locals for access in templates
  
  res.locals.justSubscribed = req.session.justSubscribed;
  delete req.session.justSubscribed;

  if (req.user) {
    try {
      res.locals.notifications = await Notification.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();
      res.locals.unreadCount = res.locals.notifications.filter(n => !n.isRead).length;
    } catch (err) {
      res.locals.notifications = [];
      res.locals.unreadCount = 0;
    }
  } else {
    res.locals.notifications = [];
    res.locals.unreadCount = 0;
  }

  next(); // Calling next middleware
});

// Middleware to set the map token and reCAPTCHA site key in response locals for access in templates
app.use((req, res, next) => {
  res.locals.mapToken = process.env.MAP_TOKEN;
  res.locals.recaptchaSiteKey = process.env.RECAPTCHA_SITE_KEY;
  next();
});

// Listing Routes
app.use("/listings", listingRouter); // Using the listings router for routes starting with /listings
// Review Routes
app.use("/listings/:id/reviews", reviewRouter); // Using the review router for routes starting with /listings/:id/reviews
// Booking Routes
app.use("/listings/:id/bookings", bookingRouter);
app.use("/bookings", bookingRouter);
// User Routes
app.use("/", userRouter); // Using the user router for routes starting with /
// Contact Routes
app.use("/contact", contactRouter);
// Report Routes
app.use("/report", reportRouter);
// Newsletter subscription route
const subscriberRouter = require("./routes/subscriber");
app.use(subscriberRouter);
// Notification Routes
const notificationRouter = require("./routes/notification");
app.use("/notifications", notificationRouter);
// AI Chat Routes
const aiRouter = require("./routes/ai");
app.use("/api", aiRouter);
// Help Center route
app.get("/help", (req, res) => {
  res.render("help");
});

// Home route for root URL
app.get("/", (req, res) => {
  res.redirect("/listings");
});

// Handling all undefined routes with a 404 error using the custom ExpressError class

const offerRoutes = require("./routes/offer");
app.use("/offer", offerRoutes);

app.use((req, res, next) => {
  next(new ExpressError(404, "Page Not Found!"));
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (err.code === "EBADCSRFTOKEN") {
    req.flash(
      "error",
      "Security token invalid or expired. Please try again.",
    );
    const backUrl =
      req.get("Referrer") ||
      req.get("Referer") ||
      "/listings";
    return res.redirect(backUrl);
  }

  let {
    statusCode = 500,
    message = "Something went wrong!",
  } = err;
  // res.status(statusCode).send(message);
  res
    .status(statusCode)
    .render("error.ejs", { statusCode, message }); // Rendering an error page with status code and message
});

const Offer = require("./models/offer");
// Delete expired offers every hour
setInterval(
  async () => {
    try {
      const now = new Date();
      now.setHours(0, 0, 0, 0); // Set to start of today
      await Offer.deleteMany({ validTill: { $lt: now } });
      console.log("Expired offers deleted");
    } catch (err) {
      console.error("Error deleting expired offers:", err);
    }
  },
  60 * 60 * 1000,
); // Every hour

app.listen(8080, () => {
  // Starting the server on port 8080
  console.log("Server is listening to port 8080");
});
