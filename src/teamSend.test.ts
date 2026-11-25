import test from 'node:test';
import assert from 'node:assert/strict';
import { assignProofs, powersOfTwo, teamCsv, teamProblems, teamTotals, TEAM_FEE_PER_RECIPIENT, TEAM_MAX_RECIPIENTS } from './teamSend.ts';

const r = (name: string, sats: number) => ({ name, sats, note: '' });

test('totals add a per-recipient fee', () => {
  assert.deepEqual(teamTotals([r('A', 1000), r('B', 2500)]), { gifts: 3500, fee: 2 * TEAM_FEE_PER_RECIPIENT, total: 3500 + 2 * TEAM_FEE_PER_RECIPIENT });
});

test('flags missing names, bad amounts and too many people', () => {
  assert.deepEqual(teamProblems([r('Juma', 1000)]), []);
  assert.equal(teamProblems([]).length, 1);
  assert.match(teamProblems([r(' ', 10)])[0], /Row 1 needs a name/);
  assert.match(teamProblems([r('Juma', 0)])[0], /Juma: choose between/);
  assert.match(teamProblems([r('Juma', 1.5)])[0], /Juma/);
  assert.match(teamProblems(Array.from({ length: TEAM_MAX_RECIPIENTS + 1 }, (_, i) => r(`P${i}`, 1)))[0], /up to/);
});

test('splits amounts into power-of-two coins', () => {
  assert.deepEqual(powersOfTwo(13), [8, 4, 1]);
  assert.deepEqual(powersOfTwo(1), [1]);
  assert.deepEqual(powersOfTwo(1000), [512, 256, 128, 64, 32, 8]);
  assert.equal(powersOfTwo(99_999).reduce((a, b) => a + b, 0), 99_999);
});

test('assigns coins so each person gets exactly their amount', () => {
  const amounts = [1000, 1000, 13];
  const coins = [...amounts.flatMap(powersOfTwo), 32, 16].reverse().map((amount, id) => ({ amount, id }));
  const { gifts, leftover } = assignProofs(coins, amounts);
  assert.deepEqual(gifts.map(g => g.reduce((s, p) => s + p.amount, 0)), amounts);
  assert.deepEqual(leftover.map(p => p.amount).sort((a, b) => a - b), [16, 32]);
  assert.equal(new Set(gifts.flat().map(p => p.id)).size, gifts.flat().length, 'no coin given twice');
});

test('refuses a split that does not add up', () => {
  assert.throws(() => assignProofs([{ amount: 8 }], [13]), /SPLIT_MISMATCH/);
});

test('CSV quotes commas and defuses formulas', () => {
  const csv = teamCsv([{ name: 'Otieno, Jr', sats: 500, link: 'https://x/#g=1', code: 'K7QM-4XPA' }, { name: '=HYPERLINK("x")', sats: 1, link: 'l', code: '' }]);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'Name,Sats,Gift link,Code');
  assert.equal(lines[1], '"Otieno, Jr",500,https://x/#g=1,K7QM-4XPA');
  assert.equal(lines[2], `"'=HYPERLINK(""x"")",1,l,`);
});

test('occasions: templates, tags and when a letter may be replaced', async () => {
  const { OCCASIONS, isTemplateLetter, occasionTag } = await import('./occasions.ts');
  assert.equal(occasionTag('christmas', ''), '🎄 Christmas');
  assert.equal(occasionTag('other', '  Back to school '), '✨ Back to school');
  assert.equal(occasionTag('other', ''), '');
  assert.equal(occasionTag('nope', 'x'), '');
  assert.ok(isTemplateLetter(OCCASIONS[0].letter));
  assert.ok(isTemplateLetter('  '));
  assert.equal(isTemplateLetter('Our own words'), false);
});
