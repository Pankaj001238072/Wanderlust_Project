const {
  MAX_PEOPLE_LIMIT,
  MAX_KIDS_LIMIT,
  MAX_INFANTS_LIMIT,
  MAX_PETS_LIMIT,
} = require("./common");

const parseGuestCounts = (bookingBody) => ({
  people: Number.parseInt(bookingBody.people, 10),
  kids: Number.parseInt(bookingBody.kids, 10),
  infants: Number.parseInt(bookingBody.infants, 10),
  pets: Number.parseInt(bookingBody.pets, 10),
});

const isWithinRange = (value, min, max) =>
  Number.isFinite(value) && value >= min && value <= max;

const areGuestCountsValid = ({
  people,
  kids,
  infants,
  pets,
}) =>
  isWithinRange(people, 1, MAX_PEOPLE_LIMIT) &&
  isWithinRange(kids, 0, MAX_KIDS_LIMIT) &&
  isWithinRange(infants, 0, MAX_INFANTS_LIMIT) &&
  isWithinRange(pets, 0, MAX_PETS_LIMIT);

const getListingLimits = (listing) => ({
  baseGuests: Number.isFinite(listing.baseGuests)
    ? listing.baseGuests
    : 2,
  maxGuests: Number.isFinite(listing.maxGuests)
    ? listing.maxGuests
    : 4,
  maxKids: Number.isFinite(listing.maxKids)
    ? listing.maxKids
    : 2,
  maxInfants: Number.isFinite(listing.maxInfants)
    ? listing.maxInfants
    : 0,
  maxPets: Number.isFinite(listing.maxPets)
    ? listing.maxPets
    : 0,
});

const getListingLimitError = (
  { people, kids, infants, pets },
  limits,
) => {
  if (people > limits.maxGuests) {
    return `This listing allows maximum ${limits.maxGuests} guests.`;
  }
  if (kids > limits.maxKids) {
    return `This listing allows maximum ${limits.maxKids} kids.`;
  }
  if (infants > limits.maxInfants) {
    return `This listing allows maximum ${limits.maxInfants} infants.`;
  }
  if (pets > limits.maxPets) {
    return `This listing allows maximum ${limits.maxPets} pets.`;
  }
  return null;
};

module.exports = {
  parseGuestCounts,
  areGuestCountsValid,
  getListingLimits,
  getListingLimitError,
};
