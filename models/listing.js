const mongoose = require("mongoose"); // Import mongoose
const Schema = mongoose.Schema; // Create schema shortcut
const Review = require("./review.js"); // Import Review model

// Define schema
const listingSchema = new Schema({
  title: {
    type: String,
    required: true,
    index: true,
  },
  description: String,

  /* image: {
        url: {
            type: String,
            default: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=800&q=60", // 🖼️ Default image link
            set: (v) => v === "" ? undefined : v        // If empty string, set to undefined to use default

        },
        filename: {
            type: String,
            default: "defaultimage"
        }
    }, */

  image: {
    url: String,
    filename: String,
  },

  price: Number,
  baseGuests: {
    type: Number,
    default: 2,
    min: 1,
  },
  maxGuests: {
    type: Number,
    default: 4,
    min: 1,
  },
  maxKids: {
    type: Number,
    default: 2,
    min: 0,
  },
  maxInfants: {
    type: Number,
    default: 0,
    min: 0,
  },
  maxPets: {
    type: Number,
    default: 0,
    min: 0,
  },
  extraGuestFeePerNight: {
    type: Number,
    default: 0,
    min: 0,
  },
  location: {
    type: String,
    index: true,
  },
  country: {
    type: String,
    index: true,
  },
  reviews: [
    {
      type: Schema.Types.ObjectId,
      ref: "Review",
    },
  ],
  owner: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  geometry: {
    type: {
      type: String, //Don't do `{ location: { type: String } }`
      enum: ["Point"], // 'location.type' must be 'Point'
      required: true,
    },
    coordinates: {
      type: [Number],
      required: true,
    },
  },
  category: {
    type: String,
    enum: [
      "trending",
      "rooms",
      "iconic",
      "mountains",
      "castles",
      "pools",
      "camping",
      "farms",
      "arctic",
      "domes",
      "boats",
    ],
    index: true, // Speeds up filter queries
  },

  // 🌟 Amenities – for weather-based smart recommendations
  amenities: {
    type: [String],
    default: [],
  },

  // 🎁 Add-on Local Experiences (available at checkout)
  addOns: [
    {
      name: { type: String, required: true },
      price: { type: Number, required: true, min: 0 },
      icon: { type: String, default: "🎯" },
    },
  ],
});

// Middleware to delete associated reviews when a listing is deleted
listingSchema.post("findOneAndDelete", async (listing) => {
  if (listing) {
    await Review.deleteMany({
      _id: {
        $in: listing.reviews,
      },
    });
  }
});

// 🗺️ 2dsphere index for geospatial "Near Me" queries
listingSchema.index({ geometry: "2dsphere" });

// Create model
const Listing = mongoose.model("Listing", listingSchema);

// Export model
module.exports = Listing;
