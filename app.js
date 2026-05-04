// Start temp uploads cleanup (deletes old temp files every 1 min)
require("./helpers/cleanupTempUploads"); // v2

if (process.env.NODE_ENV !== "production") {
  // Check if the environment is not production, if true then load environment variables from .env file (useful for development)
  require("dotenv").config(); // Load environment variables from .env file in development mode
}

// ═══════════════════════════════════════════════════════════════
// 🛡️  GLOBAL CRASH GUARDS — Prevent server from dying on errors
// ═══════════════════════════════════════════════════════════════
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught Exception:", err.message);
  console.error(err.stack);
  // DO NOT call process.exit — let the server keep running
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[FATAL] Unhandled Promise Rejection:", reason);
  // DO NOT call process.exit — let the server keep running
});

const express = require("express"); // Importing the express module, use to create routes like GET, POST
const app = express(); // Creating an instance of express
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const initSocket = require("./socket.js");
initSocket(io);
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
const Listing = require("./models/listing.js");
const Chat = require("./models/chat.js");
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

// 🌐 Override OS DNS with Google's public DNS servers
// Fixes Windows "querySrv ECONNREFUSED" for MongoDB Atlas SRV records
// Harmless on Render/Linux — same code works on both environments
const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

// MongoDB URL — same for local & Render, only .env values differ
const dbUrl = process.env.ATLASDB_URL;

async function main() {
  await mongoose.connect(dbUrl, {
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    family: 4, // Force IPv4 TCP connections
  });
}

main()
  .then(() => {
    console.log("Connected to DB");
  })
  .catch((err) => {
    console.error("[DB] Initial connection failed:", err.message);
    // Do not crash — mongoose will auto-retry
  });

// Auto-reconnect logging
mongoose.connection.on("disconnected", () => {
  console.warn("[DB] MongoDB disconnected! Mongoose will auto-reconnect...");
});
mongoose.connection.on("reconnected", () => {
  console.log("[DB] MongoDB reconnected successfully.");
});
mongoose.connection.on("error", (err) => {
  console.error("[DB] MongoDB connection error:", err.message);
});

app.set("view engine", "ejs"); // Setting EJS as the templating engine
app.set("views", path.join(__dirname, "views")); // Setting the views directory
app.use(express.json()); // Middleware to parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Middleware to parse URL-encoded bodies
app.use(methodOverride("_method")); // Middleware to support PUT and DELETE methods via query parameter
app.engine("ejs", ejsMate); // Using ejs-mate as the engine for EJS templates
app.use(compression()); // Zips the responses to drastically improve load times
app.use(express.static(path.join(__dirname, "public"))); // Safe ETag caching to avoid stale files

const store = MongoStore.create({
  mongoUrl: dbUrl,
  mongoOptions: { serverSelectionTimeoutMS: 5000 },
  crypto: {
    secret: process.env.SESSION_SECRET,
  },
  touchAfter: 60, // 1 minute (instead of 24h) for faster online synchronization
});

const sessionOptions = {
  store,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: "wanderlust.sid",
  cookie: {
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  },
};

app.use(session(sessionOptions)); // Using session middleware with the defined options
app.use(flash()); // Using flash middleware for flash messages

// Session is saved automatically by express-session when the response ends.
// No manual patching needed — patching res.redirect causes race conditions
// with Express 5's async render pipeline (ERR_HTTP_HEADERS_SENT).

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

// 🛡️ SUPER-ROBUST FIX: Use ID String for serialization.
passport.serializeUser((user, done) => {
  done(null, user._id.toString());
});

passport.deserializeUser(async (id, done) => {
  try {
    let user = null;

    // 🛡️ Fail-Safe Check: Only try findById if the string looks like a valid ObjectId
    if (id && mongoose.isValidObjectId(id)) {
      try {
        user = await User.findById(id);
      } catch (castError) {
        // Catch any cast errors and move to fallback
      }
    }

    // 🔄 Legacy Fallback: If no user found by ID (or it wasn't a valid ID), try username
    if (!user && id) {
      user = await User.findOne({ username: id });
    }

    done(null, user);
  } catch (err) {
    console.error("CRITICAL Deserialization Error:", err);
    done(err, null);
  }
});


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
  // 🛑 PROTECT FLASH MESSAGES: Do not consume them for AJAX, API, or static assets like favicon
  const isIgnored = req.xhr ||
    req.path.startsWith("/api") ||
    req.path.includes("favicon.ico") ||
    (req.headers.accept && req.headers.accept.includes("application/json"));

  if (!isIgnored) {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
  } else {
    res.locals.success = [];
    res.locals.error = [];
  }

  res.locals.currUser = req.user;

  res.locals.justSubscribed = req.session.justSubscribed;
  delete req.session.justSubscribed;

  if (req.user) {
    try {
      // 🚀 Optimization: Don't let slow notifications hang the entire page load
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Notification Timeout")), 1000)
      );

      const notificationPromise = Notification.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      res.locals.notifications = await Promise.race([notificationPromise, timeoutPromise])
        .catch(() => []); // Fallback to empty if slow or error

      res.locals.unreadCount = Array.isArray(res.locals.notifications)
        ? res.locals.notifications.filter(n => !n.isRead).length
        : 0;
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

// ── NEW Premium Feature Routes ───────────────────────────────────────────────
const featuresRouter = require("./routes/features");
app.use("/api/features", featuresRouter);

const splitRouter = require("./routes/split");
app.use("/split", splitRouter);

const walletRouter = require("./routes/wallet");
app.use("/wallet", walletRouter);

// Authentication Middleware
const isLoggedInMiddleware = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  req.flash("error", "You must be logged in.");
  return res.redirect("/login");
};

// Global Inbox Route
app.get("/inbox", isLoggedInMiddleware, async (req, res) => {
  const userId = req.user._id;
  const chats = await Chat.find({
    $or: [{ guest: userId }, { host: userId }]
  })
    .populate("listing", "title image")
    .populate("guest", "username photo")
    .populate("host", "username photo")
    .sort({ lastUpdated: -1 })
    .lean();

  res.render("users/inbox.ejs", { chats });
});
// Route for Owner to see all chats for a specific listing
app.get("/listings/:id/chats", isLoggedInMiddleware, async (req, res) => {
  const listing = await Listing.findById(req.params.id).populate("owner").lean();
  if (!listing) { req.flash("error", "Listing not found."); return res.redirect("/listings"); }

  if (String(req.user._id) !== String(listing.owner._id)) {
    req.flash("error", "Access denied.");
    return res.redirect(`/listings/${req.params.id}`);
  }

  const chats = await Chat.find({ listing: req.params.id })
    .populate("guest", "username photo")
    .sort({ lastUpdated: -1 })
    .lean();

  res.render("listings/chatList.ejs", { listing, chats });
});

// Chat route - Base (for guest)
app.get("/listings/:id/chat", isLoggedInMiddleware, async (req, res) => {
  const listing = await Listing.findById(req.params.id).populate("owner").lean();
  if (!listing) { req.flash("error", "Listing not found."); return res.redirect("/listings"); }

  const guestId = req.user._id;
  let chat = await Chat.findOneAndUpdate(
    { listing: req.params.id, guest: guestId },
    { $set: { unreadByGuest: false } },
    { new: true }
  )
    .populate("guest", "username")
    .populate("messages.sender", "username")
    .lean();

  let acceptedCheckoutUrl = null;
  if (chat) {
    // ... (rest of the logic remains same)
    const acceptedMsg = [...chat.messages].reverse().find(m => m.type === 'offer' && m.offerDetails.status === 'accepted');
    if (acceptedMsg) {
      const Booking = require("./models/booking.js");
      const existingBooking = await Booking.findOne({ negotiatedOfferId: acceptedMsg.offerDetails.offerId });

      if (!existingBooking) {
        const crypto = require("crypto");
        const token = crypto.createHmac("sha256", process.env.SESSION_SECRET || "secret")
          .update(`${acceptedMsg.offerDetails.offerId}${chat.guest._id || chat.guest}${acceptedMsg.offerDetails.price}`).digest("hex").slice(0, 16);
        acceptedCheckoutUrl = `/listings/${req.params.id}/bookings?negotiated=1&offerId=${acceptedMsg.offerDetails.offerId}&offerToken=${token}`;
      }
    }
  }

  res.render("listings/chat.ejs", { listing, chat, guestId, acceptedCheckoutUrl });
});

// Chat route - Specific Guest (for owner)
app.get("/listings/:id/chat/:guestId", isLoggedInMiddleware, async (req, res) => {
  const listing = await Listing.findById(req.params.id).populate("owner").lean();
  if (!listing) { req.flash("error", "Listing not found."); return res.redirect("/listings"); }

  const guestId = req.params.guestId;
  let chat = await Chat.findOneAndUpdate(
    { listing: req.params.id, guest: guestId },
    { $set: { unreadByHost: false } },
    { new: true }
  )
    .populate("guest", "username")
    .populate("messages.sender", "username")
    .lean();

  let acceptedCheckoutUrl = null;
  res.render("listings/chat.ejs", { listing, chat, guestId, acceptedCheckoutUrl });
});

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

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`✅ Server is listening on port ${PORT}`);
});

// Handle port-already-in-use gracefully (local dev only)
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n❌ Port ${PORT} is already in use!`);
    console.error(`   Fix: npm run kill   OR   npx kill-port ${PORT}\n`);
    process.exit(1);
  } else {
    console.error("[Server Error]:", err.message);
  }
});

// ═══════════════════════════════════════════════════════════════
// 🔁 GRACEFUL SHUTDOWN — for Render deploys & local Ctrl+C
//    Render sends SIGTERM before restarting. We wait for ongoing
//    requests to finish before closing so no work is lost.
// ═══════════════════════════════════════════════════════════════
function gracefulShutdown(signal) {
  console.log(`\n[Shutdown] ${signal} received. Closing server gracefully...`);

  // Stop accepting new connections
  server.close(async () => {
    console.log("[Shutdown] HTTP server closed.");

    try {
      // Close MongoDB connection cleanly
      await mongoose.connection.close();
      console.log("[Shutdown] MongoDB connection closed.");
    } catch (err) {
      console.error("[Shutdown] MongoDB close error:", err.message);
    }

    console.log("[Shutdown] All done. Exiting.");
    process.exit(0);
  });

  // Force exit after 10s if something hangs (safety net)
  setTimeout(() => {
    console.error("[Shutdown] Forced exit after timeout.");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM")); // Render sends this
process.on("SIGINT", () => gracefulShutdown("SIGINT"));  // Ctrl+C locally
