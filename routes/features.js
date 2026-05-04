/**
 * API Routes for Premium Features
 *
 *  GET  /api/listings/near      – geospatial "Near Me" search
 *  GET  /api/listings/price     – dynamic price calculation
 *  GET  /api/weather            – weather + smart recommendations
 *  GET  /api/wallet             – current user's wallet balance
 *  POST /api/wallet/redeem      – redeem coins at checkout
 */

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Listing = require("../models/listing.js");
const Booking = require("../models/booking.js");
const Wallet = require("../models/wallet.js");
const { computeDynamicPrice } = require("../helpers/dynamicPricing.js");
const { getWeatherForCity, getWeatherScore } = require("../helpers/weatherHelper.js");

// ─── Auth Guard ───────────────────────────────────────────────────────────────
const isLoggedIn = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ error: "Login required" });
};

// ─── 1. Geospatial Near Me ────────────────────────────────────────────────────
/**
 * GET /api/listings/near?lat=28.6&lng=77.2&km=10&limit=20
 */
router.get("/listings/near", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const km = parseFloat(req.query.km) || 10;
    const limit = parseInt(req.query.limit) || 20;

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: "lat and lng are required." });
    }

    const today = new Date();
    const listings = await Listing.find({
      geometry: {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: km * 1000,
        },
      },
    }).limit(limit).lean();

    // ✅ ATTACH DYNAMIC PRICE
    for (let l of listings) {
      const { finalPrice, breakdown } = computeDynamicPrice(l.price, today, true);
      l.dynamicPrice = finalPrice;
      l.pricingBreakdown = breakdown;
    }

    res.json({ count: listings.length, listings });
  } catch (e) {
    console.error("[Near Me]", e.message);
    res.status(500).json({ error: "Could not fetch nearby listings." });
  }
});

// ─── 2. Dynamic Price Preview ─────────────────────────────────────────────────
/**
 * GET /api/listings/price?listingId=xxx&checkIn=2025-12-25
 */
router.get("/listings/price", async (req, res) => {
  try {
    const { listingId, checkIn } = req.query;
    if (!listingId || !checkIn) {
      return res.status(400).json({ error: "listingId and checkIn required." });
    }

    // ✅ Validate ObjectId BEFORE querying DB
    if (!mongoose.Types.ObjectId.isValid(listingId)) {
      return res.status(400).json({ error: "Invalid listingId format." });
    }

    const listing = await Listing.findById(listingId).lean();
    if (!listing) return res.status(404).json({ error: "Listing not found." });

    const checkInDate = new Date(checkIn);
    if (isNaN(checkInDate.getTime())) {
      return res.status(400).json({ error: "Invalid checkIn date." });
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    const nearBooking = await Booking.findOne({
      listing: listing._id,
      status: "confirmed",
      checkIn: { $lte: tomorrow },
      checkOut: { $gte: new Date() },
    });
    const isAvailableToday = !nearBooking;

    const { finalPrice, breakdown, multiplier } = computeDynamicPrice(
      listing.price,
      checkInDate,
      isAvailableToday,
    );

    let finalMultiplier = multiplier || 1;

    // 🤝 CHECK FOR ACTIVE GENERAL OFFERS (Promotional Discounts)
    const Offer = require("../models/offer");
    const activeOffer = await Offer.findOne({ 
      listing: listing._id, 
      validTill: { $gte: new Date().setHours(0,0,0,0) } 
    }).lean();

    if (activeOffer) {
      finalMultiplier -= (activeOffer.discount / 100);
      breakdown.push({ 
        label: `Promotional Offer 🎉`, 
        change: `-${activeOffer.discount}%`, 
        color: "success" 
      });
    }

    const listingFinalPrice = Math.round(listing.price * Math.max(0.1, finalMultiplier));

    res.json({ basePrice: listing.price, finalPrice: listingFinalPrice, breakdown, isAvailableToday });
  } catch (e) {
    console.error("[Dynamic Price]", e.message);
    res.status(500).json({ error: "Could not compute price." });
  }
});

// ─── 3. Weather + Smart Recommendations ──────────────────────────────────────
/**
 * GET /api/weather?city=Manali&limit=10
 */
router.get("/weather", async (req, res) => {
  try {
    const city = req.query.city;
    const limit = parseInt(req.query.limit) || 10;

    if (!city) return res.status(400).json({ error: "city is required." });

    const weather = await getWeatherForCity(city);
    if (weather.error && !weather.condition) {
      return res.status(500).json({ error: weather.error });
    }

    let listings = await Listing.find({
      $or: [
        { location: { $regex: city, $options: "i" } },
        { country: { $regex: city, $options: "i" } },
      ],
    }).limit(50).lean();

    // ✅ ATTACH DYNAMIC PRICE
    const today = new Date();
    for (let l of listings) {
      const { finalPrice, breakdown } = computeDynamicPrice(l.price, today, true);
      l.dynamicPrice = finalPrice;
      l.pricingBreakdown = breakdown;
    }

    if (weather.isBadWeather) {
      listings = listings
        .map((l) => ({ ...l, _weatherScore: getWeatherScore(l, true) }))
        .sort((a, b) => b._weatherScore - a._weatherScore);
    }

    res.json({ weather, listings: listings.slice(0, limit) });
  } catch (e) {
    console.error("[Weather]", e.message);
    res.status(500).json({ error: "Could not fetch weather data." });
  }
});

// ─── 4. Wallet Balance ────────────────────────────────────────────────────────
router.get("/wallet", isLoggedIn, async (req, res) => {
  let wallet = await Wallet.findOne({ user: req.user._id }).lean();
  if (!wallet) wallet = { balance: 0, transactions: [], referCode: null };
  res.json({ balance: wallet.balance, transactions: wallet.transactions.slice(-20), referCode: wallet.referCode });
});

// ─── 5. Redeem Wallet Coins ───────────────────────────────────────────────────
/**
 * POST /api/wallet/redeem
 * Body: { coins: number, bookingId: string }
 */
router.post("/wallet/redeem", isLoggedIn, async (req, res) => {
  const coins = parseInt(req.body.coins);
  const bookingId = req.body.bookingId;

  if (!coins || coins < 1) return res.status(400).json({ error: "Invalid coins amount." });

  const ok = await Wallet.debit(req.user._id, coins, `Redeemed at booking ${bookingId}`, bookingId);
  if (!ok) return res.status(400).json({ error: "Insufficient wallet balance." });

  res.json({ success: true, message: `${coins} coins redeemed successfully!` });
});

module.exports = router;
