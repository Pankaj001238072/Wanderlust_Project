/**
 * Dynamic Pricing Helper
 * Calculates price adjustments based on:
 *  1. Weekend Surge (Fri-Sun) → +15%
 *  2. Last-Minute Deal (same-day / next-day booking AND room was available) → -20%
 *  3. Seasonal / Festival Pricing → +10%
 */

// ─── Seasonal Windows (Month is 0-indexed) ─────────────────────────────────
const FESTIVAL_WINDOWS = [
  { name: "Diwali", start: { month: 9, day: 20 }, end: { month: 10, day: 5 } },
  { name: "Christmas", start: { month: 11, day: 20 }, end: { month: 11, day: 31 } },
  { name: "New Year", start: { month: 0, day: 1 }, end: { month: 0, day: 3 } },
  { name: "Holi", start: { month: 2, day: 20 }, end: { month: 2, day: 28 } },
  { name: "Summer Peak", start: { month: 3, day: 15 }, end: { month: 5, day: 15 } },
];

/**
 * Check if a date falls in any festival/seasonal window
 */
const getFestivalInfo = (date) => {
  const m = date.getMonth();
  const d = date.getDate();

  for (const win of FESTIVAL_WINDOWS) {
    const afterStart =
      m > win.start.month ||
      (m === win.start.month && d >= win.start.day);
    const beforeEnd =
      m < win.end.month ||
      (m === win.end.month && d <= win.end.day);

    if (afterStart && beforeEnd) return win;
  }
  return null;
};

/**
 * Main function – returns computed price and breakdown
 *
 * @param {number}  basePrice        – listing base price per night (in ₹)
 * @param {Date}    checkInDate      – check-in date
 * @param {boolean} isAvailableToday – true if there's NO booking for next 2 days
 * @returns {{ finalPrice, breakdown }}
 */
const computeDynamicPrice = (basePrice, checkInDate, isAvailableToday = false, offerPercent = 0) => {
  const breakdown = [];
  let multiplier = 1;

  // 1. Festival / Seasonal Pricing (PRIORITY)
  const festival = getFestivalInfo(checkInDate);
  if (festival) {
    multiplier += 0.10;
    breakdown.push({ label: `${festival.name} Season 🎊`, change: "+10%", color: "warning" });
  }

  // 2. Weekend Surge (Friday=5, Saturday=6, Sunday=0)
  const day = checkInDate.getDay();
  if (day === 5 || day === 6 || day === 0) {
    multiplier += 0.15;
    breakdown.push({ label: "Weekend Surge", change: "+15%", color: "danger" });
  }

  // 3. Last-Minute Deal (booking today or tomorrow, and room is free)
  const now = new Date();
  const diffMs = checkInDate.getTime() - now.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 1 && isAvailableToday) {
    multiplier -= 0.20;
    breakdown.push({ label: "Last-Minute Deal 🎉", change: "-20%", color: "success" });
  }

  // 4. Promotional Offer (Additive)
  if (offerPercent > 0) {
    multiplier -= (offerPercent / 100);
    breakdown.push({ label: "Promotional Offer 🎉", change: `-${offerPercent}%`, color: "success" });
  }

  const finalPrice = Math.round(basePrice * Math.max(0.1, multiplier)); 
  return { finalPrice, breakdown, multiplier };
};

module.exports = { computeDynamicPrice, getFestivalInfo };
