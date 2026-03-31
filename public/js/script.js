// Example starter JavaScript for disabling form submissions if there are invalid fields
(() => {
  "use strict";

  // Fetch all the forms we want to apply custom Bootstrap validation styles to
  const forms = document.querySelectorAll(
    ".needs-validation",
  );

  // Centralized confirmation handler for all forms with data-confirm attribute
  document.addEventListener("submit", (event) => {
    const form = event.target;
    const confirmMessage = form.getAttribute("data-confirm");

    if (confirmMessage) {
      if (!confirm(confirmMessage)) {
        event.preventDefault();
        event.stopImmediatePropagation(); // Prevent other listeners from firing (like submit-guard)
      }
    }
  }, true); // Use capture phase to ensure it runs before other handlers

  // Loop over them and prevent submission
  Array.from(forms).forEach((form) => {
    form.addEventListener(
      "submit",
      (event) => {
        if (!form.checkValidity()) {
          event.preventDefault();
          event.stopPropagation();
        }

        form.classList.add("was-validated");
      },
      false,
    );
  });
})();

// ==============================
// ✅ WISHLIST (DB BASED ADD-ON)
// ==============================

window.toggleHeart = async function (event, btn) {
  event.preventDefault();
  event.stopPropagation();

  const id = btn.dataset.id;
  const icon = btn.querySelector("i");

  // Get CSRF token from meta tag
  const csrfMeta = document.querySelector('meta[name="csrf-token"]');
  const csrfToken = csrfMeta ? csrfMeta.getAttribute("content") : "";

  // Understand current state
  const isCurrentlyActive = btn.classList.contains("active");

  // ⚡ Optimistic UI Update (Change instantly!)
  if (isCurrentlyActive) {
    btn.classList.remove("active");
    icon.className = "fa-regular fa-heart";
  } else {
    btn.classList.add("active");
    icon.className = "fa-solid fa-heart";
  }

  // Background Network Request
  try {
    const response = await fetch(`/listings/${id}/wishlist`, {
      method: isCurrentlyActive ? "DELETE" : "POST",
      headers: {
        "CSRF-Token": csrfToken,
      },
    });

    if (!response.ok) {
      throw new Error("Server rejected wishlist update");
    }
  } catch (err) {
    console.error("Wishlist toggle error:", err);
    // ⏪ Revert UI update if network failed
    if (isCurrentlyActive) {
      btn.classList.add("active");
      icon.className = "fa-solid fa-heart";
    } else {
      btn.classList.remove("active");
      icon.className = "fa-regular fa-heart";
    }
    alert("Failed to update wishlist. Please try again or login first.");
  }
};
