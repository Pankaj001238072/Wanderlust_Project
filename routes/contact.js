const express = require("express");
const router = express.Router();
const Contact = require("../models/contact");
const nodemailer = require("nodemailer");
const axios = require("axios");

router.get("/", (req, res) => {
  return res.render("contact");
});

router.post("/", async (req, res) => {
  const {
    name,
    email,
    message,
    "g-recaptcha-response": recaptcha,
  } = req.body;

  // 🔴 STEP 1: CAPTCHA must be filled
  if (!recaptcha) {
    return res.status(400).render("error", {
      message: "Please complete the CAPTCHA ❌",
    });
  }

  // 🔴 STEP 2: Verify reCAPTCHA
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  try {
    const verifyUrl = "https://www.google.com/recaptcha/api/siteverify";
    
    // Better to send as form data in the body
    const params = new URLSearchParams();
    params.append("secret", secret);
    params.append("response", recaptcha);

    const response = await axios.post(verifyUrl, params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 10000, // 10s wait for google recaptcha
    });

    if (!response.data.success) {
      return res.status(400).render("error", {
        message: "reCAPTCHA verification failed. Please try again.",
      });
    }
  } catch (err) {
    console.error("reCAPTCHA verification error:", err);
    return res.status(400).render("error", {
      message:
        "reCAPTCHA verification failed. Please try again.",
    });
  }

  // Email format validation (backend)
  const emailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
  if (!emailRegex.test(email)) {
    return res.status(400).render("error", {
      message:
        "Only gmail.com email addresses are allowed.",
    });
  }

  try {
    // Save to database first
    const contact = new Contact({ name, email, message });
    await contact.save();

    // Send email in background (non-blocking) — keeps submit instant
    setImmediate(async () => {
      try {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.CONTACT_EMAIL_USER,
            pass: process.env.CONTACT_EMAIL_PASS,
          },
        });

        await transporter.sendMail({
          from: process.env.CONTACT_EMAIL_USER,
          to: process.env.CONTACT_EMAIL_RECEIVER || process.env.CONTACT_EMAIL_USER,
          subject: "New Contact Form Submission",
          text: `Name: ${name}\nEmail: ${email}\nMessage: ${message}`,
        });

        console.log("Contact email sent successfully.");
      } catch (mailErr) {
        console.error("Contact email sending failed:", mailErr.message);
      }
    });

    // Always return success after DB save — email is background task
    return res.render("contact-success", { name });
  } catch (err) {
    console.error("Contact form DB error:", err);
    return res.status(500).render("error", {
      message:
        "Sorry, something went wrong. Please try again later.",
    });
  }
});

module.exports = router;
