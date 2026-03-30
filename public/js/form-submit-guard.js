// Universal form submit guard for all forms
// Disables the submit button and changes its text to prevent double submissions

window.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("form").forEach(function (form) {

    // 🔥 agar form me captcha hai → skip guard (captcha forms apna khud handle karti hain)
    const hasCaptcha = form.querySelector(".g-recaptcha");
    if (hasCaptcha) return;

    // ✅ normal forms ke liye guard
    form.addEventListener("submit", function (event) {
      // 🛑 if the form submission was already cancelled (e.g. confirm() returned false)
      if (event.defaultPrevented) return;

      let submitBtn = form.querySelector(
        "button[type=submit], input[type=submit]"
      );

      if (submitBtn && !submitBtn.disabled) {
        submitBtn.disabled = true;

        let originalText =
          submitBtn.tagName === "BUTTON"
            ? submitBtn.innerText.trim().toLowerCase()
            : submitBtn.value.trim().toLowerCase();

        let newText = "Submitting...";

        if (originalText.includes("delete")) newText = "Deleting...";
        else if (originalText.includes("cancel")) newText = "Cancelling...";
        else if (originalText.includes("add")) newText = "Adding...";
        else if (originalText.includes("edit")) newText = "Editing...";
        else if (originalText.includes("create")) newText = "Creating...";
        else if (originalText.includes("send")) newText = "Sending...";
        else if (originalText.includes("save")) newText = "Saving...";
        else if (originalText.includes("search")) newText = "Searching...";

        if (submitBtn.tagName === "BUTTON") {
          submitBtn.innerText = newText;
        } else {
          submitBtn.value = newText;
        }
      }
    });

  });

  // ✅ Reset buttons on page show (back/forward browser navigation fix)
  window.addEventListener("pageshow", function () {
    document.querySelectorAll("button[type=submit], input[type=submit]").forEach(function (btn) {
      btn.disabled = false;
    });
  });
});