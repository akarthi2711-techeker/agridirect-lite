/**
 * Smart Pricing - Rule-based suggested price calculator
 * Based on quantity tiers
 */
const getSuggestedPrice = (quantity, basePrice) => {
  const qty = parseFloat(quantity);
  if (isNaN(qty) || qty <= 0) return null;

  let multiplier = 1.0;
  if (qty > 100) {
    multiplier = 0.90; // Bulk discount - ₹18 equivalent
  } else if (qty >= 50) {
    multiplier = 1.0;  // Standard - ₹20 equivalent
  } else {
    multiplier = 1.10; // Small quantity premium - ₹22 equivalent
  }

  if (basePrice) {
    return parseFloat((basePrice * multiplier).toFixed(2));
  }

  // Default tier prices (per kg)
  if (qty > 100) return 18;
  if (qty >= 50) return 20;
  return 22;
};

module.exports = { getSuggestedPrice };
