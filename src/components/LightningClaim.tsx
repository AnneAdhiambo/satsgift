import { useEffect, useState } from 'react';
import type { MeltQuoteBolt11Response } from '@cashu/cashu-ts';
import { LnurlError, invoiceFor, lookupAddress, parsePayTarget, tandoAddress } from '../lnurl';
import { makeTestInvoice } from '../testInvoice';
import { MeltQuoteState, findMint, mintErrorMessage, payQuote, payTotal, paymentState, quoteInvoice, quoteMax, type PayQuote, type PayResult } from '../mint';

type Phase = 'idle' | 'quoting' | 'ready' | 'paying' | 'pending' | 'done' | 'error';
type Mode = 'mpesa' | 'lightning';

function explain(e: unknown): string {
  if (e instanceof LnurlError) return e.message;
  const m = e instanceof Error ? e.message : '';
  if (m === 'SPENT') return 'This gift has already been claimed.';
  if (m === 'TOO_SMALL') return 'This gift is too small to pay out over Lightning after fees. Claim it with a Cashu wallet instead.';
  if (m === 'TEST_MODE') return 'SatsGift is in test mode and only pays out from test mints.';
  return mintErrorMessage(e);
}

/** Demo gifts have no sats: price them like a real mint would (≈2% reserve + 1 sat fee) without any network calls. */
function demoQuote(available: number): PayQuote {
  const feeReserve = Math.max(1, Math.ceil(available * 0.02)), inputFee = 1;
  return { quote: { quote: 'demo' } as unknown as MeltQuoteBolt11Response, amount: available - feeReserve - inputFee, feeReserve, inputFee, available };
}

type Props = { token: string; mint: string; amount: number; demo: boolean; onPaid: () => void };

/** Claim a gift to M-Pesa (via Tando) or any Lightning address/invoice: quote → confirm → pay. */
export function LightningClaim({ token, mint, amount, demo, onPaid }: Props) {
  const [mode, setMode] = useState<Mode>('mpesa');
  const [input, setInput] = useState('');
  const [phone, setPhone] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [quote, setQuote] = useState<PayQuote | null>(null);
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<PayResult | null>(null);
  const [note, setNote] = useState('');
  const test = !!findMint(mint)?.test;
  const busy = phase === 'quoting' || phase === 'paying';

  async function priced(get: () => Promise<PayQuote>, label: string) {
    setPhase('quoting'); setError(''); setQuote(null);
    try { setQuote(demo ? demoQuote(amount) : await get()); setTarget(label); setPhase('ready'); }
    catch (e) { setError(explain(e)); setPhase('error'); }
  }
  const fail = (message: string) => { setError(message); setPhase('error'); };

  /** Pay a Lightning address as much as the gift allows after fees. */
  const toAddress = (address: string, label: string) =>
    priced(async () => { const params = await lookupAddress(address); return quoteMax(token, sats => invoiceFor(params, sats)); }, label);

  function checkMpesa() {
    const address = tandoAddress(phone);
    if (!address) return fail('Enter a Kenyan M-Pesa number, like 0712 345 678.');
    return toAddress(address, `M-Pesa ${address.split('@')[0]}`);
  }

  function checkLightning() {
    const t = parsePayTarget(input);
    if (!t) return fail('Enter a Lightning address (name@wallet.com) or an invoice (lnbc…).');
    if (t.kind === 'address') return toAddress(t.address, t.address);
    return priced(async () => {
      const q = await quoteInvoice(token, t.invoice);
      if (payTotal(q) > q.available) {
        const canPay = Math.max(0, Math.floor((q.available - q.inputFee) / 1.02));
        throw new LnurlError(`This invoice asks for ${q.amount.toLocaleString()} sats, but after fees the gift can pay about ${canPay.toLocaleString()}. Make an invoice for that amount or less.`);
      }
      return q;
    }, 'your invoice');
  }

  // Test mode only: a signed throwaway invoice, so the payout can be tried without a wallet.
  function tryTestInvoice() {
    setInput('');
    return priced(() => quoteMax(token, async sats => makeTestInvoice(sats)), 'a test invoice');
  }

  async function pay() {
    if (!quote) return;
    setPhase('paying'); setError('');
    if (demo) {
      await new Promise(r => setTimeout(r, 900)); // let "Sending…" show, like a real payment
      setResult({ state: MeltQuoteState.PAID, sent: quote.amount, change: null, changeAmount: 0 });
      setPhase('done'); onPaid(); return;
    }
    try {
      const r = await payQuote(token, quote);
      setResult(r);
      if (r.state === MeltQuoteState.PAID) { setPhase('done'); onPaid(); }
      else if (r.state === MeltQuoteState.PENDING) setPhase('pending');
      else fail('The payment didn’t go through. Your sats are still in the gift, so you can try again.');
    } catch (e) { fail(explain(e)); }
  }

  // A payment the mint is still routing: check back until it settles.
  useEffect(() => {
    if (phase !== 'pending' || !quote) return;
    let active = true, timer = 0;
    const tick = async () => {
      try {
        const state = await paymentState(mint, quote.quote.quote);
        if (!active) return;
        if (state === MeltQuoteState.PAID) { setPhase('done'); onPaid(); return; }
        if (state === MeltQuoteState.UNPAID) { fail('The payment didn’t go through. Your sats are back in the gift.'); return; }
      } catch { /* keep checking */ }
      if (active) timer = window.setTimeout(tick, 3000);
    };
    timer = window.setTimeout(tick, 2000);
    return () => { active = false; clearTimeout(timer); };
  }, [phase, quote, mint]);

  async function copyChange() {
    try { await navigator.clipboard.writeText(result?.change ?? ''); setNote('Leftover copied. Paste it into a Cashu wallet.'); }
    catch { setNote('Clipboard unavailable.'); }
  }

  if (phase === 'done' && result) return (
    <div className="paid-panel" role="status">
      <p className="paid-title">{target.startsWith('M-Pesa') ? '📱' : '⚡'} {result.sent.toLocaleString()} sats sent to {target}!</p>
      {target.startsWith('M-Pesa') && <p className="hint">Tando turns the sats into shillings and sends them to that M-Pesa number.</p>}
      {demo && <p className="hint"><b>Demo gift:</b> nothing was actually sent. With a real gift, the money would be on its way now.</p>}
      {test && <p className="hint">Test mode: Testnut only pretends to pay, so nothing arrives for real.</p>}
      {result.change && <>
        <p className="hint">The mint returned <b>{result.changeAmount.toLocaleString()} sats</b> of unused fee reserve. They’re yours: keep them in a Cashu wallet.</p>
        <div className="share-actions">
          <a className="secondary" href={`cashu:${result.change}`}>Open leftover in wallet</a>
          <button className="secondary" onClick={copyChange}>Copy leftover</button>
        </div>
        <p role="status" className="notice">{note}</p>
      </>}
    </div>
  );

  if (phase === 'pending') return <p className="invoice-status" role="status"><i className="pulse-dot" aria-hidden="true"/>Payment on its way… this can take a minute.</p>;

  return (
    <div className="lightning-claim">
      {demo && <p className="warning-line">Demo gift: try the steps. Nothing is sent and no number is contacted.</p>}
      {test && <p className="warning-line">Test mode: Testnut only pretends to pay. Nothing will arrive for real.</p>}
      {(phase === 'ready' || phase === 'paying') && quote ? (
        <div className="pay-summary">
          <p>Send <b>{quote.amount.toLocaleString()} sats</b> to <b>{target}</b></p>
          <p className="hint">Fees: up to {quote.feeReserve.toLocaleString()} sats routing reserve{quote.inputFee ? ` + ${quote.inputFee} sat mint fee` : ''}. Any unused reserve comes back to you.</p>
          <div className="share-actions">
            <button className="primary" disabled={phase === 'paying'} onClick={pay}>{phase === 'paying' ? 'Sending…' : 'Send ⚡'}</button>
            {phase === 'ready' && <button className="text-button" onClick={() => { setPhase('idle'); setQuote(null); }}>Change</button>}
          </div>
        </div>
      ) : (
        <>
          <div className="mode-chips" role="radiogroup" aria-label="Where should the money go?">
            <button role="radio" aria-checked={mode === 'mpesa'} className={mode === 'mpesa' ? 'selected' : ''} onClick={() => { setMode('mpesa'); setPhase('idle'); }}>📱 M-Pesa</button>
            <button role="radio" aria-checked={mode === 'lightning'} className={mode === 'lightning' ? 'selected' : ''} onClick={() => { setMode('lightning'); setPhase('idle'); }}>⚡ Lightning wallet</button>
          </div>

          {mode === 'mpesa' ? <>
            <label htmlFor="mpesa-phone">M-Pesa number</label>
            <input id="mpesa-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} placeholder="0712 345 678"
              onChange={e => setPhone(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') checkMpesa(); }}/>
            <p className="hint">Arrives as Kenyan shillings, through <b>Tando</b>’s bitcoin-to-M-Pesa service. Tando takes KES 15–10,000 per payment, and the number may first need to be linked on Tando’s site.</p>
          </> : <>
            <label htmlFor="ln-target">Lightning address or invoice</label>
            <input id="ln-target" value={input} placeholder="you@wallet.com or lnbc…" autoComplete="off" spellCheck={false}
              onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') checkLightning(); }}/>
          </>}

          {phase === 'error' && <p className="error" role="alert">{error}</p>}
          <div className="share-actions">
            <button className="primary" disabled={busy || !(mode === 'mpesa' ? phone : input).trim()} onClick={mode === 'mpesa' ? checkMpesa : checkLightning}>
              {phase === 'quoting' ? 'Checking fees…' : 'Check fees →'}
            </button>
            {mode === 'lightning' && (test || demo) && <button className="text-button" disabled={busy} onClick={tryTestInvoice}>No wallet handy? Use a test invoice</button>}
          </div>
        </>
      )}
    </div>
  );
}
