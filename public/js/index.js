// Listings page tax toggle: base price <-> after-tax price
const taxSwitch = document.getElementById(
  "switchCheckDefault",
);

if (taxSwitch) {
  taxSwitch.addEventListener("change", () => {
    const showAfterTax = taxSwitch.checked;
    const basePrices =
      document.getElementsByClassName("base-price");
    const taxedPrices =
      document.getElementsByClassName("taxed-price");

    for (const price of basePrices) {
      price.style.display = showAfterTax
        ? "none"
        : "inline";
    }

    for (const price of taxedPrices) {
      price.style.display = showAfterTax
        ? "inline"
        : "none";
    }
  });
}
