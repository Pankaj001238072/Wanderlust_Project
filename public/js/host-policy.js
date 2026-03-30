(() => {
  const hostPolicyCard = document.getElementById(
    "hostPolicyCard",
  );
  if (!hostPolicyCard) return;

  const state = {
    baseGuests:
      Number.parseInt(
        hostPolicyCard.dataset.baseGuests || "2",
        10,
      ) || 2,
    maxKids:
      Number.parseInt(
        hostPolicyCard.dataset.maxKids || "2",
        10,
      ) || 2,
    maxInfants:
      Number.parseInt(
        hostPolicyCard.dataset.maxInfants || "0",
        10,
      ) || 0,
    maxPets:
      Number.parseInt(
        hostPolicyCard.dataset.maxPets || "0",
        10,
      ) || 0,
  };

  const MAX_TOTAL_GUESTS = 20;
  const LIMITS = {
    baseGuests: { min: 1, max: 20 },
    maxKids: { min: 0, max: 10 },
    maxInfants: { min: 0, max: 5 },
    maxPets: { min: 0, max: 10 },
  };

  const countEls = {
    baseGuests: document.getElementById("baseGuestsCount"),
    maxKids: document.getElementById("maxKidsCount"),
    maxInfants: document.getElementById("maxInfantsCount"),
    maxPets: document.getElementById("maxPetsCount"),
  };

  const inputEls = {
    baseGuests: document.getElementById("baseGuestsInput"),
    maxGuests: document.getElementById("maxGuestsInput"),
    maxKids: document.getElementById("maxKidsInput"),
    maxInfants: document.getElementById("maxInfantsInput"),
    maxPets: document.getElementById("maxPetsInput"),
  };

  const petsHelperText = document.getElementById(
    "maxPetsHelperText",
  );
  const limitNote = document.getElementById(
    "hostPolicyLimitNote",
  );
  const maxGuestsPreview = document.getElementById(
    "maxGuestsPreview",
  );

  const clamp = (val, min, max) =>
    Math.max(min, Math.min(max, val));

  const normalizeState = () => {
    state.baseGuests = clamp(
      state.baseGuests,
      LIMITS.baseGuests.min,
      LIMITS.baseGuests.max,
    );
    const maxKidsAllowed = Math.max(
      0,
      Math.min(
        LIMITS.maxKids.max,
        MAX_TOTAL_GUESTS - state.baseGuests,
      ),
    );
    state.maxKids = clamp(
      state.maxKids,
      LIMITS.maxKids.min,
      maxKidsAllowed,
    );
    state.maxInfants = clamp(
      state.maxInfants,
      LIMITS.maxInfants.min,
      LIMITS.maxInfants.max,
    );
    state.maxPets = clamp(
      state.maxPets,
      LIMITS.maxPets.min,
      LIMITS.maxPets.max,
    );
  };

  const render = () => {
    normalizeState();

    Object.keys(countEls).forEach((key) => {
      countEls[key].textContent = String(state[key]);
    });

    inputEls.baseGuests.value = String(state.baseGuests);
    const maxGuests = state.baseGuests + state.maxKids;
    inputEls.maxGuests.value = String(maxGuests);
    inputEls.maxKids.value = String(state.maxKids);
    inputEls.maxInfants.value = String(state.maxInfants);
    inputEls.maxPets.value = String(state.maxPets);

    if (maxGuestsPreview) {
      maxGuestsPreview.textContent = String(maxGuests);
    }

    petsHelperText.textContent =
      state.maxPets === 0
        ? "Bringing a service animal?"
        : `Up to ${state.maxPets} pets allowed`;

    const infantText =
      state.maxInfants > 0
        ? `This place has a maximum of ${maxGuests} guests. Infants allowed up to ${state.maxInfants}.`
        : `This place has a maximum of ${maxGuests} guests, not including infants.`;

    limitNote.textContent = `${infantText} ${state.maxPets === 0 ? "Pets aren't allowed." : `Pets are allowed up to ${state.maxPets}.`}`;

    hostPolicyCard
      .querySelectorAll(".host-policy-stepper")
      .forEach((stepper) => {
        const type = stepper.dataset.type;
        const minusBtn = stepper.querySelector(
          '[data-action="decrease"]',
        );
        const plusBtn = stepper.querySelector(
          '[data-action="increase"]',
        );
        const min = LIMITS[type].min;
        const max =
          type === "maxKids"
            ? Math.max(
                0,
                Math.min(
                  LIMITS.maxKids.max,
                  MAX_TOTAL_GUESTS - state.baseGuests,
                ),
              )
            : LIMITS[type].max;

        minusBtn.disabled = state[type] <= min;
        plusBtn.disabled = state[type] >= max;
      });
  };

  hostPolicyCard
    .querySelectorAll(".host-policy-step-btn")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const stepper = btn.closest(".host-policy-stepper");
        const type = stepper?.dataset?.type;
        if (!type) return;

        const delta =
          btn.dataset.action === "increase" ? 1 : -1;
        state[type] += delta;
        render();
      });
    });

  render();
})();
