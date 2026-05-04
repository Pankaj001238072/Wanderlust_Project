module.exports = {
  startCheckout: require("./booking/startCheckout"),
  renderCheckout: require("./booking/renderCheckout"),
  ...require("./booking/payment"),
  updatePaymentIntent: require("./booking/updatePaymentIntent"),
  ...require("./booking/bookingActions"),
};
