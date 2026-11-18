import type { CSSProperties } from 'react';
import type { Format } from '../themes';

/** What sits in the card's QR slot. The sender only ever sees `hidden`, `demo` or a link QR. */
export type CardCode =
  | { kind: 'demo' }
  | { kind: 'hidden' }
  | { kind: 'qr'; src: string; alt: string }
  | { kind: 'pending'; text: string };

export type GiftCardProps = {
  format: Format; to: string; from: string; message: string; amount: number;
  code: CardCode; claimLine: string; style: CSSProperties;
};

export function GiftCard({ format, to, from, message, amount, code, claimLine, style }: GiftCardProps) {
  return (
    <article className={`gift-card ${format === 'print' ? 'voucher' : ''}`} style={style}>
      <div className="card-stripe"/>
      <div className="card-content">
        <span className="card-brand">SATSGIFT</span>
        <p className="card-kicker">A little bitcoin for you</p>
        <h2>For {to.trim() || 'you'}</h2>
        <p className="handwritten">{message}</p>
        <div className="gift-amount">{amount.toLocaleString()} <span>sats</span></div>
        <div className="qr-area">
          {code.kind === 'demo' && <div className="demo-qr"><span>✧</span><strong>PREVIEW ONLY</strong><small>No redeemable funds</small></div>}
          {code.kind === 'hidden' && <div className="demo-qr"><span>🔒</span><strong>CLAIM CODE HIDDEN</strong><small>Only your recipient sees it</small></div>}
          {code.kind === 'qr' && <img src={code.src} alt={code.alt}/>}
          {code.kind === 'pending' && <p>{code.text}</p>}
        </div>
        <p className="claim">{claimLine}</p>
        {from.trim() && <p className="signature">With love, {from}</p>}
        {format === 'print' && (
          <div className="claim-guide">
            <strong>Your gift, in three little steps</strong>
            <ol><li>Scan this code with your phone camera.</li><li>Open your gift and tap Claim.</li><li>Receive the sats in your wallet. Enjoy!</li></ol>
            <small>Keep private. Whoever scans it first can claim the sats.</small>
          </div>
        )}
      </div>
      <div className="card-stripe"/>
    </article>
  );
}
