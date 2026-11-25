import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { LightningFund } from '../components/LightningFund';
import { Letter } from '../components/Letter';
import { ThemePicker } from '../components/ThemePicker';
import { cleanAmount } from '../amount';
import { encodeGift, giftUrl, type Gift } from '../giftLink';
import { generateCode } from '../giftLock';
import { DEFAULT_MINT, mintErrorMessage, splitForTeam } from '../mint';
import { storage, watchGifts, type SentGift, type TeamDraft } from '../storage';
import {
  LETTER_MAX, NAME_MAX, NOTE_MAX, SIGNED_BY_MAX, TEAM_FEE_PER_RECIPIENT, TEAM_MAX_RECIPIENTS, TEAM_MAX_SATS_EACH,
  newTeamId, teamCsv, teamProblems, teamTotals, type TeamRecipient,
} from '../teamSend';
import { themeStyle } from '../themes';
import { readGiftToken } from '../token';

const STEPS = ['Letter', 'People', 'Pay', 'Send'];
const DEFAULT_LETTER = 'Thank you for everything you brought to this year. Here’s a little bitcoin to say how much we appreciate you.';
const blankRow = (sats = 1000): TeamRecipient => ({ name: '', sats, note: '' });

function freshDraft(): TeamDraft {
  return { id: newTeamId(), step: 1, company: '', letter: DEFAULT_LETTER, signedBy: '', theme: 'lagoon', format: 'scratch', lock: true, recipients: [blankRow()], paidToken: '' };
}

/** This team send's gifts, in the order the recipients were listed. */
const teamGifts = (id: string) => storage.loadGifts().filter(g => g.team === id).sort((a, b) => b.createdAt - a.createdAt);

/** One sender → many recipients: write a letter, list the people, pay once, get a gift link per person. */
export function TeamBuilder() {
  const [d, setD] = useState<TeamDraft>(() => storage.loadTeam() ?? freshDraft());
  const latest = useRef(d); latest.current = d;
  const [saving] = useState(() => storage.available());
  const [splitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState('');
  useEffect(() => { storage.saveTeam(d); }, [d]);

  const set = (patch: Partial<TeamDraft>) => setD(prev => ({ ...prev, ...patch }));
  const go = (step: number) => { set({ step }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const style = themeStyle(d.theme);
  const totals = teamTotals(d.recipients);
  const problems = teamProblems(d.recipients);
  const company = d.company.trim();
  const split = d.step === 4;

  /** The payment arrived: save the sats first, then split them into one gift per person. */
  function onPaid(token: string) {
    const cur = latest.current;
    let amount = 0, mint = '';
    try { ({ amount, mint } = readGiftToken(token)); } catch { /* still saved below */ }
    storage.saveGift({ token, amount, mint, to: '', from: cur.company.trim(), link: '', team: cur.id, teamName: cur.company.trim(), createdAt: Date.now() });
    setD(prev => ({ ...prev, paidToken: token }));
    void splitPaid(token);
  }

  async function splitPaid(token: string) {
    const cur = latest.current;
    setSplitting(true); setSplitError('');
    try {
      const res = await splitForTeam(token, cur.recipients.map(r => r.sats));
      const { mint } = readGiftToken(token);
      const now = Date.now();
      const gifts: SentGift[] = cur.recipients.map((r, i) => ({
        token: res.tokens[i], amount: r.sats, mint, to: r.name.trim(), from: cur.company.trim(), link: '',
        team: cur.id, teamName: cur.company.trim(), createdAt: now - i,
      }));
      // One write: the paid token is replaced by every gift at once, so the sats are never unrecorded.
      // If more was paid than needed (e.g. an older invoice), keep it for the sender rather than dropping it.
      const extra = res.leftover && res.leftoverAmount > teamTotals(cur.recipients).fee
        ? [{ token: res.leftover, amount: res.leftoverAmount, mint, to: '', from: cur.company.trim(), link: '', createdAt: now + 1 }] : [];
      storage.replaceWithMany(token, [...gifts, ...extra]);
      // TEST MODE: otherwise the SatsGift fee (res.leftover) is set aside and not sent anywhere.
      // When live, it is paid to SatsGift's Lightning address here.
      setD(prev => ({ ...prev, paidToken: '', step: 4 }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setSplitError(
        msg === 'NOT_ENOUGH' ? 'The payment was smaller than this team send needs. Your sats are safe under “Your gifts” on the single-gift page.'
        : msg === 'SPENT' ? 'These sats were already split. Check “Your gifts” on the single-gift page.'
        : `Splitting the sats failed. They’re safe, try again. ${mintErrorMessage(e)}`);
    } finally { setSplitting(false); }
  }

  function startNew() {
    if (d.paidToken) return; // never drop sats that haven't been split yet
    setD(freshDraft()); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return <>
    <section className="hero">
      <h1>One letter, <em>a gift for everyone</em></h1>
      <p>Send your whole team a letter with sats inside. Each person gets their own envelope, link and code.</p>
    </section>
    <div className="workspace">
      <p className="team-switch"><a className="text-button" href="#">← Back to a single gift</a></p>
      <nav className="stepper" aria-label="Team send progress">
        {STEPS.map((label, i) => (
          <button key={label} disabled={split ? i + 1 !== 4 : i + 1 > d.step} onClick={() => go(i + 1)} className={`step ${d.step === i + 1 ? 'active' : ''} ${d.step > i + 1 ? 'done' : ''}`} aria-current={d.step === i + 1 ? 'step' : undefined}>
            <span>{d.step > i + 1 ? '✓' : i + 1}</span><b>{label}</b>
          </button>
        ))}
      </nav>
      <section className={`builder ${split ? 'final-builder' : ''}`}>
        {!saving && <p className="error" role="alert">This browser can’t save data (private window?). Team sends need it to keep your sats safe, so please use a normal window.</p>}
        {d.step === 1 && <LetterStep d={d} set={set} style={style} onNext={() => go(2)}/>}
        {d.step === 2 && <PeopleStep d={d} set={set} problems={problems} onBack={() => go(1)} onNext={() => go(3)}/>}
        {d.step === 3 && (
          <div className="full-editor team-pay">
            <h2>Pay once for everyone</h2>
            <p className="muted">{company || 'Your team send'} · {d.recipients.length} {d.recipients.length === 1 ? 'person' : 'people'}</p>
            <table className="team-summary">
              <tbody>
                <tr><td>{d.recipients.length} gifts</td><td>{totals.gifts.toLocaleString()} sats</td></tr>
                <tr><td>SatsGift fee ({d.recipients.length} × {TEAM_FEE_PER_RECIPIENT} sats)</td><td>{totals.fee.toLocaleString()} sats</td></tr>
                <tr className="total"><td>Total</td><td>{totals.total.toLocaleString()} sats</td></tr>
              </tbody>
            </table>
            {DEFAULT_MINT.test && <p className="hint">Test mode: the fee is charged in test sats and set aside. No real bitcoin moves.</p>}
            <label className="lock-toggle">
              <input type="checkbox" checked={d.lock} disabled={!!d.paidToken} onChange={e => set({ lock: e.currentTarget.checked })}/>
              <span><b>🔒 Lock each gift with its own code</b><small>Recommended. A forwarded link is useless without its code.</small></span>
            </label>
            {d.paidToken
              ? <div className="split-panel" role="status">
                  {splitting ? <p className="invoice-status"><i className="pulse-dot" aria-hidden="true"/>Paid! Splitting into {d.recipients.length} gifts…</p>
                    : <><p className="error" role="alert">{splitError || 'Your payment arrived but hasn’t been split into gifts yet.'}</p>
                        <button className="primary" onClick={() => splitPaid(d.paidToken)}>Split into gifts</button></>}
                </div>
              : problems.length === 0 && saving && <LightningFund funded={false} onFunded={onPaid} fixedAmount={totals.total} slot="team"/>}
            {!d.paidToken && <div className="navigation"><button className="secondary" onClick={() => go(2)}>← Back</button></div>}
          </div>
        )}
        {d.step === 4 && <SendStep d={d} style={style} onNew={startNew}/>}
      </section>
    </div>
  </>;
}

type StepProps = { d: TeamDraft; set: (patch: Partial<TeamDraft>) => void };

function LetterStep({ d, set, style, onNext }: StepProps & { style: CSSProperties; onNext: () => void }) {
  const ready = d.company.trim() && d.letter.trim();
  return (
    <div className="personalise-editor">
      <div className="builder-grid">
        <div className="editor">
          <h2>Write your letter</h2>
          <p className="muted">Everyone gets the same letter, opened with their own name. You can add a personal line per person next.</p>
          <label htmlFor="team-company">From (company or team)</label>
          <input id="team-company" value={d.company} maxLength={NAME_MAX} placeholder="Safari Tech Ltd" onChange={e => set({ company: e.target.value })}/>
          <label htmlFor="team-letter">Letter <small>{d.letter.length}/{LETTER_MAX}</small></label>
          <textarea id="team-letter" className="team-letter-input" value={d.letter} maxLength={LETTER_MAX} onChange={e => set({ letter: e.target.value })}/>
          <label htmlFor="team-signed">Signed by</label>
          <input id="team-signed" value={d.signedBy} maxLength={SIGNED_BY_MAX} placeholder="Wanjiru, CEO" onChange={e => set({ signedBy: e.target.value })}/>
          <ThemePicker theme={d.theme} onChange={theme => set({ theme })}/>
          <label id="team-format-label">Gift style</label>
          <div className="fund-tabs" role="radiogroup" aria-labelledby="team-format-label">
            <button role="radio" aria-checked={d.format === 'scratch'} onClick={() => set({ format: 'scratch' })}>🪙 Scratch card</button>
            <button role="radio" aria-checked={d.format === 'card'} onClick={() => set({ format: 'card' })}>💌 Gift card</button>
          </div>
        </div>
        <aside className="live-preview" aria-label="Letter preview">
          <Letter from={d.company || 'Your company'} to={d.recipients[0]?.name || 'Juma'} letter={{ body: d.letter, signedBy: d.signedBy }} personal={d.recipients[0]?.note ?? ''} style={style}/>
        </aside>
      </div>
      <div className="navigation">
        <a className="secondary" href="#">← Single gift</a>
        <button className="primary" disabled={!ready} onClick={onNext}>Add people →</button>
      </div>
    </div>
  );
}

function PeopleStep({ d, set, problems, onBack, onNext }: StepProps & { problems: string[]; onBack: () => void; onNext: () => void }) {
  const [same, setSame] = useState('');
  const [tried, setTried] = useState(false);
  const rows = d.recipients;
  const update = (i: number, patch: Partial<TeamRecipient>) => set({ recipients: rows.map((r, j) => j === i ? { ...r, ...patch } : r) });
  const totals = teamTotals(rows);
  return (
    <div className="full-editor team-people">
      <h2>Who’s it for?</h2>
      <p className="muted">One row per person, up to {TEAM_MAX_RECIPIENTS}. The personal line appears in their letter and on their card.</p>
      <div className="same-amount">
        <label htmlFor="same-amount">Same amount for everyone</label>
        <div><input id="same-amount" inputMode="numeric" placeholder="1000" value={same} onChange={e => setSame(cleanAmount(e.target.value, TEAM_MAX_SATS_EACH))}/>
          <button className="secondary" disabled={!same} onClick={() => set({ recipients: rows.map(r => ({ ...r, sats: Number(same) })) })}>Apply to all</button></div>
      </div>
      <ol className="team-rows">
        {rows.map((r, i) => (
          <li key={i} className="team-row-edit">
            <span className="row-number" aria-hidden="true">{i + 1}</span>
            <div className="row-fields">
              <input aria-label={`Person ${i + 1} name`} placeholder="Name" maxLength={NAME_MAX} value={r.name} onChange={e => update(i, { name: e.target.value })}/>
              <input aria-label={`Person ${i + 1} sats`} className="row-sats" inputMode="numeric" placeholder="sats" value={r.sats ? String(r.sats) : ''} onChange={e => update(i, { sats: Number(cleanAmount(e.target.value, TEAM_MAX_SATS_EACH)) || 0 })}/>
              <input aria-label={`Person ${i + 1} personal line`} className="row-note" placeholder="Personal line (optional)" maxLength={NOTE_MAX} value={r.note} onChange={e => update(i, { note: e.target.value })}/>
            </div>
            <button className="text-button danger" aria-label={`Remove person ${i + 1}`} disabled={rows.length === 1} onClick={() => set({ recipients: rows.filter((_, j) => j !== i) })}>✕</button>
          </li>
        ))}
      </ol>
      <button className="secondary" disabled={rows.length >= TEAM_MAX_RECIPIENTS} onClick={() => set({ recipients: [...rows, blankRow(rows[rows.length - 1]?.sats || 1000)] })}>＋ Add person</button>
      <p className="team-total">{rows.length} {rows.length === 1 ? 'gift' : 'gifts'} · <b>{totals.gifts.toLocaleString()} sats</b> + {totals.fee.toLocaleString()} sats fee</p>
      {tried && problems.length > 0 && <ul className="error" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
      <div className="navigation">
        <button className="secondary" onClick={onBack}>← Back</button>
        <button className="primary" onClick={() => { setTried(true); if (!problems.length) onNext(); }}>Review &amp; pay →</button>
      </div>
    </div>
  );
}

function SendStep({ d, style, onNew }: { d: TeamDraft; style: CSSProperties; onNew: () => void }) {
  const [gifts, setGifts] = useState(() => teamGifts(d.id));
  const [progress, setProgress] = useState('');
  const [note, setNote] = useState('');
  const company = d.company.trim() || 'Someone';
  useEffect(() => watchGifts(() => setGifts(teamGifts(d.id))), [d.id]);

  // Build any links still missing (straight after the split, or after a refresh part-way through).
  useEffect(() => {
    let active = true;
    (async () => {
      const list = teamGifts(d.id);
      const todo = list.filter(g => !g.link);
      for (let k = 0; k < todo.length && active; k++) {
        const g = todo[k];
        setProgress(`${d.lock ? 'Locking' : 'Building'} gift ${k + 1} of ${todo.length}…`);
        const r = d.recipients[list.indexOf(g)];
        const gift: Gift = { token: g.token, demo: false, to: g.to, from: d.company.trim(), message: r?.note ?? '', theme: d.theme, format: d.format, letter: { body: d.letter, signedBy: d.signedBy } };
        const code = d.lock ? generateCode() : '';
        const encoded = await encodeGift(gift, d.lock ? { kind: 'code', secret: code, question: '' } : null);
        if (!active) return;
        storage.saveGift({ ...g, link: giftUrl(encoded, `${location.origin}${location.pathname}`), code });
      }
      if (active) setProgress('');
    })().catch(() => { if (active) setProgress('Couldn’t build some links. Reload the page to try again.'); });
    return () => { active = false; };
  }, [d.id]);

  const ready = gifts.filter(g => g.link);
  const message = (g: SentGift) => `🎁 ${company} sent you ${g.amount.toLocaleString()} sats on SatsGift!${g.code ? ' You’ll get a code to open it separately.' : ''} Open your gift: ${g.link}`;
  async function copy(text: string, done: string) {
    try { await navigator.clipboard.writeText(text); setNote(done); } catch { setNote('Clipboard unavailable.'); }
  }
  function downloadCsv() {
    const csv = teamCsv(ready.map(g => ({ name: g.to, sats: g.amount, link: g.link, code: g.code ?? '' })));
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `satsgift-${(d.company.trim() || 'team').replace(/[^\w-]+/g, '-').toLowerCase()}.csv` });
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNote('CSV downloaded. It holds every link and code, so keep it private.');
  }

  return (
    <div className="full-editor gift-result">
      <span className="section-tag">READY TO SEND</span>
      <h2>{gifts.length} gifts from {company}</h2>
      <p className="muted">Send each person their link{d.lock ? ', and their code a different way (e.g. SMS)' : ''}. Each gift can only be claimed once.</p>
      {progress && <p className="invoice-status" role="status"><i className="pulse-dot" aria-hidden="true"/>{progress}</p>}
      <div className="share-panel">
        <div className="share-actions">
          <button className="secondary" disabled={!ready.length} onClick={() => copy(ready.map(g => `${g.to}: ${g.link}${g.code ? `  (code ${g.code})` : ''}`).join('\n'), 'All links copied. Keep them private.')}>Copy all</button>
          <button className="secondary" disabled={!ready.length} onClick={downloadCsv}>Download CSV</button>
        </div>
        <ul className="team-send-list">
          {gifts.map(g => (
            <li key={g.token}>
              <div className="team-send-head"><b>{g.to}</b><span>{g.amount.toLocaleString()} sats</span>{g.code && <code>{g.code}</code>}</div>
              {g.link
                ? <div className="share-actions">
                    <a className="secondary" href={`https://wa.me/?text=${encodeURIComponent(message(g))}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                    <button className="secondary" onClick={() => copy(g.link, `Link for ${g.to} copied.`)}>Copy link</button>
                    {g.code && <a className="secondary" href={`sms:?&body=${encodeURIComponent(`Your SatsGift code from ${company}: ${g.code}`)}`}>SMS code</a>}
                    {g.code && <button className="secondary" onClick={() => copy(g.code!, `Code for ${g.to} copied.`)}>Copy code</button>}
                  </div>
                : <p className="hint">Preparing…</p>}
            </li>
          ))}
        </ul>
        <p role="status" className="notice">{note}</p>
        <p className="warning-line">🔑 {d.lock ? 'Each link and its code together are a gift. Send them separately.' : 'Each link is a gift: whoever opens it first can claim it.'} All of these are also saved under “Your gifts”, where you can take back any that aren’t claimed.</p>
      </div>
      <section className="preview-panel" aria-label="Letter preview">
        <div className="preview-head"><div><h3>What {gifts[0]?.to || 'they'} will read</h3><p className="hint">Each person sees their own name and personal line.</p></div></div>
        <Letter from={d.company} to={gifts[0]?.to || d.recipients[0]?.name || ''} letter={{ body: d.letter, signedBy: d.signedBy }} personal={d.recipients[0]?.note ?? ''} style={style}/>
      </section>
      <div className="result-actions">
        <button className="secondary" onClick={onNew}>Start a new team send ＋</button>
      </div>
    </div>
  );
}
