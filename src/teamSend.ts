// Team send: one sender funds once, SatsGift splits the sats into one gift per recipient.
// Pure helpers only (no network), so they can be unit-tested.

export type TeamRecipient = { name: string; sats: number; note: string };

export const TEAM_FEE_PER_RECIPIENT = 50; // sats; single gifts stay free
export const TEAM_MAX_RECIPIENTS = 25;
export const TEAM_MIN_SATS = 1;
export const TEAM_MAX_SATS_EACH = 100_000;
export const LETTER_MAX = 600;
export const SIGNED_BY_MAX = 60;
export const NOTE_MAX = 140;
export const NAME_MAX = 50;

export function teamTotals(recipients: TeamRecipient[]) {
  const gifts = recipients.reduce((sum, r) => sum + r.sats, 0);
  const fee = recipients.length * TEAM_FEE_PER_RECIPIENT;
  return { gifts, fee, total: gifts + fee };
}

/** Every problem with the recipient list, phrased for the sender. Empty when ready to pay. */
export function teamProblems(recipients: TeamRecipient[]): string[] {
  const problems: string[] = [];
  if (!recipients.length) problems.push('Add at least one person.');
  if (recipients.length > TEAM_MAX_RECIPIENTS) problems.push(`A team send can have up to ${TEAM_MAX_RECIPIENTS} people.`);
  recipients.forEach((r, i) => {
    const who = r.name.trim() || `Row ${i + 1}`;
    if (!r.name.trim()) problems.push(`Row ${i + 1} needs a name.`);
    if (!Number.isInteger(r.sats) || r.sats < TEAM_MIN_SATS || r.sats > TEAM_MAX_SATS_EACH) problems.push(`${who}: choose between ${TEAM_MIN_SATS} and ${TEAM_MAX_SATS_EACH.toLocaleString()} sats.`);
  });
  return problems;
}

/** 13 → [8, 4, 1]: the coin sizes a mint issues for an amount. */
export function powersOfTwo(n: number): number[] {
  const out: number[] = [];
  for (let bit = 2 ** Math.floor(Math.log2(Math.max(n, 1))); bit >= 1; bit /= 2) if (n >= bit) { out.push(bit); n -= bit; }
  return out;
}

/**
 * Hand out proofs ("coins") so each recipient gets exactly their amount.
 * `proofs` must contain each recipient's powersOfTwo split; anything else is left over.
 * Throws if the coins don't add up, so a bad split never produces short gifts.
 */
export function assignProofs<P extends { amount: number }>(proofs: P[], amounts: number[]): { gifts: P[][]; leftover: P[] } {
  const pool = [...proofs];
  const gifts = amounts.map(amount => powersOfTwo(amount).map(size => {
    const i = pool.findIndex(p => p.amount === size);
    if (i < 0) throw new Error('SPLIT_MISMATCH');
    return pool.splice(i, 1)[0];
  }));
  return { gifts, leftover: pool };
}

/** A short random id that groups a team send's gifts together. */
export function newTeamId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('');
}

/** CSV for HR/admin: one row per person with their link and code. */
export function teamCsv(rows: { name: string; sats: number; link: string; code: string }[]): string {
  const cell = (v: string | number) => {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheets running it as a formula
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return ['Name,Sats,Gift link,Code', ...rows.map(r => [r.name, r.sats, r.link, r.code].map(cell).join(','))].join('\r\n');
}
