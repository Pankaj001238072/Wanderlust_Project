const Listing = require("../../models/listing.js");
const {
  deleteImage,
} = require("../../helpers/cloudHelper");

const destroyListing = async (req, res) => {
  const { id } = req.params;
  const listing = await Listing.findById(id);

  if (!listing) {
    req.flash("error", "Listing not found.");
    return res.redirect("/listings");
  }

  if (listing.image && listing.image.filename) {
    try {
      await deleteImage(listing.image.filename);
      console.log(
        "Cloudinary image deleted:",
        listing.image.filename,
      );
    } catch (err) {
      console.log(
        "Error deleting Cloudinary image:",
        err.message,
      );
    }
  }

  const deletedListing =
    await Listing.findByIdAndDelete(id);
  console.log("Listing deleted:", deletedListing);

  req.flash("success", "Listing Deleted!");
  res.redirect("/listings");
};

module.exports = {
  destroyListing,
};
