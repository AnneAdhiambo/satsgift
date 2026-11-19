import { useState } from 'react';
import { proofAmounts } from '../token';

/** A token shown as what it really is: a handful of ecash proofs, like coins. */
export function EcashCoins({ token, onCopy }: { token: string; onCopy: () => void }) {
  const [open, setOpen] = useState(false);
  const coins = proofAmounts(token);
  if (!coins.length) return null;
  return (
    <div className="ecash">
      <ul className="ecash-coins" aria-label={`${coins.length} ecash proofs`}>
        {coins.map((c, i) => <li key={i} className="ecash-coin" style={{ animationDelay: `${i * 70}ms` }} title={`A proof worth ${c} sats`}>{c.toLocaleString()}</li>)}
      </ul>
      <small>{coins.length} {coins.length === 1 ? 'proof' : 'proofs'}: Cashu splits value into powers of two, like coins in your pocket.</small>
      <div className="ecash-actions">
        <button className="text-button" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? 'Hide token' : 'View token'}</button>
        <button className="text-button" onClick={onCopy}>Copy backup token</button>
      </div>
      {open && <textarea className="token-input token-view" readOnly value={token} aria-label="Your Cashu token" onFocus={e => e.currentTarget.select()}/>}
    </div>
  );
}
