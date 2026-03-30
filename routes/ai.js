const express = require("express");
const router = express.Router();
const aiChatController = require("../controllers/aiChat");
const wrapAsync = require("../utils/wrapAsync");

router.post("/chat", wrapAsync(aiChatController.chatWithAI));

module.exports = router;
