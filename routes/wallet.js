const express  = require("express");
const router   = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const { showWallet, applyReferral } = require("../controllers/wallet.js");

const isLoggedIn = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  req.flash("error", "You must be logged in.");
  return req.session.save(() => res.redirect("/login"));
};

router.get("/",       isLoggedIn, wrapAsync(showWallet));
router.post("/refer", isLoggedIn, wrapAsync(applyReferral));

module.exports = router;
