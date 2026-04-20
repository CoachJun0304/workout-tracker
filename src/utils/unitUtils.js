export function toDisplay(value, unit) {
  if (!value) return null;
  if (unit === 'lbs') return parseFloat((value * 2.20462).toFixed(1));
  return parseFloat(parseFloat(value).toFixed(1));
}

export function toKg(value, unit) {
  if (!value) return null;
  if (unit === 'lbs') return parseFloat((value / 2.20462).toFixed(2));
  return parseFloat(parseFloat(value).toFixed(2));
}

export function unitLabel(unit) {
  return unit === 'lbs' ? 'lbs' : 'kg';
}

export function estimated1RM(weight, reps) {
  if (!weight || !reps) return null;
  return parseFloat((weight * (1 + reps / 30)).toFixed(1));
}

export function calculateVolume(weight, sets, reps) {
  if (!weight || !sets || !reps) return null;
  return parseFloat((weight * sets * reps).toFixed(1));
}