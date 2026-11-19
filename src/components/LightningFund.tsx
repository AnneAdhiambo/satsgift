import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { DEFAULT_MINT, MAX_SATS, MIN_SATS, MintQuoteState, claimInvoice, createInvoice, invoiceState, mintErrorMessage, type Invoice } from '../mint';
import { storage } from '../storage';
import { cleanAmount as clean } from '../amount';
import { MintSteps } from './MintSteps';

const cleanAmount = (raw: string) => clean(raw, MAX_SATS);

type Phase = 'idle' | 'creating' | 'waiting' | 'minting' | 'claim-failed' | 'error' | 'done';
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
const PRESETS = [100, 1000, 5000, 21000];
const POLL_MS = 2500;

/**
 * Fund a gift by paying a Lightning invoice: create a mint quote, show it as a QR,
 * poll until paid, then mint fresh proofs and hand the token to the parent.
 */
export function LightningFund({ funded, onFunded }: { funded: boolean; onFunded: (token: string) => void }) {
  const mint = DEFAULT_MINT;
  const [amount, setAmount] = useState('1000');
  // An invoice saved before a refresh is picked up again, so a payment is never stranded.
  const [invoice, setInvoice] = useState<Invoice | null>(() => storage.loadInvoice());
  const [phase, setPhase] = useState<Phase>(() => (invoice ? 'waiting' : 'idle'));
  const [resumed] = useState(() => !!invoice);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const sats = Number(amount);
  const amountOk = Number.isInteger(sats) && sats >= MIN_SATS && sats <= MAX_SATS;

  useEffect(() => {
    let active = true; setQr('');
    // Upper-case BOLT11 fits a denser (alphanumeric) QR and wallets accept it.
    if (invoice) QRCode.toDataURL(`lightning:${invoice.request}`.toUpperCase(), { width: 360, margin: 2, errorCorrectionLevel: 'M' }).then(url => { if (active) setQr(url); }).catch(() => {});
    return () => { active = false; };
  }, [invoice]);

  async function claim(inv: Invoice) {
    setPhase('minting'); setError('');
    try {
      await pause(600); // let each step of the tracker be seen
      const token = await claimInvoice(inv);
      // Hand over even if this component has unmounted: the sats must not be dropped.
      onFunded(token);
      storage.clearInvoice();
      setPhase('done'); setInvoice(null);
    } catch (e) {
      setError(`Your payment arrived, but collecting the sats failed. ${mintErrorMessage(e)}`);
      setPhase('claim-failed');
    }
  }

  // Poll the mint until the invoice is paid or expires.
  useEffect(() => {
    if (phase !== 'waiting' || !invoice) return;
    let active = true, timer = 0;
    const tick = async () => {
      try {
        const state = await invoiceState(invoice);
        if (!active) return;
        if (state === MintQuoteState.PAID) return void claim(invoice);
        if (state === MintQuoteState.ISSUED) { storage.clearInvoice(); setError('These sats were already collected.'); setPhase('error'); return; }
        if (invoice.expiry && Date.now() / 1000 > invoice.expiry) { storage.clearInvoice(); setError('This invoice expired. Create a new one.'); setPhase('error'); return; }
      } catch { /* network blip: keep polling */ }
      if (active) timer = window.setTimeout(tick, POLL_MS);
    };
    timer = window.setTimeout(tick, 1200);
    return () => { active = false; clearTimeout(timer); };
  }, [phase, invoice]);

  async function start() {
    setPhase('creating'); setError(''); setCopied(false);
    try { const inv = await createInvoice(mint.url, sats); storage.saveInvoice(inv); setInvoice(inv); setPhase('waiting'); }
    catch (e) { setError(mintErrorMessage(e)); setPhase('error'); }
  }
  function cancel() { storage.clearInvoice(); setInvoice(null); setPhase('idle'); setError(''); }
  async function copyInvoice() {
    if (!invoice) return;
    try { await navigator.clipboard.writeText(invoice.request); setCopied(true); } catch { setCopied(false); }
  }

  if (phase === 'creating') return <MintSteps current={0} test={mint.test}/>;

  if (phase === 'done') return <>
    <MintSteps current={4} test={mint.test}/>
    <button className="text-button" onClick={() => setPhase('idle')}>Mint a different amount</button>
  </>;

  if (invoice && (phase === 'waiting' || phase === 'minting' || phase === 'claim-failed')) {
    return <>
      <MintSteps current={phase === 'waiting' ? 1 : 2} test={mint.test}/>
      <div className="invoice-panel">
        <div className="invoice-qr">{qr ? <img src={qr} alt={`Lightning invoice for ${invoice.amount.toLocaleString()} sats`}/> : <span>Preparing invoice…</span>}</div>
        <div className="invoice-info">
          <strong className="invoice-amount">{invoice.amount.toLocaleString()} <span>sats</span></strong>
          {phase === 'waiting' && <p className="invoice-status" role="status"><i className="pulse-dot" aria-hidden="true"/>Waiting for payment…</p>}
          {resumed && phase === 'waiting' && <p className="hint">Picked up your invoice from before. If you already paid, your sats arrive in a moment.</p>}
          {phase === 'minting' && <p className="invoice-status paid" role="status">⚡ Paid! The mint is blind-signing your ecash…</p>}
          {phase === 'claim-failed' && <p className="error" role="alert">{error}</p>}
          {mint.test && phase === 'waiting' && <p className="hint">Testnut pays its own invoices, so this finishes in a few seconds. No real bitcoin moves.</p>}
          <div className="invoice-actions">
            {phase === 'claim-failed'
              ? <button className="primary" onClick={() => claim(invoice)}>Try collecting again</button>
              : <>
                  <a className="secondary" href={`lightning:${invoice.request}`}>Open wallet</a>
                  <button className="secondary" onClick={copyInvoice}>{copied ? 'Copied ✓' : 'Copy invoice'}</button>
                </>}
            {phase === 'waiting' && <button className="text-button" onClick={cancel}>Cancel</button>}
          </div>
        </div>
      </div>
    </>;
  }

  return (
    <div className="lightning-form">
      <div className="mint-chip"><span aria-hidden="true">🏦</span> Mint: <b>{mint.name}</b>{mint.test && <em>test mint · not real bitcoin</em>}</div>
      {funded && <p className="hint">Your sats are ready below. A new invoice will replace them, so copy the backup token first.</p>}
      <label htmlFor="ln-amount">Amount (sats)</label>
      <input id="ln-amount" inputMode="numeric" value={amount} maxLength={String(MAX_SATS).length} onChange={e => setAmount(cleanAmount(e.target.value))} aria-describedby="ln-amount-help"/>
      <div className="message-chips amount-chips">
        {PRESETS.map(p => <button key={p} type="button" aria-pressed={sats === p} className={sats === p ? 'selected' : ''} onClick={() => setAmount(String(p))}>{p.toLocaleString()}</button>)}
      </div>
      <p id="ln-amount-help" className={amountOk || !amount ? 'hint' : 'hint error'} role={amountOk ? undefined : 'alert'}>{amountOk ? (mint.test ? 'Free test sats: Testnut pays this invoice for you within a few seconds.' : 'Pay from any Lightning wallet.') : `Choose between ${MIN_SATS} and ${MAX_SATS.toLocaleString()} sats.`}</p>
      {phase === 'error' && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={!amountOk} onClick={start}>
        Mint ecash 🥜
      </button>
    </div>
  );
}
