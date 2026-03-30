// Responsive captcha for signup and login page with refresh button
window.addEventListener("DOMContentLoaded", function () {
  // Signup form
  const signupForm = document.querySelector(
    'form[action="/signup"]',
  );
  if (signupForm) {
    let a = Math.floor(Math.random() * 10) + 1;
    let b = Math.floor(Math.random() * 10) + 1;
    const captchaWrap = document.createElement("div");
    captchaWrap.className = "mb-3 captcha-wrap";
    captchaWrap.innerHTML = `
      <label class="form-label">Captcha: <span id="signup-captcha-question"></span></label>
      <button type="button" id="signup-captcha-refresh" style="margin-left:8px;padding:2px 8px;font-size:1.1em;line-height:1;">&#x21bb;</button>
      <input type="text" class="form-control" id="signup-captcha-answer" placeholder="Answer" required style="margin-top:6px;" />
      <div class="invalid-feedback">Wrong answer, try again!</div>
    `;
    signupForm.insertBefore(
      captchaWrap,
      signupForm.querySelector("button"),
    );
    const captchaQ = captchaWrap.querySelector(
      "#signup-captcha-question",
    );
    const refreshBtn = captchaWrap.querySelector(
      "#signup-captcha-refresh",
    );
    function setCaptcha() {
      a = Math.floor(Math.random() * 10) + 1;
      b = Math.floor(Math.random() * 10) + 1;
      captchaQ.textContent = `${a} + ${b} = ?`;
      captchaWrap.querySelector(
        "#signup-captcha-answer",
      ).value = "";
      captchaWrap
        .querySelector("#signup-captcha-answer")
        .classList.remove("is-invalid");
    }
    setCaptcha();
    refreshBtn.addEventListener("click", setCaptcha);
    signupForm.addEventListener("submit", function (e) {
      const ans = captchaWrap.querySelector(
        "#signup-captcha-answer",
      ).value;
      if (parseInt(ans) !== a + b) {
        e.preventDefault();
        captchaWrap
          .querySelector("#signup-captcha-answer")
          .classList.add("is-invalid");
      } else {
        captchaWrap
          .querySelector("#signup-captcha-answer")
          .classList.remove("is-invalid");
      }
    });
  }

  // Login form (optional, can add refresh similarly if needed)
  const loginForm = document.querySelector(
    'form[action="/login"]',
  );
  if (loginForm) {
    let a = Math.floor(Math.random() * 10) + 1;
    let b = Math.floor(Math.random() * 10) + 1;
    const captchaWrap = document.createElement("div");
    captchaWrap.className = "mb-3 captcha-wrap";
    captchaWrap.innerHTML = `
      <label class="form-label">Captcha: <span id="login-captcha-question"></span></label>
      <button type="button" id="login-captcha-refresh" style="margin-left:8px;padding:2px 8px;font-size:1.1em;line-height:1;">&#x21bb;</button>
      <input type="text" class="form-control" id="login-captcha-answer" placeholder="Answer" required style="margin-top:6px;" />
      <div class="invalid-feedback">Wrong answer, try again!</div>
    `;
    loginForm.insertBefore(
      captchaWrap,
      loginForm.querySelector("button"),
    );
    const captchaQ = captchaWrap.querySelector(
      "#login-captcha-question",
    );
    const refreshBtn = captchaWrap.querySelector(
      "#login-captcha-refresh",
    );
    function setCaptcha() {
      a = Math.floor(Math.random() * 10) + 1;
      b = Math.floor(Math.random() * 10) + 1;
      captchaQ.textContent = `${a} + ${b} = ?`;
      captchaWrap.querySelector(
        "#login-captcha-answer",
      ).value = "";
      captchaWrap
        .querySelector("#login-captcha-answer")
        .classList.remove("is-invalid");
    }
    setCaptcha();
    refreshBtn.addEventListener("click", setCaptcha);
    loginForm.addEventListener("submit", function (e) {
      const ans = captchaWrap.querySelector(
        "#login-captcha-answer",
      ).value;
      if (parseInt(ans) !== a + b) {
        e.preventDefault();
        captchaWrap
          .querySelector("#login-captcha-answer")
          .classList.add("is-invalid");
      } else {
        captchaWrap
          .querySelector("#login-captcha-answer")
          .classList.remove("is-invalid");
      }
    });
  }
});
