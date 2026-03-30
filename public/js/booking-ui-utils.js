window.ListingBookingUtils = {
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },

  formatGuestSummary(state) {
    const adultsText = `${state.adults} ${state.adults === 1 ? "adult" : "adults"}`;
    const childrenText = `${state.children} ${state.children === 1 ? "child" : "children"}`;
    const infantsText = `${state.infants} ${state.infants === 1 ? "infant" : "infants"}`;
    const petsText = `${state.pets} ${state.pets === 1 ? "pet" : "pets"}`;
    return `${adultsText}, ${childrenText}, ${infantsText}, ${petsText}`;
  },

  formatGuestCompact(state) {
    return `Guests • ${state.adults + state.children}`;
  },

  formatDate(dateObj) {
    return dateObj.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  },

  buildGuestLimitNote({
    state,
    maxGuests,
    maxInfants,
    maxPets,
  }) {
    const totalGuests = state.adults + state.children;
    const remainingGuests = Math.max(
      0,
      maxGuests - totalGuests,
    );
    const infantsPart =
      maxInfants === 0
        ? "Infants are not allowed."
        : `Infants: ${state.infants}/${maxInfants}`;
    const petsPart =
      maxPets === 0
        ? "Pets are not allowed."
        : `Pets: ${state.pets}/${maxPets}`;
    return `This place has a maximum of ${maxGuests} guests. Selected ${totalGuests}, Remaining ${remainingGuests}, ${infantsPart}, ${petsPart}.`;
  },

  getDatePriceSummary({
    checkInValue,
    checkOutValue,
    state,
    maxGuests,
    baseGuests,
    extraGuestFeePerNight,
    nightlyPrice,
    gstRate,
  }) {
    if (!checkInValue || !checkOutValue) {
      return { show: false };
    }

    const checkInDate = new Date(
      `${checkInValue}T00:00:00`,
    );
    const checkOutDate = new Date(
      `${checkOutValue}T00:00:00`,
    );

    if (checkOutDate <= checkInDate) {
      return {
        show: false,
        error: "Check-out must be after check-in.",
      };
    }

    const nights = Math.ceil(
      (checkOutDate - checkInDate) / (24 * 60 * 60 * 1000),
    );
    const totalGuests = Math.min(
      maxGuests,
      state.adults + state.children,
    );
    const extraGuests = Math.max(
      0,
      totalGuests - baseGuests,
    );
    const subtotal =
      nights * nightlyPrice +
      extraGuests * extraGuestFeePerNight * nights;
    const total = Math.round(subtotal * (1 + gstRate));

    return {
      show: true,
      nights,
      total,
      formattedDates: `${this.formatDate(checkInDate)} - ${this.formatDate(checkOutDate)}`,
    };
  },
};
