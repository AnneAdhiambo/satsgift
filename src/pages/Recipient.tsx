import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { GiftCard, type CardCode } from '../components/GiftCard';
import { GiftReveal } from '../components/GiftReveal';
import { LightningClaim } from '../components/LightningClaim';
import { decodeGift, type Gift } from '../giftLink';
import { tokenClaimed } from '../mint';
import { themeStyle } from '../themes';
import { readGiftToken } from '../token';

type Loaded = { gift: Gift; amount: number; mint: string };
type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: Loaded };

export function Recipient({ encoded }: { encoded: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [claimed, setClaimed] = useState<boolean | null>(null); // null = unknown
  const [qr, setQr] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<'lightning' | 'cashu'>('lightning');
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' }); setClaimed(null); setRevealed(false); setQr(''); setPaid(false);
    decodeGift(encoded)
      .then(gift => {
        if (gift.demo) return { gift, amount: 1000, mint: 'Demo · no real funds' };
        const { amount, mint } = readGiftToken(gift.token);
        return { gift, amount, mint };
      })
      .then(data => {
        if (!active) return;
        setState({ status: 'ready', data });
        if (data.gift.demo) return;
        tokenClaimed(data.gift.token).then(c => { if (active) setClaimed(c); });
        QRCode.toDataURL(data.gift.token, { width: 480, margin: 4, errorCorrectionLevel: 'L' }).then(src => { if (active) setQr(src); }).catch(() => {});
      })
      .catch(e => { if (active) setState({ status: 'error', message: e instanceof Error && !/cashu/i.test(e.message) ? e.message : 'This gift link looks damaged. Ask the sender to share it again.' }); });
    return () => { active = false; };
  }, [encoded]);

  if (state.status === 'loading') return <div className="builder recipient"><div className="full-editor gift-result"><p className="muted">Unwrapping your gift…</p></div></div>;
  if (state.status === 'error') return (
    <div className="builder recipient"><div className="full-editor gift-result">
      <span className="section-tag">HMM…</span><h2>We couldn’t open this gift</h2><p className="muted">{state.message}</p>
      <a className="primary" href={location.pathname}>Make your own gift →</a>
    </div></div>
  );

  const { gift, amount } = state.data;
  const style = themeStyle(gift.theme);
  const from = gift.from.trim() || 'Someone';
  const code: CardCode = gift.demo ? { kind: 'demo' } : claimed || paid ? { kind: 'claimed' } : qr ? { kind: 'qr', src: qr, alt: 'Cashu token QR code. Scan with a Cashu wallet to receive your sats.' } : { kind: 'pending', text: 'Preparing your claim code…' };
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
        {claimed && <p className="claimed-banner" role="status">💌 This gift has already been claimed. If that wasn’t you, let {from} know.</p>}
        <GiftReveal format={gift.format} to={gift.to} card={card} style={style} onRevealed={() => setRevealed(true)}/>

        {revealed && !claimed && (
          <section className="claim-panel" aria-labelledby="claim-title">
            <h3 id="claim-title">{gift.demo ? 'This is a demo gift' : paid ? 'Claimed! 🎉' : `Claim your ${amount.toLocaleString()} sats`}</h3>
            {gift.demo
              ? <p className="hint">Demo gifts have no real sats inside. Make a real one for someone you love.</p>
              : <>
                  {!paid && (
                    <div className="fund-tabs" role="tablist" aria-label="How to claim">
                      <button role="tab" id="tab-ln" aria-controls="claim-ln" aria-selected={tab === 'lightning'} onClick={() => setTab('lightning')}>⚡ Lightning / M-Pesa</button>
                      <button role="tab" id="tab-cashu" aria-controls="claim-cashu" aria-selected={tab === 'cashu'} onClick={() => setTab('cashu')}>Cashu wallet</button>
                    </div>
                  )}
                  {/* Both panels stay mounted so a payment in progress is never lost by switching tabs. */}
                  <div role="tabpanel" id="claim-ln" aria-labelledby="tab-ln" hidden={tab !== 'lightning'}>
                    <LightningClaim token={gift.token} mint={state.data.mint} onPaid={() => setPaid(true)}/>
                  </div>
                  <div role="tabpanel" id="claim-cashu" aria-labelledby="tab-cashu" hidden={tab !== 'cashu' || paid}>
                    <p className="hint">Scan the QR on your card with a Cashu wallet, or tap below. No wallet yet? Try <b>Minibits</b> on your phone or <b>Cashu.me</b> in your browser.</p>
                    <div className="share-actions">
                      <a className="primary" href={`cashu:${gift.token}`}>Open in Cashu wallet</a>
                      <button className="secondary" onClick={copyToken}>Copy token</button>
                    </div>
                    <p role="status" className="notice">{notice}</p>
                  </div>
                  {!paid && <p className="warning-line">Claim soon: until you do, anyone with this link could claim it first.</p>}
                </>}
          </section>
        )}
        <p className="result-note"><a className="text-button" href={location.pathname}>Send a gift of your own →</a></p>
      </div>
    </div>
  );
}
