import { useEffect, useState, type CSSProperties } from 'react';
import QRCode from 'qrcode';
import { GiftCard } from '../components/GiftCard';
import { GiftReveal } from '../components/GiftReveal';
import { encodeGift, giftUrl, QUESTION_MAX, type Gift, type Lock } from '../giftLink';
import { generateCode, secretReady, type LockKind } from '../giftLock';
import { storage } from '../storage';

type Props = {
  gift: Gift; amount: number; mint: string; style: CSSProperties; notice: string;
  onEdit: () => void; onCopyBackup: () => void; onStartNew: () => void;
};

export function ShareStep({ gift, amount, mint, style, notice, onEdit, onCopyBackup, onStartNew }: Props) {
  const [url, setUrl] = useState('');
  const [qr, setQr] = useState('');
  const [linkError, setLinkError] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [preview, setPreview] = useState(0); // 0 = closed, otherwise a replay key
  const [shareNote, setShareNote] = useState('');
  const print = gift.format === 'print';
  const name = gift.to.trim() || 'them';
  const canShare = typeof navigator.share === 'function';

  // The lock. Reuse what was saved for this token, so coming back here never changes a code already sent.
  const [saved] = useState(() => gift.demo ? undefined : storage.loadGifts().find(g => g.token === gift.token && g.link));
  const [lockOn, setLockOn] = useState(saved ? !!saved.code : !print);
  const [kind, setKind] = useState<LockKind>(saved?.question ? 'answer' : 'code');
  const [code] = useState(() => saved?.code && !saved.question ? saved.code : generateCode());
  const [question, setQuestion] = useState(saved?.question ?? '');
  const [answer, setAnswer] = useState(saved?.question ? saved.code ?? '' : '');
  const lock: Lock | null = !lockOn ? null : kind === 'code' ? { kind, secret: code, question: '' } : { kind, secret: answer, question: question.trim() };
  const lockReady = !lock || lock.kind === 'code' || (!!lock.question && secretReady('answer', lock.secret));

  useEffect(() => {
    let active = true; setUrl(''); setQr(''); setLinkError('');
    if (!lockReady) return () => { active = false; };
    // Locking takes about half a second, so wait for the sender to stop typing their answer.
    const timer = setTimeout(() => encodeGift(gift, lock)
      .then(encoded => {
        if (!active) return;
        const link = giftUrl(encoded); setUrl(link);
        // Remember the gift (its link and code) so the sender can find it again under "Your gifts".
        if (!gift.demo) storage.saveGift({ token: gift.token, amount, mint, to: gift.to.trim() || 'someone', from: gift.from, link, code: lock?.secret ?? '', question: lock?.question ?? '', createdAt: Date.now() });
        return QRCode.toDataURL(link, { width: 640, margin: 4, errorCorrectionLevel: 'L' })
          .then(src => { if (active) setQr(src); })
          .catch(() => { if (active) setLinkError('This gift is too big for one QR code. Share the link instead.'); });
      })
      .catch(() => { if (active) setLinkError('Couldn’t build the gift link in this browser.'); }), lock?.kind === 'answer' ? 600 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [gift, lockOn, kind, code, question, answer]);

  const sender = gift.from.trim() || 'Someone';
  const lockNote = !lock ? '' : lock.kind === 'code' ? ' I’ll send you the code to open it separately.' : ' You’ll need to answer a question only you know.';
  const message = `🎁 ${sender} sent you ${amount.toLocaleString()} sats on SatsGift!${lockNote} Open your gift: ${url}`;
  const smsHref = `sms:?&body=${encodeURIComponent(`Your SatsGift code from ${sender}: ${code}`)}`;
  async function copyLink() {
    try { await navigator.clipboard.writeText(url); setShareNote(lock?.kind === 'code' ? 'Link copied. Send the code a different way, e.g. by SMS.' : 'Link copied. Send it privately: whoever opens it first can claim the sats.'); }
    catch { setShareNote('Clipboard unavailable. Press and hold the link to copy it.'); }
  }
  async function copyCode() {
    try { await navigator.clipboard.writeText(code); setShareNote('Code copied. Send it separately from the link.'); }
    catch { setShareNote('Clipboard unavailable. Write the code down instead.'); }
  }
  async function nativeShare() {
    try { await navigator.share({ title: 'A gift for you', text: message.replace(url, '').trim(), url }); }
    catch { /* user closed the share sheet */ }
  }

  const linkCode = qr
    ? { kind: 'qr' as const, src: qr, alt: `Gift link QR code for ${name}. Scan with a phone camera to open the gift.` }
    : { kind: 'pending' as const, text: linkError || (lockReady ? 'Preparing QR code…' : 'Add a question and answer above.') };
  const previewCard = <GiftCard format={gift.format} to={gift.to} from={gift.from} message={gift.message} amount={amount}
    code={gift.demo ? { kind: 'demo' } : { kind: 'hidden' }} claimLine="Your recipient’s claim code appears here." style={style}/>;
  const voucher = <GiftCard format="print" to={gift.to} from={gift.from} message={gift.message} amount={amount}
    code={linkCode} claimLine={lock ? 'Scan with your phone camera, then enter your code' : 'Scan with your phone camera to open your gift'} style={style}/>;
  const linkPlaceholder = !lockReady ? 'Add a question and answer above to build the link.' : lock ? 'Locking your gift…' : 'Building your link…';

  return (
    <div className="full-editor gift-result">
      <span className="section-tag">{gift.demo ? 'DEMO GIFT · NO REAL FUNDS' : 'READY TO SEND'}</span>
      <h2>{print ? 'Good things come on paper.' : `Send your gift to ${name}`}</h2>
      <p className="muted">{print
        ? 'Print the voucher and hand it over. The QR opens their gift page.'
        : `Share this link with ${name} privately. They open the envelope and claim the sats.`}</p>

      <section className="share-panel lock-panel" aria-label="Secret code lock">
        <label className="lock-toggle">
          <input type="checkbox" checked={lockOn} onChange={e => setLockOn(e.currentTarget.checked)}/>
          <span><b>🔒 Lock with a secret code</b><small>Only someone with the code can open the gift, even if the link gets forwarded.</small></span>
        </label>
        {lockOn && <>
          <div className="fund-tabs" role="radiogroup" aria-label="Kind of lock">
            <button role="radio" aria-checked={kind === 'code'} onClick={() => setKind('code')}>Generated code</button>
            <button role="radio" aria-checked={kind === 'answer'} onClick={() => setKind('answer')}>My own question</button>
          </div>
          {kind === 'code'
            ? <>
                <p className="code-display"><code aria-label={`Secret code: ${code.split('').join(' ')}`}>{code}</code></p>
                <div className="share-actions">
                  <a className="secondary" href={smsHref}>Send code by SMS</a>
                  <button className="secondary" onClick={copyCode}>Copy code</button>
                </div>
                <p className="hint">{print
                  ? `The code prints on its own slip below the voucher. Cut it off and give it to ${name} separately, or send it by SMS.`
                  : `Send the code a different way from the link: an SMS, a call, or tell ${name} in person.`}</p>
              </>
            : <>
                <label htmlFor="lock-question">Question for {name}</label>
                <input id="lock-question" maxLength={QUESTION_MAX} placeholder="What’s the name of our first dog?" value={question} onChange={e => setQuestion(e.currentTarget.value)}/>
                <label htmlFor="lock-answer">Answer</label>
                <input id="lock-answer" maxLength={60} autoComplete="off" placeholder="Case and spaces don’t matter" value={answer} onChange={e => setAnswer(e.currentTarget.value)}/>
                <p className="warning-line">People who know {name} might guess the answer, and someone with the link can keep trying. A generated code is much safer.</p>
              </>}
        </>}
        {print && <p role="status" className="notice">{shareNote}</p>}
      </section>

      {print
        ? <div className="gift-stage print-stage">
            {voucher}
            {lock?.kind === 'code' && <>
              <p className="cut-line" aria-hidden="true"><span>✂ cut here</span></p>
              <section className="code-slip" style={style} aria-label="Code slip">
                <small>Your SatsGift code{gift.from.trim() ? ` from ${gift.from.trim()}` : ''}</small>
                <code>{code}</code>
                <p>Scan the QR on your voucher, then enter this code to open your gift.</p>
              </section>
              <p className="warning-line slip-warning">✂ Cut the code slip off before you hand over the voucher, and give them separately.</p>
            </>}
          </div>
        : <div className="share-panel">
            <label htmlFor="gift-link">Gift link</label>
            <input id="gift-link" className="link-field" readOnly value={url || linkPlaceholder} onFocus={e => e.currentTarget.select()}/>
            <div className="share-actions">
              {canShare && <button className="primary" disabled={!url} onClick={nativeShare}>Share…</button>}
              <a className={canShare ? 'secondary' : 'primary'} aria-disabled={!url} href={url ? `https://wa.me/?text=${encodeURIComponent(message)}` : undefined} target="_blank" rel="noopener noreferrer">WhatsApp</a>
              <button className="secondary" disabled={!url} onClick={copyLink}>Copy link</button>
              <button className="secondary" disabled={!qr} aria-expanded={showQr} onClick={() => setShowQr(v => !v)}>{showQr ? 'Hide QR' : 'Show QR'}</button>
            </div>
            {linkError && <p className="error" role="alert">{linkError}</p>}
            <p role="status" className="notice">{shareNote}</p>
            {showQr && qr && <figure className="link-qr"><img src={qr} alt={`QR code of the gift link for ${name}`}/><figcaption>Let {name} scan this with their phone camera.</figcaption></figure>}
            <p className="warning-line">{lock?.kind === 'code'
              ? <>🔑 The link <b>and</b> the code together are the gift. Send them separately, e.g. the link on WhatsApp and the code by SMS.</>
              : lock ? <>🔑 Only someone who knows the answer can open this link. Still, don’t post it publicly.</>
              : <>🔑 The link <b>is</b> the gift. Anyone who opens it first can claim the sats, so don’t post it publicly.</>}</p>
          </div>}

      {!print && (
        <section className="preview-panel" aria-label="Recipient preview">
          <div className="preview-head">
            <div><h3>Preview what {name} will see</h3><p className="hint">The claim code stays hidden in your preview.</p></div>
            <button className="secondary" onClick={() => setPreview(p => p + 1)}>{preview ? 'Replay ↻' : 'Preview ✨'}</button>
          </div>
          {preview > 0 && <GiftReveal key={preview} format={gift.format} to={gift.to} card={previewCard} style={style}/>}
        </section>
      )}

      {!gift.demo && (
        <details className="backup">
          <summary>For you: keep a backup</summary>
          <p className="hint">If the link gets lost before {name} opens it, this token is the only copy of the sats. Don’t send it to them, send the link.</p>
          <button className="text-button" onClick={onCopyBackup}>Copy backup token</button>
          <p role="status" className="notice">{notice}</p>
        </details>
      )}

      <div className="result-actions">
        <button className="secondary" onClick={onEdit}>← Edit gift</button>
        {print && <button className="primary" disabled={!qr} onClick={() => window.print()}>Print / save PDF ↗</button>}
        <button className="secondary" onClick={onStartNew}>Start a new gift ＋</button>
      </div>
    </div>
  );
}
