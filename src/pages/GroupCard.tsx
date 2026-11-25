import { useCallback, useEffect, useState } from 'react';
import { GiftReveal } from '../components/GiftReveal';
import { SignedCard, type ShownMessage } from '../components/SignedCard';
import { SignForm } from '../components/SignForm';
import { ThemePicker } from '../components/ThemePicker';
import { Recipient } from './Recipient';
import { cardFee, createCard, loadCard, openGift, openTokens, sendCard, setHidden, signCard, type CardHeader, type CardMessage, type LoadedCard } from '../card';
import { cardUrl, type CardLink } from '../cardCrypto';
import { encodeGift } from '../giftLink';
import { generateCode } from '../giftLock';
import { collectTokens, mintErrorMessage, takeFee } from '../mint';
import { OCCASIONS, OCCASION_LABEL_MAX, occasionTag, type OccasionId } from '../occasions';
import { storage } from '../storage';
import { themeStyle, type Format, type Theme } from '../themes';
import { readGiftToken } from '../token';

/** What the recipient's gift payload holds when nobody chipped in: the card alone. */
export const NO_SATS = 'nosats';

const visible = (card: LoadedCard): ShownMessage[] => card.entries.filter(e => e.message && !e.hidden).map(e => ({ ...e.message!, index: e.index }));
const potOf = (card: LoadedCard) => card.entries.filter(e => e.message && !e.hidden && e.sealedToken).reduce((s, e) => s + (e.message!.sats || 0), 0);
const givers = (card: LoadedCard) => card.entries.filter(e => e.message && !e.hidden && e.sealedToken).length;

function useCard(link: CardLink) {
  const [card, setCard] = useState<LoadedCard | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => loadCard(link).then(c => { setCard(c); setError(''); return c; }).catch(e => { setError(e instanceof Error ? e.message : 'Couldn’t load this card.'); return null; }), [link.id]);
  useEffect(() => { void reload(); }, [reload]);
  return { card, error, reload, setCard };
}

function Loading({ error }: { error: string }) {
  return <div className="builder recipient"><div className="full-editor gift-result">
    {error ? <><span className="section-tag">HMM…</span><h2>We couldn’t open this card</h2><p className="muted">{error}</p><a className="primary" href="#">Go to SatsGift →</a></>
      : <p className="muted">Opening the card…</p>}
  </div></div>;
}

async function copyText(text: string, done: (msg: string) => void, ok: string) {
  try { await navigator.clipboard.writeText(text); done(ok); } catch { done('Clipboard unavailable. Press and hold to copy.'); }
}

// ---------- 1. Start a card ----------
export function CardNew() {
  const [occasion, setOccasion] = useState<OccasionId>('birthday');
  const [custom, setCustom] = useState('');
  const [to, setTo] = useState('');
  const [from, setFrom] = useState('');
  const [theme, setTheme] = useState<Theme>('sunshine');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mine = storage.loadCards();
  const header: CardHeader = { to: to.trim(), from: from.trim(), occasion: occasionTag(occasion, custom), theme };

  async function create() {
    setBusy(true); setError('');
    try {
      const { org } = await createCard(header);
      const orgUrl = cardUrl(org);
      storage.saveCard({ id: org.id, orgUrl, to: header.to, occasion: header.occasion, createdAt: Date.now() });
      location.hash = orgUrl.slice(orgUrl.indexOf('#'));
    } catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t create the card.'); setBusy(false); }
  }

  return <>
    <section className="hero">
      <h1>One card, <em>signed by everyone</em></h1>
      <p>Family, friends or classmates each add a message, and chip in sats if they like. Then it goes out as one gift.</p>
    </section>
    <div className="workspace">
      <p className="team-switch"><a className="text-button" href="#">← Back to a single gift</a></p>
      <section className="builder">
        <div className="personalise-editor">
          <div className="occasion-head">
            <h2>What’s the occasion?</h2>
            <div className="occasion-chips" role="radiogroup" aria-label="Occasion">
              {OCCASIONS.map(o => (
                <button key={o.id} role="radio" aria-checked={occasion === o.id} className="occasion-chip" onClick={() => { setOccasion(o.id); setTheme(o.theme); }}>
                  <span aria-hidden="true">{o.icon}</span>{o.label}
                </button>
              ))}
            </div>
            {occasion === 'other' && (
              <div className="occasion-custom">
                <label htmlFor="card-occasion">What’s it for?</label>
                <input id="card-occasion" value={custom} maxLength={OCCASION_LABEL_MAX} placeholder="Welcome home" onChange={e => setCustom(e.target.value)}/>
              </div>
            )}
          </div>
          <div className="builder-grid">
            <div className="editor">
              <label htmlFor="card-to">Who’s it for?</label>
              <input id="card-to" value={to} maxLength={50} placeholder="Amina" onChange={e => setTo(e.target.value)}/>
              <label htmlFor="card-from">From</label>
              <input id="card-from" value={from} maxLength={50} placeholder="The Otieno family" onChange={e => setFrom(e.target.value)}/>
              <p className="hint">Your family, your friends’ group, your class, your team…</p>
              <ThemePicker theme={theme} onChange={setTheme}/>
              {error && <p className="error" role="alert">{error}</p>}
            </div>
            <aside className="live-preview" aria-label="Card preview">
              <SignedCard header={{ ...header, to: header.to || 'Amina', from: header.from || 'Everyone' }} messages={[]} style={themeStyle(theme)} emptyText="Everyone’s messages will appear here."/>
            </aside>
          </div>
          <div className="navigation">
            <a className="secondary" href="#">← Back</a>
            <button className="primary" disabled={!header.to || busy} onClick={create}>{busy ? 'Creating…' : 'Create the card ✨'}</button>
          </div>
        </div>
      </section>
      {mine.length > 0 && (
        <section className="my-gifts my-cards" aria-labelledby="my-cards-title">
          <h3 id="my-cards-title">Cards you’ve started</h3>
          <ul>{mine.map(c => (
            <li key={c.id}><div className="gift-row"><div><b>{c.occasion || '💌'} for {c.to || 'someone'}</b>
              <small>{new Date(c.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</small></div>
              <a className="text-button" href={c.orgUrl.slice(c.orgUrl.indexOf('#'))}>{c.recipientUrl ? 'View' : 'Open'} →</a></div></li>
          ))}</ul>
        </section>
      )}
    </div>
  </>;
}

// ---------- 2. The organiser ----------
type SendPhase = { step: 'idle' } | { step: 'working'; text: string } | { step: 'error'; text: string };

export function CardOrganiser({ link }: { link: CardLink & { kind: 'org' } }) {
  const { card, error, reload, setCard } = useCard(link);
  const [note, setNote] = useState('');
  const [format, setFormat] = useState<Format>('scratch');
  const [lock, setLock] = useState(true);
  const [phase, setPhase] = useState<SendPhase>({ step: 'idle' });
  const [signed, setSigned] = useState(false);
  const joinUrl = cardUrl({ kind: 'join', id: link.id, msgKey: link.msgKey });
  const saved = storage.loadCards().find(c => c.id === link.id);

  // Keep the organiser link in this browser even if they arrived by pasting it.
  useEffect(() => {
    if (card && !saved) storage.saveCard({ id: link.id, orgUrl: cardUrl(link), to: card.header.to, occasion: card.header.occasion, createdAt: Date.now() });
  }, [card]);

  if (!card) return <Loading error={error}/>;
  const style = themeStyle(card.header.theme);
  const to = card.header.to || 'them';
  const pot = potOf(card), people = givers(card), fee = cardFee(pot, people);
  const all: ShownMessage[] = card.entries.filter(e => e.message).map(e => ({ ...e.message!, index: e.index, hidden: e.hidden }));
  const invite = `💌 We’re making a card for ${to}! Add your message (and chip in sats if you like): ${joinUrl}`;

  async function toggle(index: number, hidden: boolean) {
    try { await setHidden(link, index, hidden); setCard(c => c && { ...c, entries: c.entries.map(e => e.index === index ? { ...e, hidden } : e) }); }
    catch (e) { setNote(e instanceof Error ? e.message : 'Couldn’t update the card.'); }
  }

  async function send() {
    const fresh = await reload();
    if (!fresh) return;
    const h = fresh.header;
    try {
      setPhase({ step: 'working', text: 'Collecting everyone’s sats…' });
      const tokens = await openTokens(link, fresh.entries);
      let token = '', amount = 0, takenBack = 0;
      if (tokens.length) {
        const pot = await collectTokens(tokens.map(t => t.token));
        takenBack = pot.takenBack;
        if (pot.token) {
          const { mint } = readGiftToken(pot.token);
          // Save the pot first: from here on, it's the only copy of everyone's sats.
          storage.saveGift({ token: pot.token, amount: pot.amount, mint, to: '', from: h.from, link: '', createdAt: Date.now() });
          const charged = cardFee(pot.amount, tokens.length - takenBack);
          // TEST MODE: the fee is set aside. When live it goes to SatsGift's Lightning address.
          const gift = await takeFee(pot.token, charged);
          if (gift.token !== pot.token) storage.replaceGift(pot.token, { token: gift.token, amount: gift.amount, mint, to: '', from: h.from, link: '', createdAt: Date.now() });
          token = gift.token; amount = gift.amount;
        }
      }
      setPhase({ step: 'working', text: lock && token ? 'Locking the gift…' : 'Wrapping the card…' });
      const n = visible(fresh).length;
      const code = lock && token ? generateCode() : '';
      const payload = token
        ? await encodeGift({ token, demo: false, to: h.to, from: h.from, message: `Signed by ${n} ${n === 1 ? 'person' : 'people'} 💛`, theme: h.theme, format }, code ? { kind: 'code', secret: code, question: '' } : null)
        : NO_SATS;
      setPhase({ step: 'working', text: 'Sending…' });
      const recipientUrl = await sendCard(link, payload);
      if (token) storage.saveGift({ token, amount, mint: readGiftToken(token).mint, to: h.to, from: h.from, link: recipientUrl, code, createdAt: Date.now() });
      storage.saveCard({ id: link.id, orgUrl: cardUrl(link), to: h.to, occasion: h.occasion, createdAt: saved?.createdAt ?? Date.now(), recipientUrl, ...(code && { code }) });
      setPhase({ step: 'idle' });
      setNote(takenBack ? `${takenBack} ${takenBack === 1 ? 'person' : 'people'} took their sats back before sending, so they’re not included.` : '');
      await reload();
    } catch (e) {
      setPhase({ step: 'error', text: `${e instanceof Error && e.message === 'TOO_SMALL' ? 'There aren’t enough sats left after fees.' : mintErrorMessage(e)} Any sats collected are safe under “Your gifts”.` });
    }
  }

  if (card.status === 'sent') {
    const mine = storage.loadCards().find(c => c.id === link.id);
    const url = mine?.recipientUrl;
    return (
      <div className="builder recipient"><div className="full-editor gift-result">
        <span className="section-tag">CARD SENT 🎉</span>
        <h2>{to}’s card is ready</h2>
        {url
          ? <div className="share-panel">
              <label htmlFor="card-link">Send this to {to}</label>
              <input id="card-link" className="link-field" readOnly value={url} onFocus={e => e.currentTarget.select()}/>
              <div className="share-actions">
                <a className="primary" href={`https://wa.me/?text=${encodeURIComponent(`💌 ${card.header.from || 'We'} made you a card${mine?.code ? '. I’ll send you the code to open it separately' : ''}: ${url}`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                <button className="secondary" onClick={() => copyText(url, setNote, 'Link copied.')}>Copy link</button>
                {mine?.code && <a className="secondary" href={`sms:?&body=${encodeURIComponent(`Your SatsGift code: ${mine.code}`)}`}>SMS code</a>}
              </div>
              {mine?.code && <p className="code-display"><code>{mine.code}</code></p>}
              <p role="status" className="notice">{note}</p>
              {mine?.code && <p className="warning-line">🔑 The link and the code together open the gift. Send them separately.</p>}
            </div>
          : <p className="muted">This card was sent from another browser. Its link is under “Your gifts” there.</p>}
        <div className="gift-stage"><SignedCard header={card.header} messages={visible(card)} style={style}/></div>
      </div></div>
    );
  }

  return (
    <div className="builder recipient"><div className="full-editor gift-result card-organiser">
      <span className="section-tag">YOU’RE THE ORGANISER</span>
      <h2>{card.header.occasion ? `${card.header.occasion} card` : 'Card'} for {to}</h2>
      <p className="muted">Share the invite link. Everyone who opens it can read the card and add their message.</p>

      <div className="share-panel">
        <label htmlFor="invite-link">Invite link</label>
        <input id="invite-link" className="link-field" readOnly value={joinUrl} onFocus={e => e.currentTarget.select()}/>
        <div className="share-actions">
          <a className="primary" href={`https://wa.me/?text=${encodeURIComponent(invite)}`} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
          <button className="secondary" onClick={() => copyText(joinUrl, setNote, 'Invite link copied.')}>Copy invite link</button>
          <button className="secondary" onClick={() => reload()}>Refresh ↻</button>
        </div>
        <p role="status" className="notice">{note}</p>
        <p className="warning-line">🔑 <b>This page’s address is your organiser key.</b> It’s saved in this browser under “Cards you’ve started”. Don’t share it: whoever has it can send the card.</p>
      </div>

      <div className="card-stats">
        <span><b>{all.filter(m => !m.hidden).length}</b> messages</span>
        <span><b>{pot.toLocaleString()}</b> sats from {people} {people === 1 ? 'person' : 'people'}</span>
      </div>
      <div className="gift-stage"><SignedCard header={card.header} messages={all} style={style} onToggleHidden={toggle}/></div>

      {!signed
        ? <SignForm to={to} onSign={async (message, token) => {
            await signCard(link, card.pub, message, token);
            if (token) storage.saveGift({ token, amount: message.sats, mint: readGiftToken(token).mint, to: `${to}’s card`, from: message.name, link: joinUrl, createdAt: Date.now() });
            setSigned(true); await reload();
          }}/>
        : <p className="chip-ready">✓ Your message is on the card.</p>}

      <section className="share-panel send-card" aria-labelledby="send-title">
        <h3 id="send-title">Ready? Send the card</h3>
        <p className="hint">Once sent, nobody can add more messages. {pot > 0 ? 'Everyone’s sats are collected into one gift.' : 'Nobody has chipped in sats, so it goes as a card only.'}</p>
        {pot > 0 && <>
          <div className="fund-tabs" role="radiogroup" aria-label="Gift style">
            <button role="radio" aria-checked={format === 'scratch'} onClick={() => setFormat('scratch')}>🪙 Scratch card</button>
            <button role="radio" aria-checked={format === 'card'} onClick={() => setFormat('card')}>💌 Gift card</button>
          </div>
          <label className="lock-toggle"><input type="checkbox" checked={lock} onChange={e => setLock(e.currentTarget.checked)}/>
            <span><b>🔒 Lock the gift with a code</b><small>Recommended. You send {to} the code separately.</small></span></label>
          <table className="team-summary"><tbody>
            <tr><td>Sats chipped in</td><td>{pot.toLocaleString()} sats</td></tr>
            <tr><td>SatsGift fee {fee ? '(2%, from 5 givers)' : '(free under 5 givers)'}</td><td>{fee.toLocaleString()} sats</td></tr>
            <tr className="total"><td>{to} gets about</td><td>{Math.max(pot - fee, 0).toLocaleString()} sats</td></tr>
          </tbody></table>
        </>}
        {phase.step === 'working' && <p className="invoice-status" role="status"><i className="pulse-dot" aria-hidden="true"/>{phase.text}</p>}
        {phase.step === 'error' && <p className="error" role="alert">{phase.text}</p>}
        <button className="primary" disabled={phase.step === 'working' || !all.some(m => !m.hidden)} onClick={send}>Send the card 💌</button>
      </section>
    </div></div>
  );
}

// ---------- 3. Signing ----------
export function CardJoin({ link }: { link: CardLink & { kind: 'join' } }) {
  const { card, error, reload } = useCard(link);
  const [signed, setSigned] = useState(false);
  if (!card) return <Loading error={error}/>;
  const style = themeStyle(card.header.theme);
  const to = card.header.to || 'them';
  const joinUrl = cardUrl(link);

  async function sign(message: CardMessage, token?: string) {
    await signCard(link, card!.pub, message, token);
    // The sender's own backup: until the organiser collects them, these sats can be taken back.
    if (token) storage.saveGift({ token, amount: message.sats, mint: readGiftToken(token).mint, to: `${to}’s card`, from: message.name, link: joinUrl, createdAt: Date.now() });
    setSigned(true); window.scrollTo({ top: 0, behavior: 'smooth' }); await reload();
  }

  return (
    <div className="builder recipient"><div className="full-editor gift-result">
      <span className="section-tag">{card.header.occasion || '💌 GROUP CARD'}</span>
      <h2>{card.status === 'sent' ? `${to}’s card has been sent 🎉` : signed ? 'Thank you! You’re on the card 💛' : `Sign ${to}’s card`}</h2>
      <p className="muted">{card.status === 'sent' ? 'Thanks to everyone who signed.' : signed ? 'The organiser will send it when everyone has signed.' : `${card.header.from ? `From ${card.header.from}. ` : ''}Read what everyone wrote, then add yours.`}</p>
      <div className="gift-stage"><SignedCard header={card.header} messages={visible(card)} style={style}/></div>
      {card.status === 'open' && !signed && <SignForm to={to} onSign={sign}/>}
      {signed && <p className="hint center">If you chipped in, your sats are listed under “Your gifts” on the SatsGift home page until the card is sent.</p>}
      <p className="result-note"><a className="text-button" href="#">Make a SatsGift of your own →</a></p>
    </div></div>
  );
}

// ---------- 4. The recipient ----------
export function CardOpen({ link }: { link: CardLink & { kind: 'card' } }) {
  const { card, error } = useCard(link);
  const [payload, setPayload] = useState('');
  const [openError, setOpenError] = useState('');
  useEffect(() => { if (card) openGift(link, card).then(setPayload).catch(e => setOpenError(e instanceof Error ? e.message : 'Couldn’t open this card.')); }, [card]);
  if (!card || (!payload && !openError)) return <Loading error={error || openError}/>;
  if (openError) return <Loading error={openError}/>;
  const messages = visible(card);
  const style = themeStyle(card.header.theme);

  if (payload === NO_SATS) return (
    <div className="builder recipient"><div className="full-editor gift-result">
      <span className="section-tag">A CARD FOR {(card.header.to || 'YOU').toUpperCase()}</span>
      <h2>{card.header.from || 'Your people'} made you a card</h2>
      <p className="muted">Open the envelope to read everyone’s messages.</p>
      <GiftReveal format="card" to={card.header.to} style={style} from={card.header.from} occasion={card.header.occasion} continueLabel="Close the card 💛"
        letter={<SignedCard header={card.header} messages={messages} style={style}/>}
        card={<p className="hint center">Signed by {messages.length} {messages.length === 1 ? 'person' : 'people'} 💛</p>}/>
      <p className="result-note"><a className="text-button" href="#">Make a SatsGift of your own →</a></p>
    </div></div>
  );
  return <Recipient encoded={payload} groupCard={{ header: card.header, messages }}/>;
}
