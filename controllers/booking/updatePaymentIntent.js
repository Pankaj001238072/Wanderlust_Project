const { stripe } = require("./common");

const updatePaymentIntent = async (req, res) => {
  const { paymentIntentId, mode, fullAmount, splitWays = 2, coinsUsed = 0 } = req.body;

  if (!stripe || !paymentIntentId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const adjustedFullAmount = fullAmount - coinsUsed;
    const amount = mode === "split" 
      ? Math.round((adjustedFullAmount / splitWays) * 100) 
      : Math.round(adjustedFullAmount * 100);

    const updateData = { amount };
    if (req.body.selectedAddOns) {
      updateData.metadata = {
        selectedAddOns: JSON.stringify(req.body.selectedAddOns),
        totalPrice: String(fullAmount) // fullAmount already includes addonsTotal from client
      };
    }

    await stripe.paymentIntents.update(paymentIntentId, updateData);

    res.json({ success: true, newAmount: amount / 100 });
  } catch (error) {
    console.error("Stripe Update Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = updatePaymentIntent;
