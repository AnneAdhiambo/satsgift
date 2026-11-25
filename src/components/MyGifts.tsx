import { useEffect, useState } from 'react';
import { tokenClaimed } from '../mint';
import { storage, watchGifts, type SentGift } from '../storage';

type Status = 'checking' | 'waiting' | 'claimed' | 'unknown';
const LABEL: Record<Status, string> = { checking: 'Checking…', waiting: 'Waiting', claimed: 'Claimed ✓', unknown: 'Can’t check' };

/** Gifts this browser has made, with their claim status from the mint. Doubles as the sender's backup. */
export function MyGifts() {
  const [gifts, setGifts] = useState<SentGift[]>(() => storage.loadGifts());
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [confirm, setConfirm] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => watchGifts(() => setGifts(storage.loadGifts())), []);

  useEffect(() => {
    let active = true;
    setStatus(Object.fromEntries(gifts.map(g => [g.token, 'checking' as Status])));
    gifts.forEach(g => tokenClaimed(g.token).then(c => {
      if (active) setStatus(s => ({ ...s, [g.token]: c === null ? 'unknown' : c ? 'claimed' : 'waiting' }));
    }));
    return () => { active = false; };
  }, [gifts]);

  if (!gifts.length) return null;

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

  return (
    <section className="my-gifts" aria-labelledby="my-gifts-title">
      <h3 id="my-gifts-title">Your gifts</h3>
      <p className="hint">Saved in this browser only. Until a gift is claimed, this is your backup of the sats.</p>
      <ul>
        {gifts.map(g => {
          const s = status[g.token] ?? 'checking';
          return (
            <li key={g.token}>
              <div className="gift-row">
                <div>
                  <b>{g.amount.toLocaleString()} sats</b> {g.to ? <>for {g.to}</> : <em>not sent yet</em>}
                  <small>{g.createdAt ? new Date(g.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''}</small>
                </div>
                <span className={`status-chip ${s}`}>{LABEL[s]}</span>
              </div>
              <div className="gift-row-actions">
                {s !== 'claimed' && <button className="text-button" onClick={() => copy(g)}>{g.link ? 'Copy link' : 'Copy token'}</button>}
                {s !== 'claimed' && g.link && g.code && <button className="text-button" onClick={() => copyCode(g)}>{g.question ? 'Copy answer' : <>Copy code <code>{g.code}</code></>}</button>}
                <button className="text-button danger" onClick={() => remove(g)}>Remove</button>
              </div>
              {confirm === g.token && (
                <p className="error" role="alert">
                  This is your only backup of {g.amount.toLocaleString()} unclaimed sats. Remove anyway?{' '}
                  <button className="text-button danger" onClick={() => remove(g)}>Yes, remove</button>{' '}
                  <button className="text-button" onClick={() => setConfirm('')}>Keep it</button>
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p role="status" className="notice">{note}</p>
    </section>
  );
}
