import { useEffect, useState, type CSSProperties } from 'react';
import QRCode from 'qrcode';
import { GiftCard } from '../components/GiftCard';
import { GiftReveal } from '../components/GiftReveal';
import { encodeGift, giftUrl, type Gift } from '../giftLink';

type Props = { gift: Gift; amount: number; style: CSSProperties; onEdit: () => void; onCopyBackup: () => void; notice: string };

export function ShareStep({ gift, amount, style, onEdit, onCopyBackup, notice }: Props) {
  const [url, setUrl] = useState('');
  const [qr, setQr] = useState('');
  const [linkError, setLinkError] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [preview, setPreview] = useState(0); // 0 = closed, otherwise a replay key
  const [shareNote, setShareNote] = useState('');
  const print = gift.format === 'print';
  const name = gift.to.trim() || 'them';
  const canShare = typeof navigator.share === 'function';

  useEffect(() => {
    let active = true; setUrl(''); setQr(''); setLinkError('');
    encodeGift(gift)
      .then(encoded => {
        if (!active) return;
        const link = giftUrl(encoded); setUrl(link);
        return QRCode.toDataURL(link, { width: 640, margin: 4, errorCorrectionLevel: 'L' })
          .then(src => { if (active) setQr(src); })
          .catch(() => { if (active) setLinkError('This gift is too big for one QR code. Share the link instead.'); });
      })
      .catch(() => { if (active) setLinkError('Couldn’t build the gift link in this browser.'); });
    return () => { active = false; };
  }, [gift]);

  const message = `🎁 ${gift.from.trim() || 'Someone'} sent you ${amount.toLocaleString()} sats on SatsGift! Open your gift: ${url}`;
  async function copyLink() {
    try { await navigator.clipboard.writeText(url); setShareNote('Link copied. Send it privately: whoever opens it first can claim the sats.'); }
    catch { setShareNote('Clipboard unavailable. Press and hold the link to copy it.'); }
  }
  async function nativeShare() {
    try { await navigator.share({ title: 'A gift for you', text: message.replace(url, '').trim(), url }); }
    catch { /* user closed the share sheet */ }
  }

  const linkCode = qr
    ? { kind: 'qr' as const, src: qr, alt: `Gift link QR code for ${name}. Scan with a phone camera to open the gift.` }
    : { kind: 'pending' as const, text: linkError || 'Preparing QR code…' };
  const previewCard = <GiftCard format={gift.format} to={gift.to} from={gift.from} message={gift.message} amount={amount}
    code={gift.demo ? { kind: 'demo' } : { kind: 'hidden' }} claimLine="Your recipient’s claim code appears here." style={style}/>;
  const voucher = <GiftCard format="print" to={gift.to} from={gift.from} message={gift.message} amount={amount}
    code={linkCode} claimLine="Scan with your phone camera to open your gift" style={style}/>;

  return (
    <div className="full-editor gift-result">
      <span className="section-tag">{gift.demo ? 'DEMO GIFT · NO REAL FUNDS' : 'READY TO SEND'}</span>
      <h2>{print ? 'Good things come on paper.' : `Send your gift to ${name}`}</h2>
      <p className="muted">{print
        ? 'Print the voucher and hand it over. The QR opens their gift page.'
        : `Share this link with ${name} privately. They open the envelope and claim the sats.`}</p>

      {print
        ? <div className="gift-stage">{voucher}</div>
        : <div className="share-panel">
            <label htmlFor="gift-link">Gift link</label>
            <input id="gift-link" className="link-field" readOnly value={url || 'Building your link…'} onFocus={e => e.currentTarget.select()}/>
            <div className="share-actions">
              {canShare && <button className="primary" disabled={!url} onClick={nativeShare}>Share…</button>}
              <a className={canShare ? 'secondary' : 'primary'} aria-disabled={!url} href={url ? `https://wa.me/?text=${encodeURIComponent(message)}` : undefined} target="_blank" rel="noopener noreferrer">WhatsApp</a>
              <button className="secondary" disabled={!url} onClick={copyLink}>Copy link</button>
              <button className="secondary" disabled={!qr} aria-expanded={showQr} onClick={() => setShowQr(v => !v)}>{showQr ? 'Hide QR' : 'Show QR'}</button>
            </div>
            {linkError && <p className="error" role="alert">{linkError}</p>}
            <p role="status" className="notice">{shareNote}</p>
            {showQr && qr && <figure className="link-qr"><img src={qr} alt={`QR code of the gift link for ${name}`}/><figcaption>Let {name} scan this with their phone camera.</figcaption></figure>}
            <p className="warning-line">🔑 The link <b>is</b> the gift. Anyone who opens it first can claim the sats, so don’t post it publicly.</p>
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
      </div>
    </div>
  );
}
