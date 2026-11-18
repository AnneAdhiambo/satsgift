import { useMemo, useState } from 'react';
import { readGiftToken, stripTokenPrefix } from '../token';
import { themeStyle, type Format, type Theme } from '../themes';
import type { Gift } from '../giftLink';
import { GiftCard } from '../components/GiftCard';
import { FundStep } from '../steps/FundStep';
import { FormatStep } from '../steps/FormatStep';
import { PersonaliseStep } from '../steps/PersonaliseStep';
import { ShareStep } from '../steps/ShareStep';

const STEPS = ['Sats', 'Format', 'Personalise', 'Share'];

/** The sender's side: fund → format → personalise → share. Never shows a claimable token QR. */
export function Builder() {
  const [step, setStep] = useState(1);
  // Funding
  const [token, setToken] = useState('');
  const [demo, setDemo] = useState(false);
  const [valid, setValid] = useState(false);
  const [amount, setAmount] = useState(0);
  const [mint, setMint] = useState('');
  const [error, setError] = useState('');
  // Gift design
  const [format, setFormat] = useState<Format>('card');
  const [theme, setTheme] = useState<Theme>('coral');
  const [to, setTo] = useState('');
  const [from, setFrom] = useState('');
  const [message, setMessage] = useState('Happy Birthday! Here’s something small for your big day.');
  const [notice, setNotice] = useState('');

  function readToken(raw: string) {
    const value = stripTokenPrefix(raw);
    setToken(value); setDemo(false); setValid(false); setError(''); setAmount(0); setMint(''); setNotice('');
    if (!value) return;
    try {
      const decoded = readGiftToken(value);
      setAmount(decoded.amount); setMint(decoded.mint); setValid(true);
    } catch (e) {
      setError(e instanceof Error && /Please use|missing valid|mint address/.test(e.message) ? e.message : 'We couldn’t read that Cashu token. Paste a complete cashuA or cashuB token.');
    }
  }
  function tryDemo() { setToken(''); setDemo(true); setValid(true); setAmount(1000); setMint('Demo mint · no real funds'); setError(''); setNotice(''); }
  function go(n: number) { setStep(n); setNotice(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  async function copyToken() {
    try { await navigator.clipboard.writeText(token); setNotice('Backup copied. Keep it private: whoever holds it can claim the sats.'); }
    catch { setNotice('Clipboard unavailable. Use the Paste a token tab to copy it manually.'); }
  }

  const style = themeStyle(theme);
  const gift = useMemo<Gift>(() => ({ token, demo, to, from, message, theme, format }), [token, demo, to, from, message, theme, format]);
  const previewCard = <GiftCard format={format} to={to} from={from} message={message} amount={amount} style={style}
    code={demo ? { kind: 'demo' } : { kind: 'hidden' }} claimLine={demo ? 'A little preview of a lovely gift.' : 'Your recipient’s claim code appears here.'}/>;

  return <>
    <section className="hero">
      <h1>Make sats <em>feel special</em></h1>
      <p>Turn sats into a card, a scratch-off surprise or a printed voucher. Everything stays in your browser.</p>
    </section>
    <div className="workspace">
      <nav className="stepper" aria-label="Gift creation progress">
        {STEPS.map((label, i) => (
          <button key={label} disabled={i + 1 > step} onClick={() => go(i + 1)} className={`step ${step === i + 1 ? 'active' : ''} ${step > i + 1 ? 'done' : ''}`} aria-current={step === i + 1 ? 'step' : undefined}>
            <span>{step > i + 1 ? '✓' : i + 1}</span><b>{label}</b>
          </button>
        ))}
      </nav>
      <section className={`builder ${step === 4 ? 'final-builder' : ''}`}>
        {step === 1 && <FundStep token={token} demo={demo} valid={valid} amount={amount} mint={mint} error={error} notice={notice}
          onPaste={readToken} onDemo={tryDemo} onFunded={readToken} onCopy={copyToken} onNext={() => go(2)}/>}
        {step === 2 && <FormatStep amount={amount} format={format} onChange={setFormat} onBack={() => go(1)} onNext={() => go(3)}/>}
        {step === 3 && <PersonaliseStep theme={theme} to={to} from={from} message={message} card={previewCard}
          onTheme={setTheme} onTo={setTo} onFrom={setFrom} onMessage={setMessage} onBack={() => go(2)} onNext={() => go(4)}/>}
        {step === 4 && <ShareStep gift={gift} amount={amount} style={style} notice={notice} onEdit={() => go(3)} onCopyBackup={copyToken}/>}
      </section>
    </div>
  </>;
}
