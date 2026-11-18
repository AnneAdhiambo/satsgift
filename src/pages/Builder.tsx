import { useEffect, useMemo, useState } from 'react';
import { readGiftToken } from '../token';
import { themeStyle, type Format, type Theme } from '../themes';
import type { Gift } from '../giftLink';
import { storage, type Draft } from '../storage';
import { GiftCard } from '../components/GiftCard';
import { FundStep } from '../steps/FundStep';
import { FormatStep } from '../steps/FormatStep';
import { PersonaliseStep } from '../steps/PersonaliseStep';
import { ShareStep } from '../steps/ShareStep';

const STEPS = ['Sats', 'Format', 'Personalise', 'Share'];
const DEFAULT_MESSAGE = 'Happy Birthday! Here’s something small for your big day.';
const DEMO = { amount: 1000, mint: 'Demo mint · no real funds' };

type Funds = { token: string; demo: boolean; amount: number; mint: string };
const EMPTY: Funds = { token: '', demo: false, amount: 0, mint: '' };

/** Decode a trusted token (freshly minted or swapped). Returns null if it can't be read. */
function fundsFrom(token: string, demo: boolean): Funds | null {
  if (demo) return { token: '', demo: true, ...DEMO };
  if (!token) return null;
  try { const t = readGiftToken(token); return { token: t.token, demo: false, amount: t.amount, mint: t.mint }; } catch { return null; }
}

/** The sender's side: fund → format → personalise → share. Never shows a claimable token QR. */
export function Builder() {
  // Restore whatever was in progress before a refresh.
  const [initial] = useState(() => {
    const draft = storage.loadDraft();
    const funds = draft ? fundsFrom(draft.token, draft.demo) : null;
    return { draft, funds };
  });
  const d = initial.draft;
  const [funds, setFunds] = useState<Funds>(initial.funds ?? EMPTY);
  const [step, setStep] = useState(initial.funds ? d!.step : 1);
  const [format, setFormat] = useState<Format>(d?.format ?? 'card');
  const [theme, setTheme] = useState<Theme>(d?.theme ?? 'coral');
  const [to, setTo] = useState(d?.to ?? '');
  const [from, setFrom] = useState(d?.from ?? '');
  const [message, setMessage] = useState(d?.message || DEFAULT_MESSAGE);
  const [notice, setNotice] = useState('');
  const [saving] = useState(() => storage.available());
  const valid = funds.demo || !!funds.token;

  // Save on every change.
  useEffect(() => {
    const draft: Draft = { step, token: funds.token, demo: funds.demo, format, theme, to, from, message };
    storage.saveDraft(draft);
  }, [step, funds, format, theme, to, from, message]);

  /** Never drop real sats silently: an unshared token being replaced goes to "Your gifts". */
  function keepCurrent() {
    if (funds.token && !funds.demo && !storage.loadGifts().some(g => g.token === funds.token)) storage.saveGift({ token: funds.token, amount: funds.amount, mint: funds.mint, to: '', from: '', link: '', createdAt: Date.now() });
  }
  function onFunded(token: string) {
    const next = fundsFrom(token, false);
    if (!next) { setNotice('The mint sent back a token we couldn’t read. Please try again.'); return; }
    if (next.token !== funds.token) keepCurrent();
    setFunds(next); setNotice('');
  }
  function tryDemo() { keepCurrent(); setFunds(fundsFrom('', true)!); setNotice(''); }
  function go(n: number) { setStep(n); setNotice(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function startNew() {
    // The shared gift is already in "Your gifts"; start a clean draft.
    setFunds(EMPTY); setTo(''); setFrom(''); setMessage(DEFAULT_MESSAGE); setFormat('card'); setTheme('coral');
    go(1);
  }
  async function copyToken() {
    try { await navigator.clipboard.writeText(funds.token); setNotice('Backup copied. Keep it private: whoever holds it can claim the sats.'); }
    catch { setNotice('Clipboard unavailable. Find this gift under “Your gifts” instead.'); }
  }

  const style = themeStyle(theme);
  const gift = useMemo<Gift>(() => ({ token: funds.token, demo: funds.demo, to, from, message, theme, format }), [funds, to, from, message, theme, format]);
  const previewCard = <GiftCard format={format} to={to} from={from} message={message} amount={funds.amount} style={style}
    code={funds.demo ? { kind: 'demo' } : { kind: 'hidden' }} claimLine={funds.demo ? 'A little preview of a lovely gift.' : 'Your recipient’s claim code appears here.'}/>;

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
        {step === 1 && <FundStep demo={funds.demo} valid={valid} amount={funds.amount} mint={funds.mint} notice={notice} saving={saving}
          onDemo={tryDemo} onFunded={onFunded} onCopy={copyToken} onNext={() => go(2)}/>}
        {step === 2 && <FormatStep amount={funds.amount} format={format} onChange={setFormat} onBack={() => go(1)} onNext={() => go(3)}/>}
        {step === 3 && <PersonaliseStep theme={theme} to={to} from={from} message={message} card={previewCard}
          onTheme={setTheme} onTo={setTo} onFrom={setFrom} onMessage={setMessage} onBack={() => go(2)} onNext={() => go(4)}/>}
        {step === 4 && <ShareStep gift={gift} amount={funds.amount} mint={funds.mint} style={style} notice={notice}
          onEdit={() => go(3)} onCopyBackup={copyToken} onStartNew={startNew}/>}
      </section>
    </div>
  </>;
}
