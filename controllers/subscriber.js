const Subscriber = require("../models/subscriber");
const Notification = require("../models/notification");
const nodemailer = require("nodemailer");

exports.subscribe = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    req.flash("error", "Email is required!");
    return res.redirect(req.get("Referer") || "/listings");
  }
  // Only allow Gmail addresses
  if (!/^([a-zA-Z0-9._%+-]+)@gmail\.com$/.test(email)) {
    req.flash(
      "error",
      "Only Gmail addresses are allowed for subscription.",
    );
    return res.redirect(req.get("Referer") || "/listings");
  }
  try {
    await Subscriber.create({ email });
    req.flash(
      "success",
      "Your subscription has been successfully completed. Please check your email to confirm your subscription.",
    );
    req.session.justSubscribed = true;
    return res.redirect(req.get("Referer") || "/listings");
    
    // Capture user id if explicitly logged in
    const userId = req.user ? req.user._id : null;

    // Send confirmation email in background
    setImmediate(async () => {
      try {
        if (userId) {
          await Notification.create({
            user: userId,
            message: "Thank you for subscribing to Wanderlust updates! You'll now receive the latest news and offers.",
            type: "info",
          });
        }

        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
          port: process.env.SMTP_PORT == '465' ? 2525 : (parseInt(process.env.SMTP_PORT) || 2525),
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: email,
          subject: "Subscription Confirmed",
          text: `Thank you for subscribing to Wanderlust updates! You'll now receive the latest news and offers.`,
        });
      } catch (e) {}
    });
  } catch (err) {
    if (err.code === 11000) {
      req.flash(
        "error",
        "This email is already subscribed.",
      );
    } else {
      req.flash("error", "Subscription failed.");
    }
    return res.redirect(req.get("Referer") || "/listings");
  }
};
