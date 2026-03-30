module.exports = {
  ...require("./middlewares/auth"),
  ...require("./middlewares/ownership"),
  ...require("./middlewares/validation"),
};
