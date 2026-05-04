// Works for both async functions (returns a Promise) and
// regular sync functions (returns undefined).
// Calling .catch() on undefined crashes in Express 5 — this guards that.
module.exports = (fn) => {
  return (req, res, next) => {
    try {
      const result = fn(req, res, next);
      if (result && typeof result.catch === "function") {
        result.catch(next);
      }
    } catch (err) {
      next(err);
    }
  };
};