const Listing = require("../../models/listing.js");
const Booking = require("../../models/booking.js");
const User = require("../../models/user"); 


const index = async (req, res) => {
  const filter = {};

  if (req.query.search) {
    filter.$or = [
      {
        location: {
          $regex: req.query.search,
          $options: "i",
        },
      },
      {
        country: {
          $regex: req.query.search,
          $options: "i",
        },
      },
    ];
  }

  if (req.query.category) {
    filter.category = req.query.category;
  }

  const allListings = await Listing.find(filter).lean();

 // ✅ WISHLIST LOGIC
  let wishlistIds = [];

  if (req.user) {
    const user = await User.findById(req.user._id);
    wishlistIds = user.wishlist.map(id => id.toString());
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
    return res.redirect("/listings");
  }
  const listing = await Listing.findById(id)
    .populate({
      path: "reviews",
      populate: { path: "author" },
    })
    .populate("owner");

  if (!listing) {
    req.flash(
      "error",
      "Listing you requested for does not exist!",
    );
    return res.redirect("/listings");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const bookedDateRanges = await Booking.find(
    {
      listing: listing._id,
      status: "confirmed",
      checkOut: { $gte: today },
    },
    { checkIn: 1, checkOut: 1, user: 1 },
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

    const user = await User.findById(req.user._id);
    isWishlisted = user.wishlist.some(id => id.toString() === listing._id.toString());
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
  const user = await User.findById(req.user._id).populate("wishlist");
  const allListings = user.wishlist;
  const wishlistIds = allListings.map((listing) => listing._id.toString());

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
