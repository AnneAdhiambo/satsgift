/**
 * Tidy what someone types into a sats field: digits only, no leading zeros,
 * and never more than `max` (anything bigger snaps down to the limit).
 */
export function cleanAmount(raw: string, max: number): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return '';
  // Compare by length first so a pasted "999…9" never becomes Infinity.
  if (digits.length > String(max).length || Number(digits) > max) return String(max);
  return digits;
}
