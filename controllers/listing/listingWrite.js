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
      return res.redirect("/listings/new");
    }

    if (!req.file) {
      req.flash("error", "Image upload is required.");
      return res.redirect("/listings/new");
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
      return res.redirect("/login");
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
    res.redirect("/listings");
  } catch (err) {
    if (req.file) await deleteLocalFile(req.file);

    req.flash(
      "error",
      err.message || "Something went wrong.",
    );
    res.redirect("/listings/new");
  }
};

const updateListing = async (req, res) => {
  const { id } = req.params;

  const listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Listing not found.");
    return res.redirect("/listings");
  }

  const newCountry = req.body.listing.country?.trim();
  const newLocation = req.body.listing.location?.trim();

  if (
    newCountry &&
    newLocation &&
    (newCountry !== listing.country ||
      newLocation !== listing.location)
  ) {
    try {
      // Parallelize geocoding and image compression if both are present
      if (req.file) {
        const path = require("path");
        const { compressImage } = require("../../helpers/imageHelper");
        const tempPath = req.file.path;
        const outputDir = path.dirname(tempPath);

        const [geoData, compressedPath] = await Promise.all([
          validateLocation(newCountry, newLocation),
          compressImage(tempPath, outputDir).catch(() => tempPath),
        ]);

        listing.geometry = geoData.geometry;

        // Image upload (optimization: handle it here if location also changed)
        if (listing.image?.filename) {
          await deleteImage(listing.image.filename);
        }
        const imageData = await uploadImage(compressedPath);
        await deleteLocalFile(req.file);
        if (compressedPath !== tempPath) {
          await deleteLocalFile(compressedPath);
        }
        listing.image = imageData;
        req.file = null; // Mark handled
      } else {
        const geoData = await validateLocation(newCountry, newLocation);
        listing.geometry = geoData.geometry;
      }
    } catch (err) {
      req.flash("error", err.message);
      return res.redirect(`/listings/${id}/edit`);
    }
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
  } = req.body.listing;

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
  listing.country = newCountry;
  listing.location = newLocation;

  if (req.file) {
    try {
      if (listing.image?.filename) {
        await deleteImage(listing.image.filename);
      }
      const path = require("path");
      const { compressImage } = require("../../helpers/imageHelper");
      const tempPath = req.file.path;
      const outputDir = path.dirname(tempPath);
      const compressedPath = await compressImage(tempPath, outputDir).catch(() => tempPath);
      
      const imageData = await uploadImage(compressedPath);
      await deleteLocalFile(req.file);
      if (compressedPath !== tempPath) {
        await deleteLocalFile(compressedPath);
      }
      listing.image = imageData;
    } catch (err) {
      await deleteLocalFile(req.file);
      req.flash("error", "Image upload failed.");
      return res.redirect(`/listings/${id}/edit`);
    }
  }

  await listing.save();

  req.flash("success", "Listing updated successfully!");
  res.redirect(`/listings/${id}`);
};

module.exports = {
  createListing,
  updateListing,
};
