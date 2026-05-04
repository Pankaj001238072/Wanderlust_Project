(() => {
  const utils = window.ListingBookingUtils;
  const createStateHandler = window.ListingBookingState;
  if (!utils || !createStateHandler) return;

  const root = document.getElementById(
    "bookingSectionData",
  );
  if (!root) return;

  const maxGuests = Number.parseInt(
    root.dataset.maxGuests || "4",
    10,
  );
  const maxKids = Number.parseInt(
    root.dataset.maxKids || "2",
    10,
  );
  const maxPets = Number.parseInt(
    root.dataset.maxPets || "0",
    10,
  );
  const maxInfants = Number.parseInt(
    root.dataset.maxInfants || "0",
    10,
  );
  const baseGuests = Number.parseInt(
    root.dataset.baseGuests || "2",
    10,
  );
  const extraGuestFeePerNight = Number(
    root.dataset.extraGuestFeePerNight || "0",
  );
  const offerPercent = Number(root.dataset.offerPercent || '0');
  const nightlyPrice = Number(
    root.dataset.nightlyPrice || "0",
  );
  const gstRate = 0.18;

  const refs = {
    guestPicker: document.getElementById("guestPicker"),
    guestPickerButton: document.getElementById(
      "guestPickerButton",
    ),
    guestPopover: document.getElementById("guestPopover"),
    guestSummaryText: document.getElementById(
      "guestSummaryText",
    ),
    guestSummarySubtext: document.getElementById(
      "guestSummarySubtext",
    ),
    adultsCountEl: document.getElementById("adultsCount"),
    childrenCountEl:
      document.getElementById("childrenCount"),
    infantsCountEl: document.getElementById("infantsCount"),
    petsCountEl: document.getElementById("petsCount"),
    guestPopoverClose: document.getElementById(
      "guestPopoverClose",
    ),
    bookingPeopleInput: document.getElementById(
      "bookingPeopleInput",
    ),
    bookingKidsInput: document.getElementById(
      "bookingKidsInput",
    ),
    bookingInfantsInput: document.getElementById(
      "bookingInfantsInput",
    ),
    bookingPetsInput: document.getElementById(
      "bookingPetsInput",
    ),
    checkInInput: document.getElementById("checkIn"),
    checkOutInput: document.getElementById("checkOut"),
    bookingDateError: document.getElementById(
      "bookingDateError",
    ),
    bookingSummaryCard: document.getElementById(
      "bookingSummaryCard",
    ),
    summaryDates: document.getElementById("summaryDates"),
    summaryNights: document.getElementById("summaryNights"),
    summaryGuests: document.getElementById("summaryGuests"),
    summaryTotal: document.getElementById("summaryTotal"),
    summaryPricingFactors: document.getElementById("summaryPricingFactors"),
    summaryBadgesList: document.getElementById("summaryBadgesList"),
    guestLimitNote: document.getElementById(
      "guestLimitNote",
    ),
  };

  if (
    !refs.guestPicker ||
    !refs.guestPickerButton ||
    !refs.guestPopover
  )
    return;

  const state = {
    adults: 1,
    children: 0,
    infants: 0,
    pets: 0,
    hasGuestSelectionChanged: false,
  };

  const controller = createStateHandler({
    utils,
    state,
    maxGuests,
    maxKids,
    maxPets,
    maxInfants,
    baseGuests,
    extraGuestFeePerNight,
    nightlyPrice,
    offerPercent,
    gstRate,
    ...refs,
  });

  refs.guestPickerButton.addEventListener("click", () => {
    const isOpen =
      !refs.guestPopover.classList.contains("d-none");
    refs.guestPopover.classList.toggle("d-none", isOpen);
    refs.guestPickerButton.setAttribute(
      "aria-expanded",
      String(!isOpen),
    );
  });

  refs.guestPopoverClose.addEventListener("click", () => {
    refs.guestPopover.classList.add("d-none");
    refs.guestPickerButton.setAttribute(
      "aria-expanded",
      "false",
    );
  });

  document.addEventListener("click", (event) => {
    if (!refs.guestPicker.contains(event.target)) {
      refs.guestPopover.classList.add("d-none");
      refs.guestPickerButton.setAttribute(
        "aria-expanded",
        "false",
      );
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      refs.guestPopover.classList.add("d-none");
      refs.guestPickerButton.setAttribute(
        "aria-expanded",
        "false",
      );
    }
  });

  refs.guestPopover
    .querySelectorAll(".guest-step-btn")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const stepper = button.closest(".guest-stepper");
        const type = stepper?.dataset?.type;
        const action = button.dataset.action;
        if (!type || !action) return;
        controller.updateCount(
          type,
          action === "increase" ? 1 : -1,
        );
      });
    });

  refs.checkInInput.addEventListener(
    "change",
    controller.updateDateAndPriceSummary,
  );
  refs.checkOutInput.addEventListener(
    "change",
    controller.updateDateAndPriceSummary,
  );

  root.addEventListener("priceUpdated", (e) => {
    if (e.detail) {
      controller.updatePriceDetails(e.detail);
    }
  });

  controller.updateGuestStateUI();
  controller.updateDateAndPriceSummary();
})();
