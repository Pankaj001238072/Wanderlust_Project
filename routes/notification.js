const express = require("express");
const router = express.Router();
const Notification = require("../models/notification");
const wrapAsync = require("../utils/wrapAsync");
const { isLoggedIn } = require("../middlewares/auth");

router.post("/mark-read", isLoggedIn, wrapAsync(async (req, res) => {
  await Notification.updateMany(
    { user: req.user._id, isRead: false },
    { isRead: true }
  );
  res.json({ success: true });
}));

module.exports = router;
