module.exports = {
  startCheckout: require("./booking/startCheckout"),
  renderCheckout: require("./booking/renderCheckout"),
  ...require("./booking/payment"),
  ...require("./booking/bookingActions"),
};
