// ============================================================
// PANDAS ERP - Unit-Aware Quantity Validation & Formatting
// ============================================================

export const INTEGER_UNITS = [
  'pc', 'pcs', 'piece', 'pieces',
  'packet', 'packets', 'pkt', 'pkts',
  'box', 'boxes',
  'bottle', 'bottles',
  'can', 'cans',
  'unit', 'units',
  'nos', 'no'
];

export const DECIMAL_UNITS = [
  'kg', 'kilogram', 'kilograms',
  'g', 'gm', 'gms', 'gram', 'grams',
  'l', 'ltr', 'litre', 'litres', 'liter', 'liters',
  'ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters'
];

/**
 * Checks whether a unit requires strict whole-number quantities.
 */
export const isIntegerUnit = (unit) => {
  if (!unit) return false;
  return INTEGER_UNITS.includes(String(unit).trim().toLowerCase());
};

/**
 * Validates a numeric quantity against the item unit.
 * Never silently truncates or rounds invalid inputs.
 */
export const validateUnitQuantity = (quantity, unit) => {
  if (quantity === undefined || quantity === null || String(quantity).trim() === '') {
    return { valid: false, message: 'Quantity is required and cannot be empty.' };
  }
  const num = Number(quantity);
  if (isNaN(num)) {
    return { valid: false, message: `Value '${quantity}' is not a valid number.` };
  }
  if (num < 0) {
    return { valid: false, message: 'Quantity cannot be negative.' };
  }
  if (isIntegerUnit(unit)) {
    if (!Number.isInteger(num)) {
      return {
        valid: false,
        message: `Unit '${unit}' only accepts whole numbers. Decimals like '${quantity}' are not permitted.`,
      };
    }
  }
  return { valid: true, message: null };
};

/**
 * Formats display quantity respecting unit integer/decimal rules.
 */
export const formatQuantity = (quantity, unit) => {
  if (quantity === undefined || quantity === null || quantity === '') return '0';
  const num = Number(quantity);
  if (isNaN(num)) return String(quantity);
  if (isIntegerUnit(unit)) {
    return String(Math.round(num));
  }
  return num % 1 === 0 ? num.toFixed(0) : num.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
};

