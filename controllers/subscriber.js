const Subscriber = require("../models/subscriber");
const Notification = require("../models/notification");
const nodemailer = require("nodemailer");

exports.subscribe = async (req, res) => {
  const { email } = req.body;
  const isAJAX = req.xhr || (req.headers.accept && req.headers.accept.includes("application/json"));

  if (!email) {
    if (isAJAX) return res.status(400).json({ success: false, error: "Email is required!" });
    req.flash("error", "Email is required!");
    return req.session.save(() => res.redirect(req.get("Referer") || "/listings"));
  }

  // Only allow Gmail addresses
  if (!/^([a-zA-Z0-9._%+-]+)@gmail\.com$/.test(email)) {
    if (isAJAX) return res.status(400).json({ success: false, error: "Only Gmail addresses are allowed." });
    req.flash("error", "Only Gmail addresses are allowed for subscription.");
    return req.session.save(() => res.redirect(req.get("Referer") || "/listings"));
  }

  try {
    await Subscriber.create({ email });

    // Background Email Processing
    const userId = req.user ? req.user._id : null;
    setImmediate(async () => {
      try {
        if (userId) {
          await Notification.create({
            user: userId,
            message: "Thank you for subscribing to Wanderlust updates!",
            type: "info",
          });
        }
        // ... (nodemailer code remains same)
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
          port: process.env.SMTP_PORT == '465' ? 2525 : (parseInt(process.env.SMTP_PORT) || 2525),
          secure: false,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
        await transporter.sendMail({
          from: process.env.CONTACT_EMAIL_RECEIVER || process.env.SMTP_USER,
          to: email,
          subject: "Subscription Confirmed",
          text: `Thank you for subscribing to Wanderlust updates!`,
        });
      } catch (e) { console.error("Email failed:", e.message); }
    });

    if (isAJAX) {
      return res.json({
        success: true,
        message: "Successfully subscribed! Check your email."
      });
    }

    req.flash("success", "Your subscription has been successfully completed.");
    req.session.justSubscribed = true;
    req.session.save(() => res.redirect(req.get("Referer") || "/listings"));

  } catch (err) {
    let errorMsg = "Subscription failed.";
    if (err.code === 11000) errorMsg = "This email is already subscribed.";

    if (isAJAX) return res.status(400).json({ success: false, error: errorMsg });

    req.flash("error", errorMsg);
    req.session.save(() => res.redirect(req.get("Referer") || "/listings"));
  }
};
