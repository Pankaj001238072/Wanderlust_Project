const isLoggedIn = (req, res, next) => {
  if (!req.isAuthenticated()) {
    // Only save GET request URLs — POST/DELETE endpoints should not be redirected back to
    if (req.method === "GET") {
      req.session.redirectUrl = req.originalUrl;
    }
    req.flash(
      "error",
      "You must be logged in to access this page!",
    );
    return res.redirect("/login");
  }
  next();
};

const saveRedirectUrl = (req, res, next) => {
  if (req.session.redirectUrl) {
    res.locals.redirectUrl = req.session.redirectUrl;
    delete req.session.redirectUrl;
  }
  next();
};

const redirectIfLoggedIn = (req, res, next) => {
  if (req.isAuthenticated()) {
    req.flash("error", "You are already logged in!");
    return res.redirect("/listings");
  }
  next();
};

module.exports = {
  isLoggedIn,
  saveRedirectUrl,
  redirectIfLoggedIn,
};
