/**
 * Wallet Controller
 */

const crypto = require("crypto");
const Wallet = require("../models/wallet.js");
const User   = require("../models/user.js");

// ─── Generate unique 6-char refer code ───────────────────────────────────────
const genReferCode = () =>
  crypto.randomBytes(3).toString("hex").toUpperCase();

// ─── Ensure wallet exists (called after every login/register) ─────────────────
const ensureWallet = async (userId) => {
  let wallet = await Wallet.findOne({ user: userId });
  
  // If wallet doesn't exist OR it exists but has no referCode (for old users)
  if (!wallet || !wallet.referCode) {
    let code = genReferCode();
    // Ensure uniqueness
    let attempts = 0;
    while (await Wallet.findOne({ referCode: code }) && attempts < 5) {
      code = genReferCode();
      attempts++;
    }

    if (!wallet) {
      wallet = await Wallet.create({ user: userId, referCode: code });
    } else {
      wallet.referCode = code;
      await wallet.save();
    }
    
    // Also save code on user doc for easy access
    await User.findByIdAndUpdate(userId, { referCode: code });
  }
  return wallet;
};

// ─── GET /wallet ──────────────────────────────────────────────────────────────
const showWallet = async (req, res) => {
  const wallet = await ensureWallet(req.user._id);
  res.render("users/wallet.ejs", { wallet });
};

// ─── POST /wallet/refer – apply referral code ─────────────────────────────────
const applyReferral = async (req, res) => {
  const { code } = req.body;
  const currentUser = req.user;

  if (currentUser.referredBy) {
    req.flash("error", "You have already used a referral code.");
    return req.session.save(() => res.redirect("/wallet"));
  }

  const referrerWallet = await Wallet.findOne({ referCode: code.trim().toUpperCase() });
  if (!referrerWallet) {
    req.flash("error", "Invalid referral code.");
    return req.session.save(() => res.redirect("/wallet"));
  }

  if (String(referrerWallet.user) === String(currentUser._id)) {
    req.flash("error", "You cannot use your own referral code.");
    return req.session.save(() => res.redirect("/wallet"));
  }

  // Credit current user 25 welcome coins (Immediate bonus for applying code)
  await Wallet.credit(currentUser._id, 25, "Welcome bonus for using a referral code");

  // Mark this user as referred (Referrer will earn 50 coins after this user's first booking)
  await User.findByIdAndUpdate(currentUser._id, { referredBy: referrerWallet.user });

  req.flash("success", "Referral applied! You earned 25 bonus coins 🎉");
  req.session.save(() => res.redirect("/wallet"));
};

module.exports = { showWallet, applyReferral, ensureWallet };
