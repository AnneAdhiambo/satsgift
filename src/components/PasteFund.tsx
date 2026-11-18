import { useState } from 'react';
import { MINTS, findMint, mintErrorMessage, moveIntoGift } from '../mint';
import { readGiftToken } from '../token';

type Preview = { token: string; amount: number; mint: string };

/** Paste a Cashu token, preview it, then swap it at the mint into fresh proofs for the gift. */
export function PasteFund({ onFunded, onDemo }: { onFunded: (token: string) => void; onDemo: () => void }) {
  const [raw, setRaw] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function read(value: string) {
    setRaw(value); setPreview(null); setError('');
    if (!value.trim()) return;
    try {
      const t = readGiftToken(value);
      if (!findMint(t.mint)) {
        setError(`SatsGift is in test mode, so it only accepts tokens from ${MINTS.map(m => m.name).join(', ')}. This one is from ${t.mint}.`);
        return;
      }
      setPreview(t);
    } catch (e) {
      setError(e instanceof Error && /Please use|missing valid|mint address/.test(e.message) ? e.message : 'We couldn’t read that Cashu token. Paste a complete cashuA or cashuB token.');
    }
  }

  async function move() {
    if (!preview) return;
    setBusy(true); setError('');
    try {
      const fresh = await moveIntoGift(preview.token);
      setRaw(''); setPreview(null);
      onFunded(fresh.token);
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setError(m === 'SPENT' ? 'This token has already been spent, so there are no sats left in it.'
        : m === 'TEST_MODE' ? 'SatsGift is in test mode and only accepts test-mint tokens.'
        : mintErrorMessage(e));
    } finally { setBusy(false); }
  }

  return <>
    <label htmlFor="token">Cashu token</label>
    <textarea id="token" className="token-input" value={raw} placeholder="cashuB…" onChange={e => read(e.target.value)} spellCheck={false} autoComplete="off"/>
    <button className="text-button" onClick={onDemo}>Try a demo token</button>
    {error && <p className="error" role="alert">{error}</p>}
    {preview && (
      <div className="paste-preview">
        <p><b>{preview.amount.toLocaleString()} sats</b> from {findMint(preview.mint)?.name ?? preview.mint}</p>
        <p className="hint">We check these sats with the mint and move them into a fresh token for the gift. The token you pasted stops working, and the mint may keep a small fee.</p>
        <button className="primary" disabled={busy} onClick={move}>{busy ? 'Checking with the mint…' : 'Move into gift →'}</button>
      </div>
    )}
  </>;
}
