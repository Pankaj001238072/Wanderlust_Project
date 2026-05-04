const Listing = require("../../models/listing.js");
const Booking = require("../../models/booking.js");
const User = require("../../models/user");
const Offer = require("../../models/offer");


const index = async (req, res) => {
  const filter = {};
  let allListings;

  if (req.query.category) {
    filter.category = req.query.category;
  }

  if (req.query.search) {
    const searchQuery = req.query.search.trim();

    // Using MongoDB Atlas Search (Lucene) for high-performance searching
    const pipeline = [
      {
        $search: {
          index: "default", // The index name you created in Atlas
          text: {
            query: searchQuery,
            path: ["location", "country", "title"], // Searching across these fields
            fuzzy: { maxEdits: 1 } // Allows minor spelling mistakes
          }
        }
      }
    ];

    // If a category filter is also applied, add it to the pipeline
    if (filter.category) {
      pipeline.push({ $match: { category: filter.category } });
    }

    allListings = await Listing.aggregate(pipeline);
  } else {
    // Normal find query with lean for performance
    allListings = await Listing.find(filter).lean();
  }

  // ✅ WISHLIST LOGIC
  let wishlistIds = [];

  if (req.user) {
    const user = await User.findById(req.user._id).lean(); // Added .lean() here
    wishlistIds = user.wishlist.map(id => id.toString());
  }

  // ⚡ DYNAMIC PRICING FOR INDEX
  const { computeDynamicPrice } = require("../../helpers/dynamicPricing.js");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 🤝 Fetch active offers for all listings to show discounted price in gallery
  const activeOffers = await Offer.find({ validTill: { $gte: today } }).lean();
  const offerMap = {};
  activeOffers.forEach(o => { offerMap[o.listing.toString()] = o.discount; });

  if (allListings && allListings.length > 0) {
    const Booking = require("../../models/booking.js");
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 2);

    for (let listing of allListings) {
      // Check if room is available for next 2 days to qualify for Last-Minute Deal
      const nearBooking = await Booking.findOne({
        listing: listing._id,
        status: "confirmed",
        checkIn: { $lte: tomorrow },
        checkOut: { $gte: today },
      }).lean();
      
      const isAvailableToday = !nearBooking;
      const offerPercent = offerMap[listing._id.toString()] || 0;
      const { finalPrice, breakdown } = computeDynamicPrice(listing.price, today, isAvailableToday, offerPercent);
      listing.dynamicPrice = finalPrice;
      listing.pricingBreakdown = breakdown;
    }
  }

  // Rendering the index.ejs template and passing the filtered listings and selected category to the template for display
  res.render("listings/index.ejs", {
    allListings,
    selectedCategory: req.query.category || null,
    wishlistIds, // ✅ PASS TO FRONTEND
  });
};

const renderNewForm = (req, res) => {
  console.log(req.user);
  res.render("listings/new.ejs");
};

const mongoose = require("mongoose");
const showListing = async (req, res) => {
  const { id } = req.params;
  // Validate ObjectId
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    req.flash("error", "Invalid or missing listing ID!");
    return req.session.save(() => res.redirect("/listings"));
  }
  const listing = await Listing.findById(id)
    .populate({
      path: "reviews",
      populate: { path: "author" },
    })
    .populate("owner")
    .lean(); // Added .lean() 

  if (!listing) {
    req.flash(
      "error",
      "Listing you requested for does not exist!",
    );
    return res.redirect("/listings");
  }

  // 🧹 Auto-Cleanup expired pending split bookings before showing availability
  const { cleanupExpiredBookings } = require("../booking/cleanup");
  cleanupExpiredBookings().catch(err => console.error("Cleanup Error:", err));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ⏰ pending_split blocks dates for 60 minutes only (no faulty checkIn condition)
  const SPLIT_BLOCK_MS = 60 * 60 * 1000;
  const bookedDateRanges = await Booking.find({
    listing: listing._id,
    checkOut: { $gt: today },
    $or: [
      { status: "confirmed" },
      {
        status: "pending_split",
        createdAt: { $gte: new Date(Date.now() - SPLIT_BLOCK_MS) },
      }
    ]
  },
    { checkIn: 1, checkOut: 1, status: 1, user: 1 },
  )
    .sort({ checkIn: 1 })
    .lean();

  let currentUserBooking = null;
  let isWishlisted = false;

  if (req.user) {
    currentUserBooking = await Booking.findOne({
      listing: listing._id,
      user: req.user._id,
      status: "confirmed",
      checkOut: { $gte: today },
    }).sort({ createdAt: -1 });

    const user = await User.findById(req.user._id).lean(); // Added .lean() 
    isWishlisted = user.wishlist.some(id => id.toString() === listing._id.toString());
  }

  // 🤝 CHECK FOR ACTIVE GENERAL OFFERS (Promotional Discounts)
  const activeOffer = await Offer.findOne({ 
    listing: listing._id, 
    validTill: { $gte: today } 
  }).lean();
  const offerPercent = activeOffer ? activeOffer.discount : 0;

  // ⚡ DYNAMIC PRICING FOR SHOW PAGE (Unified Additive)
  const { computeDynamicPrice } = require("../../helpers/dynamicPricing.js");
  const { finalPrice, breakdown } = computeDynamicPrice(listing.price, today, true, offerPercent);
  
  listing.dynamicPrice = finalPrice;
  listing.pricingBreakdown = breakdown;

  // 🤝 ALSO CHECK FOR ACCEPTED NEGOTIATED OFFERS (Chat Negotiation)
  if (req.user) {
    const Chat = require("../../models/chat.js");
    const chat = await Chat.findOne({ listing: listing._id, guest: req.user._id }).lean();
    if (chat) {
      const acceptedOffer = chat.messages.find(m => m.offerDetails && m.offerDetails.status === 'accepted');
      if (acceptedOffer) {
        breakdown.push({ label: "Negotiated Offer ✅", change: "Special Rate", color: "info" });
      }
    }
  }

  res.render("listings/show.ejs", {
    listing,
    currentUserBooking,
    bookedDateRanges,
    isWishlisted,
  });
};

const renderEditForm = async (req, res) => {
  const { id } = req.params;
  const listing = await Listing.findById(id);

  if (!listing) {
    req.flash(
      "error",
      "Listing you requested for does not exist!",
    );
    return res.redirect("/listings");
  }

  let originalImageUrl = listing.image.url;
  originalImageUrl = originalImageUrl.replace(
    "/upload",
    "/upload/h_300,w_250,e_blur:100",
  );

  res.render("listings/edit.ejs", {
    listing,
    originalImageUrl,
    imgClass: "edit-page-img",
  });
};

const userWishlist = async (req, res) => {
  const user = await User.findById(req.user._id).populate("wishlist").lean();
  const allListings = user.wishlist;
  const wishlistIds = allListings.map((listing) => listing._id.toString());

  // ⚡ DYNAMIC PRICING FOR WISHLIST
  const { computeDynamicPrice } = require("../../helpers/dynamicPricing.js");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeOffers = await Offer.find({ validTill: { $gte: today } }).lean();
  const offerMap = {};
  activeOffers.forEach(o => { offerMap[o.listing.toString()] = o.discount; });

  if (allListings && allListings.length > 0) {
    for (let listing of allListings) {
      const offerPercent = offerMap[listing._id.toString()] || 0;
      const { finalPrice, breakdown } = computeDynamicPrice(listing.price, today, true, offerPercent);
      listing.dynamicPrice = finalPrice;
      listing.pricingBreakdown = breakdown;
    }
  }

  res.render("listings/index.ejs", {
    allListings,
    selectedCategory: "wishlist",
    wishlistIds,
  });
};

module.exports = {
  index,
  renderNewForm,
  showListing,
  renderEditForm,
  userWishlist,
};
