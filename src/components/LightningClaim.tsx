import { useEffect, useState } from 'react';
import { LnurlError, invoiceFor, lookupAddress, parsePayTarget } from '../lnurl';
import { makeTestInvoice } from '../testInvoice';
import { MeltQuoteState, findMint, mintErrorMessage, payQuote, payTotal, paymentState, quoteInvoice, quoteMax, type PayQuote, type PayResult } from '../mint';

type Phase = 'idle' | 'quoting' | 'ready' | 'paying' | 'pending' | 'done' | 'error';

function explain(e: unknown): string {
  if (e instanceof LnurlError) return e.message;
  const m = e instanceof Error ? e.message : '';
  if (m === 'SPENT') return 'This gift has already been claimed.';
  if (m === 'TOO_SMALL') return 'This gift is too small to pay out over Lightning after fees. Claim it with a Cashu wallet instead.';
  if (m === 'TEST_MODE') return 'SatsGift is in test mode and only pays out from test mints.';
  return mintErrorMessage(e);
}

/** Claim a gift straight to a Lightning address or invoice: quote → confirm → pay. */
export function LightningClaim({ token, mint, onPaid }: { token: string; mint: string; onPaid: () => void }) {
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [quote, setQuote] = useState<PayQuote | null>(null);
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<PayResult | null>(null);
  const [note, setNote] = useState('');
  const test = !!findMint(mint)?.test;

  async function priced(get: () => Promise<PayQuote>, label: string) {
    setPhase('quoting'); setError(''); setQuote(null);
    try { setQuote(await get()); setTarget(label); setPhase('ready'); }
    catch (e) { setError(explain(e)); setPhase('error'); }
  }

  function check() {
    const t = parsePayTarget(input);
    if (!t) { setError('Enter a Lightning address (name@wallet.com) or an invoice (lnbc…).'); setPhase('error'); return; }
    if (t.kind === 'address') {
      return priced(async () => { const params = await lookupAddress(t.address); return quoteMax(token, sats => invoiceFor(params, sats)); }, t.address);
    }
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
    try {
      const r = await payQuote(token, quote);
      setResult(r);
      if (r.state === MeltQuoteState.PAID) { setPhase('done'); onPaid(); }
      else if (r.state === MeltQuoteState.PENDING) setPhase('pending');
      else { setError('The payment didn’t go through. Your sats are still in the gift, so you can try again.'); setPhase('error'); }
    } catch (e) { setError(explain(e)); setPhase('error'); }
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
        if (state === MeltQuoteState.UNPAID) { setError('The payment didn’t go through. Your sats are back in the gift.'); setPhase('error'); return; }
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
      <p className="paid-title">⚡ {result.sent.toLocaleString()} sats sent to {target}!</p>
      {test && <p className="hint">Test mode: Testnut only pretends to pay, so nothing arrives in a real wallet.</p>}
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
      {test && <p className="warning-line">Test mode: Testnut only pretends to pay. Try any address or invoice; no real sats will arrive.</p>}
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
          <label htmlFor="ln-target">Lightning address or invoice</label>
          <input id="ln-target" value={input} placeholder="you@wallet.com or lnbc…" autoComplete="off" spellCheck={false}
            onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') check(); }}/>
          <p className="hint">Want shillings in M-Pesa? Every Kenyan number has a Lightning address through Tando: <b>07XXXXXXXX@bitcoin.co.ke</b></p>
          {phase === 'error' && <p className="error" role="alert">{error}</p>}
          <div className="share-actions">
            <button className="primary" disabled={!input.trim() || phase === 'quoting' || phase === 'paying'} onClick={check}>
              {phase === 'quoting' ? 'Checking fees…' : phase === 'paying' ? 'Sending…' : 'Check fees →'}
            </button>
            {test && <button className="text-button" disabled={phase === 'quoting'} onClick={tryTestInvoice}>No wallet handy? Use a test invoice</button>}
          </div>
        </>
      )}
    </div>
  );
}
