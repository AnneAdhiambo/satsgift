import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Scratch } from './Scratch';
import type { Format } from '../themes';

type Props = { format: Format; to: string; card: ReactNode; style: CSSProperties; onRevealed?: () => void; startOpen?: boolean };

/** Envelope → card (or scratch card). Printed vouchers skip the envelope. Remount with a new `key` to replay.
 *  `startOpen` skips the envelope, e.g. when the recipient has just unlocked it with a code. */
export function GiftReveal({ format, to, card, style, onRevealed, startOpen = false }: Props) {
  const [opened, setOpened] = useState(startOpen);
  const showCard = opened || format === 'print';
  useEffect(() => { if (showCard && format !== 'scratch') onRevealed?.(); }, [showCard, format]);

  return (
    <div className="gift-stage">
      {!showCard
        ? <button className="reveal-envelope" style={style} onClick={() => setOpened(true)} aria-label={`Open the gift envelope for ${to || 'you'}`}>
            <span className="envelope-flap"/><span className="envelope-seal">₿</span>
            <span className="envelope-to">For {to || 'someone special'}</span><span className="envelope-hint">Tap to open a little joy ↗</span>
          </button>
        : format === 'scratch' ? <Scratch onReveal={onRevealed}>{card}</Scratch> : card}
    </div>
  );
}
