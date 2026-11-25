import { useEffect, useRef, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { GiftCard, type CardCode } from '../components/GiftCard';
import { GiftReveal } from '../components/GiftReveal';
import { LightningClaim } from '../components/LightningClaim';
import { Letter } from '../components/Letter';
import { decodeGift, unlockGift, type Gift } from '../giftLink';
import { WrongSecret } from '../giftLock';
import { tokenClaimed } from '../mint';
import { themeStyle } from '../themes';
import { readGiftToken } from '../token';

type Loaded = { gift: Gift; amount: number; mint: string; unlocked: boolean };
type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'locked'; gift: Gift } | { status: 'ready'; data: Loaded };

const damaged = (e: unknown) => e instanceof Error && !/cashu/i.test(e.message) ? e.message : 'This gift link looks damaged. Ask the sender to share it again.';

export function Recipient({ encoded }: { encoded: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [claimed, setClaimed] = useState<boolean | null>(null); // null = unknown
  const [qr, setQr] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<'lightning' | 'cashu'>('lightning');
  const [paid, setPaid] = useState(false);
  const [secret, setSecret] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const shown = useRef(encoded); // the link on screen, so late results from an older link are ignored

  /** Read the (unlocked) token, then check it with the mint and draw its QR. */
  function open(gift: Gift, unlocked: boolean, current: () => boolean) {
    const data: Loaded = gift.demo ? { gift, amount: 1000, mint: 'Demo · no real funds', unlocked } : { gift, ...readGiftToken(gift.token), unlocked };
    setState({ status: 'ready', data });
    if (gift.demo) return;
    tokenClaimed(gift.token).then(c => { if (current()) setClaimed(c); });
    QRCode.toDataURL(gift.token, { width: 480, margin: 4, errorCorrectionLevel: 'L' }).then(src => { if (current()) setQr(src); }).catch(() => {});
  }

  useEffect(() => {
    let active = true;
    const current = () => active;
    shown.current = encoded;
    setState({ status: 'loading' }); setClaimed(null); setRevealed(false); setQr(''); setPaid(false); setSecret(''); setUnlockError('');
    decodeGift(encoded)
      .then(gift => {
        if (!active) return;
        if (gift.sealed) setState({ status: 'locked', gift });
        else open(gift, false, current);
      })
      .catch(e => { if (active) setState({ status: 'error', message: damaged(e) }); });
    return () => { active = false; };
  }, [encoded]);

  if (state.status === 'loading') return <div className="builder recipient"><div className="full-editor gift-result"><p className="muted">Unwrapping your gift…</p></div></div>;
  if (state.status === 'error') return (
    <div className="builder recipient"><div className="full-editor gift-result">
      <span className="section-tag">HMM…</span><h2>We couldn’t open this gift</h2><p className="muted">{state.message}</p>
      <a className="primary" href={location.pathname}>Make your own gift →</a>
    </div></div>
  );

  if (state.status === 'locked') {
    const locked = state.gift;
    const sealed = locked.sealed!;
    const sender = locked.from.trim() || 'the sender';
    const isCode = sealed.kind === 'code';
    const link = encoded;
    async function unlock(e: FormEvent) {
      e.preventDefault();
      if (unlocking) return;
      setUnlocking(true); setUnlockError('');
      try {
        const gift = await unlockGift(locked, secret);
        if (shown.current === link) open(gift, true, () => shown.current === link);
      } catch (err) {
        setUnlockError(err instanceof WrongSecret
          ? `${err.message} ${isCode ? `Check the code ${sender} sent you` : 'Check the spelling'} and try again.`
          : damaged(err));
      } finally { setUnlocking(false); }
    }
    return (
      <div className="builder recipient">
        <div className="full-editor gift-result">
          <span className="section-tag">{locked.demo ? 'DEMO GIFT · NO REAL FUNDS' : `A GIFT FOR ${(locked.to.trim() || 'YOU').toUpperCase()}`}</span>
          <h2>{locked.from.trim() || 'Someone'} sent you a little something</h2>
          <p className="muted">{isCode ? `It’s locked. Enter the code ${sender} sent you to open it.` : `It’s locked with a question only you can answer.`}</p>
          <div className="gift-stage">
            <div className="reveal-envelope locked-envelope" style={themeStyle(locked.theme)} aria-hidden="true">
              <span className="envelope-flap"/><span className="envelope-seal">🔒</span>
              {locked.from.trim() && <span className="envelope-from">From {locked.from}</span>}
              <span className="envelope-to">For {locked.to || 'someone special'}</span>
            </div>
          </div>
          <form className="share-panel unlock-form" onSubmit={unlock}>
            <label htmlFor="unlock-secret">{isCode ? `Code from ${sender}` : sealed.question || 'Your answer'}</label>
            <input id="unlock-secret" value={secret} onChange={e => { setSecret(e.currentTarget.value); setUnlockError(''); }}
              placeholder={isCode ? 'e.g. K7QM-4XPA' : 'Your answer'} autoComplete="off" spellCheck={false}
              autoCapitalize={isCode ? 'characters' : 'off'} className={isCode ? 'code-input' : undefined} aria-invalid={!!unlockError} aria-describedby="unlock-help"/>
            <div className="share-actions"><button className="primary" disabled={unlocking || !secret.trim()}>{unlocking ? 'Opening…' : 'Open my gift 🔓'}</button></div>
            {unlockError
              ? <p id="unlock-help" className="error" role="alert">{unlockError}</p>
              : <p id="unlock-help" className="hint">{isCode ? 'Capitals, spaces and dashes don’t matter.' : 'Capitals and extra spaces don’t matter.'}</p>}
          </form>
          <p className="result-note"><a className="text-button" href={location.pathname}>Send a gift of your own →</a></p>
        </div>
      </div>
    );
  }

  const { gift, amount, unlocked } = state.data;
  const style = themeStyle(gift.theme);
  const from = gift.from.trim() || 'Someone';
  const code: CardCode = claimed || paid ? { kind: 'claimed' } : gift.demo ? { kind: 'demo' } : qr ? { kind: 'qr', src: qr, alt: 'Cashu token QR code. Scan with a Cashu wallet to receive your sats.' } : { kind: 'pending', text: 'Preparing your claim code…' };
  const card = <GiftCard format={gift.format} to={gift.to} from={gift.from} message={gift.message} amount={amount} code={code}
    claimLine={gift.demo ? 'A little preview of a lovely gift.' : 'Scan with a Cashu wallet → Receive ecash'} style={style}/>;

  async function copyToken() {
    try { await navigator.clipboard.writeText(gift.token); setNotice('Copied! Paste it into your Cashu wallet’s Receive screen.'); }
    catch { setNotice('Clipboard unavailable. Scan the QR code instead.'); }
  }

  return (
    <div className="builder recipient">
      <div className="full-editor gift-result">
        <span className="section-tag">{gift.demo ? 'DEMO GIFT · NO REAL FUNDS' : `A GIFT FOR ${(gift.to.trim() || 'YOU').toUpperCase()}`}</span>
        <h2>{from} sent you a little something</h2>
        <p className="muted">{gift.format === 'print' ? 'Here’s your voucher. Claim the sats below.' : gift.format === 'scratch' ? 'Open the envelope, then scratch the foil.' : 'Open the envelope to see your gift.'}</p>
        {claimed && <p className="claimed-banner" role="status">💌 This gift has already been claimed, or {from} took it back. If that wasn’t you, let {from} know.</p>}
        <GiftReveal format={gift.format} to={gift.to} card={card} style={style} onRevealed={() => setRevealed(true)} startOpen={unlocked}
          from={gift.letter ? gift.from : undefined} occasion={gift.letter?.occasion}
          letter={gift.letter && <Letter from={gift.from} to={gift.to} letter={gift.letter} personal={gift.message} style={style}/>}/>

        {revealed && !claimed && (
          <section className="claim-panel" aria-labelledby="claim-title">
            <h3 id="claim-title">{paid ? 'Claimed! 🎉' : `Claim your ${amount.toLocaleString()} sats`}</h3>
            {!paid && (
              <div className="fund-tabs" role="tablist" aria-label="How to claim">
                <button role="tab" id="tab-ln" aria-controls="claim-ln" aria-selected={tab === 'lightning'} onClick={() => setTab('lightning')}>M-Pesa / Lightning</button>
                <button role="tab" id="tab-cashu" aria-controls="claim-cashu" aria-selected={tab === 'cashu'} onClick={() => setTab('cashu')}>Cashu wallet</button>
              </div>
            )}
            {/* Both panels stay mounted so a payment in progress is never lost by switching tabs. */}
            <div role="tabpanel" id="claim-ln" aria-labelledby="tab-ln" hidden={tab !== 'lightning'}>
              <LightningClaim token={gift.token} mint={state.data.mint} amount={amount} demo={gift.demo} onPaid={() => setPaid(true)}/>
            </div>
            <div role="tabpanel" id="claim-cashu" aria-labelledby="tab-cashu" hidden={tab !== 'cashu' || paid}>
              {gift.demo
                ? <p className="hint">Demo gifts have no real token. With a real gift, you’d tap <b>Open in Cashu wallet</b> or scan the QR on your card with a wallet like <b>Minibits</b> or <b>Cashu.me</b>.</p>
                : <>
                    <p className="hint">Scan the QR on your card with a Cashu wallet, or tap below. No wallet yet? Try <b>Minibits</b> on your phone or <b>Cashu.me</b> in your browser.</p>
                    <div className="share-actions">
                      <a className="primary" href={`cashu:${gift.token}`}>Open in Cashu wallet</a>
                      <button className="secondary" onClick={copyToken}>Copy token</button>
                    </div>
                    <p role="status" className="notice">{notice}</p>
                  </>}
            </div>
            {!paid && !gift.demo && <p className="warning-line">{unlocked ? 'Claim soon: until you do, anyone with this link and the code could claim it first.' : 'Claim soon: until you do, anyone with this link could claim it first.'}</p>}
          </section>
        )}
        <p className="result-note"><a className="text-button" href={location.pathname}>Send a gift of your own →</a></p>
      </div>
    </div>
  );
}
