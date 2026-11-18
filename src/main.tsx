import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { readGiftToken } from './token';
import QRCode from 'qrcode';
import './tokens.css';
import './app.css';
import './gift.css';

type Format = 'card' | 'scratch' | 'print';
// stripe: awning colour · ink: accent text that stays readable on paper · paper: card background · text: body ink
const themes = {
  coral: { stripe: '#e8553e', ink: '#c23b26', paper: '#fff6ee', text: '#3a1f1a' },
  lagoon: { stripe: '#1f9e95', ink: '#137067', paper: '#effaf7', text: '#173533' },
  sunshine: { stripe: '#f5b83d', ink: '#94600a', paper: '#fff8e6', text: '#3b2c0b' },
  night: { stripe: '#f5b83d', ink: '#f5b83d', paper: '#1f2f4a', text: '#fff3dc' },
};
type Theme = keyof typeof themes;
const formats: { id: Format; icon: string; name: string; text: string }[] = [
  { id: 'card', icon: '💌', name: 'Digital gift card', text: 'A personal card in an envelope with a QR code.' },
  { id: 'scratch', icon: '🪙', name: 'Scratch card', text: 'Recipient scratches off the foil to reveal the gift.' },
  { id: 'print', icon: '🖨️', name: 'Print voucher', text: 'A paper voucher with claim instructions.' },
];

function ThemePicker({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  return <div className="theme-picker"><div className="theme-picker-heading"><span>Theme</span><span className="theme-name" aria-live="polite">{theme}</span></div><div className="swatches" role="group" aria-label="Gift theme">{Object.entries(themes).map(([key, colors]) => <button key={key} type="button" title={`${key} theme`} aria-label={`${key} theme`} aria-pressed={theme === key} className={theme === key ? 'selected' : ''} style={{ background: `repeating-linear-gradient(90deg, ${colors.stripe} 0 7px, ${colors.paper} 7px 14px)` }} onClick={() => onChange(key as Theme)}/>)}</div></div>;
}

function Scratch({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [revealed, setRevealed] = useState(false);
  const down = useRef(false);
  const last = useRef<[number, number] | null>(null);
  const count = useRef(0);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const w = c.clientWidth, h = c.clientHeight, dpr = window.devicePixelRatio || 1;
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext('2d')!; ctx.scale(dpr, dpr);
    // Cabana foil: sunshine and cream stripes with a soft sheen.
    for (let x = 0, i = 0; x < w; x += 24, i++) { ctx.fillStyle = i % 2 ? '#fff1cc' : '#f2b632'; ctx.fillRect(x, 0, 24, h); }
    const sheen = ctx.createLinearGradient(0, 0, w, h);
    sheen.addColorStop(0, 'rgba(255,255,255,.3)'); sheen.addColorStop(.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(120,80,0,.18)');
    ctx.fillStyle = sheen; ctx.fillRect(0, 0, w, h);
    const bw = Math.min(w - 40, 270), bh = 128, bx = (w - bw) / 2, by = h / 2 - 78;
    ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 18); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillStyle = '#5a3d00';
    ctx.font = '34px Georgia'; ctx.fillText('☀', w / 2, by + 44);
    ctx.font = 'italic 700 20px Fraunces, Georgia, serif'; ctx.fillText('A little luck, a little love.', w / 2, by + 80);
    ctx.font = '700 11px "DM Sans", sans-serif'; ctx.fillText('S C R A T C H   T O   R E V E A L', w / 2, by + 108);
  }, []);
  function draw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!down.current || revealed) return;
    const c = e.currentTarget, rect = c.getBoundingClientRect(), ctx = c.getContext('2d')!;
    const p: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];
    ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = 48; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(...(last.current || p)); ctx.lineTo(...p); ctx.stroke();
    ctx.beginPath(); ctx.arc(...p, 24, 0, Math.PI * 2); ctx.fill(); last.current = p;
    if (++count.current % 8 === 0) {
      const data = ctx.getImageData(0, 0, c.width, c.height).data; let clear = 0, total = 0;
      for (let i = 3; i < data.length; i += 64) { total++; if (data[i] === 0) clear++; }
      if (clear / total > .4) setRevealed(true);
    }
  }
  return <div className="scratch-container">{children}{!revealed && <><canvas ref={ref} aria-label="Scratch the gold foil to reveal your gift" onPointerDown={e => { down.current = true; last.current = null; e.currentTarget.setPointerCapture(e.pointerId); draw(e); }} onPointerMove={draw} onPointerUp={() => { down.current = false; last.current = null; }} onPointerCancel={() => { down.current = false; last.current = null; }}/><button className="scratch-access" onClick={() => setRevealed(true)}>Reveal without scratching</button></>}</div>;
}

function App() {
  const [step, setStep] = useState(1);
  const [token, setToken] = useState('');
  const [demo, setDemo] = useState(false);
  const [amount, setAmount] = useState(0);
  const [mint, setMint] = useState('');
  const [error, setError] = useState('');
  const [valid, setValid] = useState(false);
  const [format, setFormat] = useState<Format>('card');
  const [theme, setTheme] = useState<Theme>('coral');
  const [to, setTo] = useState('');
  const [from, setFrom] = useState('');
  const [message, setMessage] = useState("Happy Birthday! Here’s something small for your big day.");
  const [qr, setQr] = useState('');
  const [qrError, setQrError] = useState('');
  const [opened, setOpened] = useState(false);
  const [replay, setReplay] = useState(0);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true; setQr(''); setQrError('');
    if (!valid || demo) return;
    QRCode.toDataURL(token, { width: 480, margin: 4, errorCorrectionLevel: 'L' }).then(url => { if (active) setQr(url); }).catch(() => { if (active) setQrError('This token is too large for a single QR code. Use Copy token.'); });
    return () => { active = false; };
  }, [token, valid, demo]);
  function readToken(raw: string) {
    const value = raw.trim().replace(/^web\+cashu:\/\//i, '').replace(/^cashu:\/\//i, '').replace(/^cashu:/i, '');
    setToken(value); setDemo(false); setValid(false); setError(''); setAmount(0); setMint('');
    if (!value) return;
    try {
      const decoded = readGiftToken(value);
      setAmount(decoded.amount); setMint(decoded.mint); setValid(true);
    } catch (e) { setError(e instanceof Error && /Please use|missing valid|mint address/.test(e.message) ? e.message : 'We couldn’t read that Cashu token. Paste a complete cashuA or cashuB token.'); }
  }
  function tryDemo() { setToken(''); setDemo(true); setValid(true); setAmount(1000); setMint('Demo mint · no real funds'); setError(''); }
  function go(n: number) { setStep(n); setNotice(''); setOpened(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  async function copyToken() { try { await navigator.clipboard.writeText(token); setNotice('Token copied. Share it privately with your recipient.'); } catch { setNotice('Clipboard unavailable. Go back to the token step to copy it manually.'); } }
  const t = themes[theme];
  const css = { '--accent': t.stripe, '--accent-ink': t.ink, '--paper': t.paper, '--card-ink': t.text } as React.CSSProperties;
  const card = <article className={`gift-card ${format === 'print' ? 'voucher' : ''}`} style={css}>
    <div className="card-stripe"/><div className="card-content"><span className="card-brand">SATSGIFT</span><p className="card-kicker">A little bitcoin for you</p><h2>For {to.trim() || 'you'}</h2><p className="handwritten">{message}</p><div className="gift-amount">{amount.toLocaleString()} <span>sats</span></div>
    <div className="qr-area">{demo ? <div className="demo-qr"><span>✧</span><strong>PREVIEW ONLY</strong><small>No redeemable funds</small></div> : qr ? <img src={qr} alt="Cashu token QR code. Scan with a compatible wallet to receive your gift."/> : <p>{qrError || 'Preparing QR code…'}</p>}</div>
    <p className="claim">{demo ? 'A little preview of a lovely gift.' : 'Scan with a Cashu wallet → Receive ecash'}</p>{from.trim() && <p className="signature">With love, {from}</p>}
    {format === 'print' && <div className="claim-guide"><strong>Your gift, in three little steps</strong><ol><li>Open a Cashu-compatible wallet.</li><li>Choose Receive ecash and scan this code.</li><li>Redeem your gift. Enjoy your sats!</li></ol><small>Keep private. Funds can only be redeemed once.</small></div>}</div><div className="card-stripe"/>
  </article>;
  return <><div className="floating-coins" aria-hidden="true">{[5, 22, 80, 94].map((left, i) => <span key={left} className="floating-coin" style={{ left: `${left}%`, top: `${[22, 74, 30, 66][i]}%`, animationDelay: `${-i * 2}s` }}>₿</span>)}</div>
  <div className="awning" aria-hidden="true"/>
  <header className="site-header"><a className="logo" href="./"><span className="logo-coin" aria-hidden="true"/>SatsGift</a><span className="header-tag">Gift · Scratch · Print</span></header>
  <main><section className="hero"><h1>Make sats <em>feel special</em></h1><p>Turn a Cashu token into a card, a scratch-off surprise or a printed voucher. Everything stays in your browser.</p></section>
  <div className="workspace"><nav className="stepper" aria-label="Gift creation progress">{['Token', 'Format', 'Personalise', 'Create'].map((label, i) => <button key={label} disabled={i + 1 > step} onClick={() => go(i + 1)} className={`step ${step === i + 1 ? 'active' : ''} ${step > i + 1 ? 'done' : ''}`} aria-current={step === i + 1 ? 'step' : undefined}><span>{step > i + 1 ? '✓' : i + 1}</span><b>{label}</b></button>)}</nav>
  <section className={`builder ${step === 4 ? 'final-builder' : ''}`}>
  {step === 1 && <div className="token-editor editor"><h2>Paste your Cashu token</h2><p className="muted">Use an existing token. We read the amount and mint right here — nothing is uploaded.</p><label htmlFor="token">Cashu token</label><textarea id="token" className="token-input" value={token} placeholder="cashuA…" onChange={e => readToken(e.target.value)} spellCheck={false} autoComplete="off"/>
  <button className="text-button" onClick={tryDemo}>Try a demo token</button>
  {error && <p className="error" role="alert">{error}</p>}{valid && <div className="token-status" role="status"><strong>{demo ? 'Demo mode — no real funds' : `✓ ${amount.toLocaleString()} sats read`}</strong><span>{mint}</span>{!demo && <small>Token decoded locally. Funds have not been checked with the mint.</small>}</div>}
  <div className="input-row token-details"><div><label htmlFor="amount">Amount (sats)</label><input id="amount" readOnly value={amount || ''} placeholder="Read from your token"/></div><div><label htmlFor="mint">Mint</label><input id="mint" readOnly value={mint} placeholder="https://…"/></div></div>
  <div className="navigation token-navigation"><button className="primary" disabled={!valid} onClick={() => go(2)}>Choose a format →</button></div></div>}
  {step === 2 && <div className="full-editor format-editor"><h2>Pick a gift format</h2><p className="muted">How would you like to hand over {amount.toLocaleString()} sats?</p><div className="format-options">{formats.map(f => <button key={f.id} className={`format-option format-${f.id} ${format === f.id ? 'selected' : ''}`} aria-pressed={format === f.id} onClick={() => setFormat(f.id)}><span className="format-icon" aria-hidden="true">{f.icon}</span><h3>{f.name}</h3><p>{f.text}</p></button>)}</div><div className="navigation"><button className="secondary" onClick={() => go(1)}>← Back</button><button className="primary" onClick={() => go(3)}>Personalise →</button></div></div>}
  {step === 3 && <div className="personalise-editor"><div className="builder-grid"><div className="editor"><h2>Make it personal</h2><p className="muted">Your preview updates as you type.</p><ThemePicker theme={theme} onChange={setTheme}/><div className="input-row"><div><label htmlFor="to">Recipient</label><input id="to" value={to} maxLength={50} placeholder="Amina" onChange={e => setTo(e.target.value)}/></div><div><label htmlFor="from">From</label><input id="from" value={from} maxLength={50} placeholder="Your name" onChange={e => setFrom(e.target.value)}/></div></div><label htmlFor="message">Message</label><textarea id="message" value={message} maxLength={140} onChange={e => setMessage(e.target.value)}/><div className="message-chips">{['Happy Birthday! 🎂', 'Congratulations!', 'Thank you so much', 'Karibu, enjoy!'].map(m => <button key={m} onClick={() => setMessage(m)}>{m}</button>)}</div></div><aside className="live-preview" aria-label="Live gift preview">{card}</aside></div><div className="navigation"><button className="secondary" onClick={() => go(2)}>← Back</button><button className="primary" onClick={() => go(4)}>Create gift ✨</button></div></div>}
  {step === 4 && <div className="full-editor gift-result"><span className="section-tag">{demo ? 'DEMO GIFT · NO REAL FUNDS' : 'READY FOR A LITTLE JOY'}</span><h2>{format === 'print' ? 'Good things come on paper.' : 'A little surprise awaits.'}</h2><p className="muted">{format === 'print' ? 'Print your voucher, or save it as a PDF to give privately.' : 'This is your gift preview. Open it and see their surprise.'}</p><div className="gift-stage" key={replay}>{format === 'print' ? card : !opened ? <button className="reveal-envelope" style={css} onClick={() => setOpened(true)} aria-label="Open your gift envelope"><span className="envelope-flap"/><span className="envelope-seal">₿</span><span className="envelope-to">For {to || 'someone special'}</span><span className="envelope-hint">Tap to open a little joy ↗</span></button> : format === 'scratch' ? <Scratch>{card}</Scratch> : card}</div><div className="result-actions"><button className="secondary" onClick={() => go(3)}>← Edit gift</button>{!demo && <button className="secondary" onClick={copyToken}>Copy token</button>}{format === 'print' ? <button className="primary" disabled={!!qrError || (!demo && !qr)} onClick={() => window.print()}>Print / save PDF ↗</button> : <button className="primary" onClick={() => { setOpened(false); setReplay(v => v + 1); }}>Replay the surprise ↻</button>}</div><p className="result-note">{format !== 'print' && 'Interactive sharing isn’t included yet. '}{demo ? 'Demo gifts are previews only and cannot be redeemed.' : 'Anyone holding this token may redeem it. Keep your gift private.'}</p><p role="status" className="notice">{notice}</p></div>}
  </section></div></main></>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
