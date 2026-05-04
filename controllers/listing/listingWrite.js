const Listing = require("../../models/listing.js");
const {
  deleteLocalFile,
} = require("../../helpers/fileHelper");
const {
  uploadImage,
  deleteImage,
} = require("../../helpers/cloudHelper");
const {
  validateLocation,
} = require("../../helpers/mapHelper");

const createListing = async (req, res) => {
  try {
    const { country, location } = req.body.listing;

    if (!country || !location) {
      req.flash(
        "error",
        "Country and location are required.",
      );
      return req.session.save(() => res.redirect("/listings/new"));
    }

    if (!req.file) {
      req.flash("error", "Image upload is required.");
      return req.session.save(() => res.redirect("/listings/new"));
    }

    // Parallelize geocoding and image compression for speed
    const path = require("path");
    const { compressImage } = require("../../helpers/imageHelper");
    const tempPath = req.file.path;
    const outputDir = path.dirname(tempPath);

    const [geoData, compressedPath] = await Promise.all([
      validateLocation(country.trim(), location.trim()),
      compressImage(tempPath, outputDir).catch(() => tempPath),
    ]);

    const {
      title,
      description,
      price,
      category,
      baseGuests,
      maxGuests,
      maxKids,
      maxInfants,
      maxPets,
      extraGuestFeePerNight,
      addOns,
    } = req.body.listing;

    const newListing = new Listing({
      title,
      description,
      price,
      category,
      baseGuests,
      maxGuests,
      maxKids,
      maxInfants,
      maxPets,
      extraGuestFeePerNight,
      addOns: Array.isArray(addOns) ? addOns.filter(a => a.name) : [],
      country: country.trim(),
      location: location.trim(),
    });

    // Assign owner: only if user logged in
    if (req.user && req.user._id) {
      newListing.owner = req.user._id;
    } else {
      req.flash(
        "error",
        "You must be logged in to create a listing.",
      );
      return req.session.save(() => res.redirect("/login"));
    }

    // (Compression moved to parallel block above)
    const imageData = await uploadImage(compressedPath);
    await deleteLocalFile(req.file);
    if (compressedPath !== tempPath) {
      await deleteLocalFile(compressedPath);
    }

    newListing.image = imageData;
    newListing.geometry = geoData.geometry;

    await newListing.save();

    req.flash(
      "success",
      "New listing created successfully!",
    );
    req.session.save(() => res.redirect("/listings"));
  } catch (err) {
    if (req.file) await deleteLocalFile(req.file);

    req.flash(
      "error",
      err.message || "Something went wrong.",
    );
    req.session.save(() => res.redirect("/listings/new"));
  }
};

const updateListing = async (req, res) => {
  const { id } = req.params;

  const listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Listing not found.");
    return req.session.save(() => res.redirect("/listings"));
  }

  const {
    title,
    description,
    price,
    category,
    baseGuests,
    maxGuests,
    maxKids,
    maxInfants,
    maxPets,
    extraGuestFeePerNight,
    addOns,
    country: newCountry,
    location: newLocation,
  } = req.body.listing;

  // Prepare all parallel tasks
  const tasks = [];

  // Update non-async fields immediately
  listing.title = title;
  listing.description = description;
  listing.price = price;
  listing.category = category;
  listing.baseGuests = baseGuests;
  listing.maxGuests = maxGuests;
  listing.maxKids = maxKids;
  listing.maxInfants = maxInfants;
  listing.maxPets = maxPets;
  listing.extraGuestFeePerNight = extraGuestFeePerNight;
  
  if (addOns) {
    listing.addOns = Object.values(addOns).filter(a => a.name && a.price);
  } else {
    listing.addOns = [];
  }

  // 1. Geocoding Task
  if (newCountry && newLocation && (newCountry !== listing.country || newLocation !== listing.location)) {
    tasks.push(validateLocation(newCountry, newLocation).then(geo => {
      listing.geometry = geo.geometry;
      listing.country = newCountry;
      listing.location = newLocation;
    }));
  } else {
    listing.country = newCountry || listing.country;
    listing.location = newLocation || listing.location;
  }

  // 2. Image Processing Task
  if (req.file) {
    tasks.push((async () => {
      const path = require("path");
      const { compressImage } = require("../../helpers/imageHelper");
      const tempPath = req.file.path;
      const outputDir = path.dirname(tempPath);
      
      const compressedPath = await compressImage(tempPath, outputDir).catch(() => tempPath);
      
      // Delete old image in background - don't await it
      if (listing.image?.filename) {
        setImmediate(() => deleteImage(listing.image.filename).catch(e => console.error("Cloudinary delete failed:", e)));
      }

      const imageData = await uploadImage(compressedPath);
      
      // Cleanup local files in background
      setImmediate(() => {
        deleteLocalFile(req.file).catch(() => {});
        if (compressedPath !== tempPath) deleteLocalFile(compressedPath).catch(() => {});
      });
      
      listing.image = imageData;
    })());
  }

  try {
    // Run all async tasks (geocoding, image upload) in parallel
    await Promise.all(tasks);

    await listing.save();
    req.flash("success", "Listing updated successfully!");
    req.session.save(() => res.redirect(`/listings/${id}`));
  } catch (err) {
    if (req.file) await deleteLocalFile(req.file);
    req.flash("error", err.message);
    req.session.save(() => res.redirect(`/listings/${id}/edit`));
  }
};

module.exports = {
  createListing,
  updateListing,
};
