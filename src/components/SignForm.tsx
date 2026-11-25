import { useState } from 'react';
import { LightningFund } from './LightningFund';
import { NAME_MAX, PEN_NAMES, PENS, STICKERS, TEXT_MAX, type CardMessage } from '../card';
import { readGiftToken } from '../token';
import { storage } from '../storage';

type Props = {
  to: string;
  /** Sign the card. Resolves once the message is saved; throws with a message to show. */
  onSign: (message: CardMessage, token?: string) => Promise<void>;
};

/** Write a message in your own pen and sticker, and optionally chip in sats. */
export function SignForm({ to, onSign }: Props) {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [pen, setPen] = useState(0);
  const [sticker, setSticker] = useState<string>(STICKERS[0]);
  const [chip, setChip] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sats = (() => { try { return token ? readGiftToken(token).amount : 0; } catch { return 0; } })();
  const ready = name.trim() && text.trim() && !busy && (!chip || token);

  /** Paid: keep the sats safe in "Your gifts" straight away, before anything else can go wrong. */
  function funded(t: string) {
    let amount = 0, mint = '';
    try { ({ amount, mint } = readGiftToken(t)); } catch { /* still saved */ }
    storage.saveGift({ token: t, amount, mint, to: '', from: name.trim(), link: '', createdAt: Date.now() });
    setToken(t);
  }

  async function submit() {
    if (!ready) return;
    setBusy(true); setError('');
    try { await onSign({ name: name.trim(), text: text.trim(), pen, sticker, sats }, token || undefined); }
    catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t add your message. Please try again.'); }
    finally { setBusy(false); }
  }

  return (
    <section className="sign-form" aria-labelledby="sign-title">
      <h3 id="sign-title">Sign the card</h3>
      <label htmlFor="sign-text">Your message to {to || 'them'} <small>{text.length}/{TEXT_MAX}</small></label>
      <textarea id="sign-text" className="sign-text" value={text} maxLength={TEXT_MAX} placeholder="Happy birthday! Wishing you…" style={{ color: PENS[pen] }} onChange={e => setText(e.target.value)}/>

      <div className="sign-pickers">
        <div>
          <span className="picker-label" id="pen-label">Pen</span>
          <div className="pen-picker" role="radiogroup" aria-labelledby="pen-label">
            {PENS.map((c, i) => <button key={c} role="radio" aria-checked={pen === i} aria-label={PEN_NAMES[i]} title={PEN_NAMES[i]} style={{ background: c }} onClick={() => setPen(i)}/>)}
          </div>
        </div>
        <div>
          <span className="picker-label" id="sticker-label">Sticker</span>
          <div className="sticker-picker" role="radiogroup" aria-labelledby="sticker-label">
            {STICKERS.map(s => <button key={s} role="radio" aria-checked={sticker === s} onClick={() => setSticker(s)}>{s}</button>)}
          </div>
        </div>
      </div>

      <label htmlFor="sign-name">Your name</label>
      <input id="sign-name" className="sign-name" value={name} maxLength={NAME_MAX} placeholder="Auntie Wanjiku" onChange={e => setName(e.target.value)}/>

      <label className="lock-toggle chip-toggle">
        <input type="checkbox" checked={chip} disabled={!!token} onChange={e => setChip(e.currentTarget.checked)}/>
        <span><b>⚡ Chip in some sats</b><small>Optional. Everyone’s sats go into one gift for {to || 'them'}.</small></span>
      </label>
      {chip && (token
        ? <p className="chip-ready">✓ {sats.toLocaleString()} sats ready to add with your message</p>
        : <div className="chip-fund"><LightningFund funded={false} onFunded={funded} slot="card"/></div>)}

      {error && <p className="error" role="alert">{error}</p>}
      <div className="sign-actions">
        <button className="primary" disabled={!ready} onClick={submit}>{busy ? 'Adding your message…' : 'Sign the card ✍️'}</button>
        {chip && !token && <p className="hint">Mint your sats above first, or untick “Chip in” to just sign.</p>}
      </div>
    </section>
  );
}
