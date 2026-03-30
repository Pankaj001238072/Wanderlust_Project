window.ListingBookingState = (ctx) => {
  const {
    utils,
    state,
    maxGuests,
    maxKids,
    maxPets,
    maxInfants,
    baseGuests,
    extraGuestFeePerNight,
    nightlyPrice,
    gstRate,
    guestPopover,
    guestSummaryText,
    guestSummarySubtext,
    adultsCountEl,
    childrenCountEl,
    infantsCountEl,
    petsCountEl,
    bookingPeopleInput,
    bookingKidsInput,
    bookingInfantsInput,
    bookingPetsInput,
    summaryGuests,
    guestLimitNote,
    bookingDateError,
    bookingSummaryCard,
    summaryDates,
    summaryNights,
    summaryTotal,
    checkInInput,
    checkOutInput,
  } = ctx;
  const { clamp } = utils;
  const updateGuestLimitNote = () => {
    guestLimitNote.textContent = utils.buildGuestLimitNote({
      state,
      maxGuests,
      maxInfants,
      maxPets,
    });
  };
  const updateStepButtons = () => {
    const totalGuests = state.adults + state.children;
    const maxAdultsAllowed = Math.max(
      1,
      maxGuests - state.children,
    );
    const maxChildrenAllowed = Math.min(
      maxKids,
      Math.max(0, maxGuests - state.adults),
    );
    const adultsStepper = guestPopover.querySelector(
      '.guest-stepper[data-type="adults"]',
    );
    const childrenStepper = guestPopover.querySelector(
      '.guest-stepper[data-type="children"]',
    );
    const infantsStepper = guestPopover.querySelector(
      '.guest-stepper[data-type="infants"]',
    );
    const petsStepper = guestPopover.querySelector(
      '.guest-stepper[data-type="pets"]',
    );
    const adultsMinus = adultsStepper.querySelector(
      '[data-action="decrease"]',
    );
    const adultsPlus = adultsStepper.querySelector(
      '[data-action="increase"]',
    );
    adultsMinus.disabled = state.adults <= 1;
    adultsPlus.disabled = state.adults >= maxAdultsAllowed;
    const childrenMinus = childrenStepper.querySelector(
      '[data-action="decrease"]',
    );
    const childrenPlus = childrenStepper.querySelector(
      '[data-action="increase"]',
    );
    childrenMinus.disabled = state.children <= 0;
    childrenPlus.disabled =
      state.children >= maxChildrenAllowed ||
      totalGuests >= maxGuests;
    const infantsMinus = infantsStepper.querySelector(
      '[data-action="decrease"]',
    );
    const infantsPlus = infantsStepper.querySelector(
      '[data-action="increase"]',
    );
    infantsMinus.disabled = state.infants <= 0;
    infantsPlus.disabled = state.infants >= maxInfants;
    const petsMinus = petsStepper.querySelector(
      '[data-action="decrease"]',
    );
    const petsPlus = petsStepper.querySelector(
      '[data-action="increase"]',
    );
    petsMinus.disabled = maxPets === 0 || state.pets <= 0;
    petsPlus.disabled =
      maxPets === 0 || state.pets >= maxPets;
  };
  const updateDateAndPriceSummary = () => {
    bookingDateError.classList.add("d-none");
    bookingDateError.textContent = "";
    const summary = utils.getDatePriceSummary({
      checkInValue: checkInInput.value,
      checkOutValue: checkOutInput.value,
      state,
      maxGuests,
      baseGuests,
      extraGuestFeePerNight,
      nightlyPrice,
      gstRate,
    });
    if (!summary.show) {
      bookingSummaryCard.classList.add("d-none");
      if (summary.error) {
        bookingDateError.textContent = summary.error;
        bookingDateError.classList.remove("d-none");
      }
      return;
    }
    summaryDates.textContent = summary.formattedDates;
    summaryNights.textContent = String(summary.nights);
    summaryTotal.textContent =
      summary.total.toLocaleString("en-IN");
    bookingSummaryCard.classList.remove("d-none");
  };
  const updateGuestStateUI = () => {
    const totalGuests = state.adults + state.children;
    adultsCountEl.textContent = String(state.adults);
    childrenCountEl.textContent = String(state.children);
    infantsCountEl.textContent = String(state.infants);
    petsCountEl.textContent = String(state.pets);
    bookingPeopleInput.value = String(totalGuests);
    bookingKidsInput.value = String(state.children);
    bookingInfantsInput.value = String(state.infants);
    bookingPetsInput.value = String(state.pets);
    const summaryText = utils.formatGuestSummary(state);
    if (state.hasGuestSelectionChanged) {
      guestSummaryText.textContent =
        utils.formatGuestCompact(state);
      guestSummarySubtext.textContent = summaryText;
    } else {
      guestSummaryText.textContent = "Who";
      guestSummarySubtext.textContent = "Add guests";
    }
    summaryGuests.textContent = summaryText;
    updateStepButtons();
    updateGuestLimitNote();
    updateDateAndPriceSummary();
  };
  const updateCount = (type, delta) => {
    const prev = { ...state };
    if (type === "adults") {
      state.adults = clamp(
        state.adults + delta,
        1,
        Math.max(1, maxGuests - state.children),
      );
    }
    if (type === "children") {
      state.children = clamp(
        state.children + delta,
        0,
        Math.min(
          maxKids,
          Math.max(0, maxGuests - state.adults),
        ),
      );
    }
    if (type === "pets") {
      state.pets = clamp(state.pets + delta, 0, maxPets);
    }
    if (type === "infants") {
      state.infants = clamp(
        state.infants + delta,
        0,
        maxInfants,
      );
    }
    const totalGuests = state.adults + state.children;
    if (totalGuests > maxGuests) {
      state.children = Math.max(
        0,
        maxGuests - state.adults,
      );
    }
    state.hasGuestSelectionChanged =
      prev.adults !== state.adults ||
      prev.children !== state.children ||
      prev.infants !== state.infants ||
      prev.pets !== state.pets;
    updateGuestStateUI();
  };
  return {
    updateCount,
    updateGuestStateUI,
    updateDateAndPriceSummary,
  };
};
