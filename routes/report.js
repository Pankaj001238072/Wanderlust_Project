const express = require("express");
const router = express.Router();
const Report = require("../models/report");
const nodemailer = require("nodemailer");
const axios = require("axios");

// GET
router.get("/", (req, res) => {
  return res.render("report");
});

// POST
router.post("/", async (req, res) => {
  const {
    reason,
    description,
    email,
    "g-recaptcha-response": recaptcha,
  } = req.body;

  const secret = process.env.RECAPTCHA_SECRET_KEY;

  // 🔴 STEP 1: CAPTCHA must be filled
  if (!recaptcha) {
    return res.status(400).render("error", {
      message: "Please complete the CAPTCHA ❌",
    });
  }

  // 🔴 STEP 2: Verify CAPTCHA
  try {
    const verifyUrl = "https://www.google.com/recaptcha/api/siteverify";

    const params = new URLSearchParams();
    params.append("secret", secret);
    params.append("response", recaptcha);

    const response = await axios.post(verifyUrl, params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 10000,
    });

    if (!response.data.success) {
      return res.status(400).render("error", {
        message: "reCAPTCHA verification failed. Please try again.",
      });
    }

  } catch (err) {
    console.error("reCAPTCHA verification error:", err);
    return res.status(400).render("error", {
      message: "reCAPTCHA verification failed. Please try again.",
    });
  }

  // 🔴 STEP 3: Gmail validation
  if (
    email &&
    !/^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(email)
  ) {
    return res.status(400).render("error", {
      message: "Only gmail.com email addresses are allowed.",
    });
  }

  try {
    // ✅ Save to DB first
    const report = new Report({
      reason,
      description,
      email,
    });

    await report.save();

    // Send email in background (non-blocking) — keeps submit instant
    setImmediate(async () => {
      try {
        console.log("DEBUG: Attempting to send report email via Brevo...");
        console.log("DEBUG: SMTP_HOST:", process.env.SMTP_HOST);
        console.log("DEBUG: RECEIVER:", process.env.CONTACT_EMAIL_RECEIVER);

        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
          port: process.env.SMTP_PORT == '465' ? 2525 : (parseInt(process.env.SMTP_PORT) || 2525),
          secure: false, // true for 465, false for other ports like 587
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        console.log("DEBUG: Report transporter created. Sending mail...");
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: process.env.CONTACT_EMAIL_RECEIVER,
          subject: "🚨 New Report Submission",
          text: `New Report Received:\n\nReason: ${reason}\nDescription: ${description}\nEmail: ${email || "N/A"}`,
        });

        console.log("✅ Report email sent successfully.");
      } catch (mailErr) {
        console.error("❌ Report email sending failed:", mailErr.message);
        console.error("DEBUG: Full error stack:", mailErr.stack);
      }
    });

    // Always return success after DB save
    return res.render("report-success", { reason });

  } catch (err) {
    console.error("Report form DB error:", err);
    return res.status(500).render("error", {
      message: "Sorry, something went wrong. Please try again later.",
    });
  }
});

module.exports = router;