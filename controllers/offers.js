const Offer = require("../models/offer");
const User = require("../models/user");
const nodemailer = require("nodemailer");

const Listing = require("../models/listing");
exports.createOffer = async (req, res) => {
  try {
    const { discount, validTill, listing } = req.body;
    // Check if listing exists
    const listingObj = await Listing.findById(listing);
    if (!listingObj) {
      req.flash("error", "Listing not found!");
      return res.redirect("/offer/new");
    }
    const offer = new Offer({
      title: listingObj.title,
      description: listingObj.description,
      discount,
      validTill,
      owner: req.user._id,
      listing,
    });
    await offer.save();

    // Notify newsletter subscribers in background to improve performance
    setImmediate(async () => {
      try {
        const Subscriber = require("../models/subscriber");
        const subscribers = await Subscriber.find({}, "email");
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
          port: process.env.SMTP_PORT == '465' ? 2525 : (parseInt(process.env.SMTP_PORT) || 2525),
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        for (const subscriber of subscribers) {
          try {
            await transporter.sendMail({
              from: process.env.SMTP_USER,
              to: subscriber.email,
              subject: "New Offer Available!",
              text: `New Offer: ${offer.title}\n${offer.description}\nDiscount: ${offer.discount}%\nValid Till: ${offer.validTill}`,
            });
          } catch (emailErr) {
            console.error("Email send error:", emailErr);
          }
        }
      } catch (backgroundErr) {
        console.error("Background email process error:", backgroundErr);
      }
    });

    res.redirect("/offer");
  } catch (err) {
    req.flash(
      "error",
      err.message || "Error creating offer",
    );
    res.redirect("/offer/new");
  }
};

exports.listOffers = async (req, res) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Set to start of today
  // Only show offers whose listing exists
  const offers = await Offer.find({
    validTill: { $gte: now },
  }).populate("listing");
  const filteredOffers = offers.filter(
    (offer) => offer.listing,
  );
  res.render("offers/index", { offers: filteredOffers });
};
