// ================== REQUIRE SECTION ==================
const path = require("path");

// ✅ Load environment variables from ROOT folder
require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

const mongoose = require("mongoose");
const initData = require("./data.js");
const Listing = require("../models/listing.js");
const axios = require("axios");

// ================== CONFIG ==================
const dbUrl = process.env.ATLASDB_URL;
// const MONGO_URL = "mongodb://127.0.0.1:27017/wanderlust";
const mapToken = process.env.MAP_TOKEN;

// ✅ Safety check
if (!mapToken) {
  console.error("MAP_TOKEN missing in root .env file");
  console.log(
    "Please add: MAP_TOKEN=your_real_token in MAJORPROJECT/.env",
  );
  process.exit(1);
}

// ================== CONNECT TO DB ==================
async function main() {
  await mongoose.connect(dbUrl);
  // await mongoose.connect(MONGO_URL);
  console.log("Connected to DB");
}

main()
  .then(() => initDB())
  .catch((err) => console.log(err));

// ================== MAPTILER FUNCTION ==================
const getCoordinates = async (location, country) => {
  try {
    const query = `${location}, ${country}`;

    const response = await axios.get(
      `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json`,
      {
        params: {
          key: mapToken,
          limit: 1,
        },
      },
    );

    const features = response.data.features || [];

    if (features.length > 0) {
      return features[0].geometry.coordinates; // [longitude, latitude]
    }

    return null;
  } catch (err) {
    console.log(
      `Error for ${location}, ${country}: ${err.message}`,
    );
    return null;
  }
};

// ================== INIT DATABASE ==================
const initDB = async () => {
  await Listing.deleteMany({});
  console.log("🗑️ Old data deleted");

  // Find or create demo user for static owner assignment
  const User = require("../models/user.js");
  const demoUsername =
    process.env.DEMO_USER_USERNAME || "demo";
  const demoEmail =
    process.env.DEMO_USER_EMAIL || "demo@example.com";
  const demoPassword =
    process.env.DEMO_USER_PASSWORD || "demopassword";
  let demoUser = await User.findOne({
    username: demoUsername,
  });
  if (!demoUser) {
    demoUser = await User.register(
      new User({
        username: demoUsername,
        email: demoEmail,
      }),
      demoPassword,
    );
  }

  for (let obj of initData.data) {
    const coordinates = await getCoordinates(
      obj.location,
      obj.country,
    );

    if (coordinates) {
      obj.geometry = {
        type: "Point",
        coordinates: coordinates,
      };
      console.log(`${obj.location}: [${coordinates}]`);
    } else {
      console.log(`${obj.location}: Not found`);
    }

    // Owner assign
    obj.owner = demoUser._id;

    // Small delay (rate-limit safety)
    await new Promise((resolve) =>
      setTimeout(resolve, 300),
    );
  }

  await Listing.insertMany(initData.data);
  console.log(" Data initialized successfully!");

  mongoose.connection.close();
};

/* const mongoose = require("mongoose");  // Import mongoose
const initData = require("./data.js");  // Import initial data
const Listing = require("../models/listing.js");  // Import Listing model

const MONGO_URL = "mongodb://127.0.0.1:27017/wanderlust"; // MongoDB connection URL

main()  // Connect to MongoDB and initialize data
    .then(() => {
        console.log("connected to DB");
    })
    .catch((err) => {
        console.log(err);
    });

    async function main() {  // Async function to connect to MongoDB and initialize data
        await mongoose.connect(MONGO_URL);
    }

    const initDB = async () => {                // Function to initialize the database with sample data
        await Listing.deleteMany({});             // Clear existing listings
        initData.data=initData.data.map((obj) => ({
            ...obj,
            owner: "698de66d5b39119a84d3a1f0", // Set the owner field to a specific user ID for all listings
               // ✅ Dummy Geometry (Required for schema validation)
    geometry: {
          type: "Point",
          coordinates: [77.1025, 28.7041] // Default: Delhi coordinates
    }
        }));
        await Listing.insertMany(initData.data);   // Insert initial data
        console.log("data was initialized");
    };

    initDB();  // Call the function to initialize the database
 */
