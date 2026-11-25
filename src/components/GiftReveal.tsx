import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Scratch } from './Scratch';
import type { Format } from '../themes';

type Props = {
  format: Format; to: string; card: ReactNode; style: CSSProperties; onRevealed?: () => void;
  /** Skip the envelope, e.g. when the recipient has just unlocked it with a code. */
  startOpen?: boolean;
  /** Shown between the envelope and the gift (team sends). */
  letter?: ReactNode;
  /** A small "From …" line on the envelope. */
  from?: string;
};

/** Envelope → (letter) → card or scratch card. Printed vouchers skip the envelope. Remount with a new `key` to replay. */
export function GiftReveal({ format, to, card, style, onRevealed, startOpen = false, letter, from }: Props) {
  const [opened, setOpened] = useState(startOpen);
  const [letterRead, setLetterRead] = useState(!letter);
  const open = opened || format === 'print';
  const showCard = open && letterRead;
  useEffect(() => { if (showCard && format !== 'scratch') onRevealed?.(); }, [showCard, format]);

  return (
    <div className="gift-stage">
      {!open
        ? <button className="reveal-envelope" style={style} onClick={() => setOpened(true)} aria-label={`Open the gift envelope for ${to || 'you'}`}>
            <span className="envelope-flap"/><span className="envelope-seal">₿</span>
            {from && <span className="envelope-from">From {from}</span>}
            <span className="envelope-to">For {to || 'someone special'}</span><span className="envelope-hint">Tap to open a little joy ↗</span>
          </button>
        : !letterRead
          ? <div className="letter-stage">
              {letter}
              <button className="primary" onClick={() => setLetterRead(true)}>{format === 'scratch' ? 'Scratch to reveal your gift ↓' : 'See your gift ↓'}</button>
            </div>
          : format === 'scratch' ? <Scratch onReveal={onRevealed}>{card}</Scratch> : card}
    </div>
  );
}
