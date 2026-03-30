const profileUpdateSchema = require("../schemas/profileUpdate");
const ExpressError = require("../utils/ExpressError");
const {
  deleteLocalFile,
} = require("../helpers/fileHelper");
const path = require("path");

const validateProfileUpdate = async (req, res, next) => {
  const { error } = profileUpdateSchema.validate(req.body);
  if (error) {
    // Clean up uploaded file if present
    if (req.file) {
      await deleteLocalFile(req.file);
    }
    const errMsg = error.details
      .map((el) => el.message)
      .join(", ");
    req.flash("error", errMsg);
    return res.redirect("/profile/edit");
  }
  next();
};

module.exports = { validateProfileUpdate };
