import { useEffect, useState } from 'react';
import { mintErrorMessage, moveIntoGift, tokenClaimed } from '../mint';
import { storage, watchGifts, type SentGift } from '../storage';

type Status = 'checking' | 'waiting' | 'claimed' | 'unknown';
const LABEL: Record<Status, string> = { checking: 'Checking…', waiting: 'Waiting', claimed: 'Claimed ✓', unknown: 'Can’t check' };

type Props = { onUse?: (token: string) => void };

type Item = { kind: 'one'; gift: SentGift } | { kind: 'team'; team: string; name: string; gifts: SentGift[] };
/** Keep single gifts as they are; gather each team send's gifts under one entry, where its first gift was. */
function groupGifts(gifts: SentGift[]): Item[] {
  const items: Item[] = [];
  const teams = new Map<string, Extract<Item, { kind: 'team' }>>();
  for (const g of gifts) {
    if (!g.team) { items.push({ kind: 'one', gift: g }); continue; }
    let t = teams.get(g.team);
    if (!t) { t = { kind: 'team', team: g.team, name: g.teamName ?? '', gifts: [] }; teams.set(g.team, t); items.push(t); }
    t.gifts.push(g);
  }
  return items;
}

/** Gifts this browser has made, with their claim status from the mint. Doubles as the sender's backup. */
export function MyGifts({ onUse }: Props) {
  const [gifts, setGifts] = useState<SentGift[]>(() => storage.loadGifts());
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [confirm, setConfirm] = useState('');
  const [confirmTakeBack, setConfirmTakeBack] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [rescue, setRescue] = useState(''); // a reclaimed token this browser couldn't save

  useEffect(() => watchGifts(() => setGifts(storage.loadGifts())), []);

  useEffect(() => {
    let active = true;
    setStatus(Object.fromEntries(gifts.map(g => [g.token, 'checking' as Status])));
    gifts.forEach(g => tokenClaimed(g.token).then(c => {
      if (active) setStatus(s => ({ ...s, [g.token]: c === null ? 'unknown' : c ? 'claimed' : 'waiting' }));
    }));
    return () => { active = false; };
  }, [gifts]);

  if (!gifts.length && !rescue) return null;

  async function copy(g: SentGift) {
    const text = g.link || g.token;
    try { await navigator.clipboard.writeText(text); setNote(g.link ? 'Gift link copied.' : 'Token copied. Keep it private.'); }
    catch { setNote('Clipboard unavailable.'); }
  }
  async function copyCode(g: SentGift) {
    try { await navigator.clipboard.writeText(g.code ?? ''); setNote(g.question ? `Answer copied (“${g.question}”).` : 'Code copied. Send it separately from the link.'); }
    catch { setNote('Clipboard unavailable.'); }
  }
  function remove(g: SentGift) {
    if (status[g.token] !== 'claimed' && confirm !== g.token) { setConfirm(g.token); return; }
    storage.removeGift(g.token); setConfirm(''); setGifts(storage.loadGifts());
  }

  /** Swap the gift's ecash at the mint for fresh ecash. The old link stops working; the sats come back here. */
  async function takeBack(g: SentGift) {
    if (busy) return;
    setBusy(g.token); setConfirmTakeBack(''); setNote('');
    try {
      const fresh = await moveIntoGift(g.token);
      // Save first: from this moment the fresh token is the only copy of the sats.
      const saved = storage.replaceGift(g.token, { token: fresh.token, amount: fresh.amount, mint: g.mint, to: '', from: g.from, link: '', createdAt: Date.now() });
      if (!saved) setRescue(fresh.token);
      setGifts(storage.loadGifts());
      const fee = g.amount - fresh.amount;
      setNote(`Took back ${fresh.amount.toLocaleString()} sats${fee > 0 ? ` (the mint kept ${fee} as a fee)` : ''}. The link you sent ${g.to || 'them'} no longer works.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'SPENT') { setStatus(s => ({ ...s, [g.token]: 'claimed' })); setNote(`Too late: ${g.to || 'they'} just claimed it. 🎉`); }
      else if (msg === 'TEST_MODE') setNote('This gift is on a mint SatsGift no longer supports, so it can’t be taken back here. Copy the token into a Cashu wallet instead.');
      else setNote(mintErrorMessage(e));
    } finally { setBusy(''); }
  }

  async function copyRescue() {
    try { await navigator.clipboard.writeText(rescue); setNote('Token copied. Paste it into a Cashu wallet now.'); }
    catch { setNote('Clipboard unavailable. Select the token and copy it by hand.'); }
  }

  function row(g: SentGift) {
    const s = status[g.token] ?? 'checking';
    const sent = !!g.link;
    const canTakeBack = sent && (s === 'waiting' || s === 'unknown');
    return (
      <li key={g.token}>
        <div className="gift-row">
          <div>
            <b>{g.amount.toLocaleString()} sats</b> {sent && g.to ? <>for {g.to}</> : <em>not sent yet</em>}
            <small>{g.createdAt ? new Date(g.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''}</small>
          </div>
          <span className={`status-chip ${s}`}>{!sent && s === 'waiting' ? 'Yours' : LABEL[s]}</span>
        </div>
        <div className="gift-row-actions">
          {!sent && !g.team && s !== 'claimed' && onUse && <button className="text-button" onClick={() => { onUse(g.token); setNote(`${g.amount.toLocaleString()} sats loaded. Carry on to make a new gift.`); }}>Use for a new gift</button>}
          {s !== 'claimed' && <button className="text-button" onClick={() => copy(g)}>{sent ? 'Copy link' : 'Copy token'}</button>}
          {s !== 'claimed' && sent && g.code && <button className="text-button" onClick={() => copyCode(g)}>{g.question ? 'Copy answer' : <>Copy code <code>{g.code}</code></>}</button>}
          {canTakeBack && <button className="text-button" disabled={!!busy} onClick={() => setConfirmTakeBack(g.token)}>{busy === g.token ? 'Taking back…' : 'Take back'}</button>}
          <button className="text-button danger" onClick={() => remove(g)}>Remove</button>
        </div>
        {confirmTakeBack === g.token && (
          <p className="warning-line" role="alert">
            Take back {g.amount.toLocaleString()} sats? The link you sent {g.to || 'them'} will stop working.{' '}
            <button className="text-button" onClick={() => takeBack(g)}>Yes, take it back</button>{' '}
            <button className="text-button" onClick={() => setConfirmTakeBack('')}>Keep it</button>
          </p>
        )}
        {confirm === g.token && (
          <p className="error" role="alert">
            This is your only backup of {g.amount.toLocaleString()} unclaimed sats. Remove anyway?{' '}
            <button className="text-button danger" onClick={() => remove(g)}>Yes, remove</button>{' '}
            <button className="text-button" onClick={() => setConfirm('')}>Keep it</button>
          </p>
        )}
      </li>
    );
  }

  return (
    <section className="my-gifts" aria-labelledby="my-gifts-title">
      <h3 id="my-gifts-title">Your gifts</h3>
      <p className="hint">Saved in this browser only. Until a gift is claimed, this is your backup of the sats.</p>
      {rescue && (
        <div className="error" role="alert">
          <b>This browser couldn’t save your sats.</b> Copy this token into a Cashu wallet before you leave the page, it’s the only copy.
          <textarea className="link-field" readOnly value={rescue} onFocus={e => e.currentTarget.select()}/>
          <button className="text-button" onClick={copyRescue}>Copy token</button>
        </div>
      )}
      <ul>
        {groupGifts(gifts).map(item => item.kind === 'one' ? row(item.gift) : (
          <li key={item.team} className="team-group">
            <details>
              <summary>
                <span><b>👥 {item.name || 'Team send'}</b> · {item.gifts.length} gifts · {item.gifts.reduce((n, g) => n + g.amount, 0).toLocaleString()} sats</span>
                <span className="status-chip">{item.gifts.filter(g => status[g.token] === 'claimed').length}/{item.gifts.length} claimed</span>
              </summary>
              <ul>{item.gifts.map(row)}</ul>
            </details>
          </li>
        ))}
      </ul>
      <p role="status" className="notice">{note}</p>
    </section>
  );
}
