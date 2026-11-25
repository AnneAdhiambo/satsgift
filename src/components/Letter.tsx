import type { CSSProperties } from 'react';
import type { Letter as LetterData } from '../giftLink';

type Props = { from: string; to: string; letter: LetterData; personal: string; style: CSSProperties };

/** A handwritten-style letter, shown between the envelope and the gift. Built to hold many signers later. */
export function Letter({ from, to, letter, personal, style }: Props) {
  const signer = letter.signedBy.trim() || from.trim();
  return (
    <article className="letter" style={style} aria-label={`Letter from ${from || 'the sender'}`}>
      <div className="card-stripe"/>
      <div className="letter-body">
        {from.trim() && <p className="letter-from">{from}</p>}
        <p className="letter-greeting">Dear {to.trim() || 'you'},</p>
        {letter.body.split(/\n+/).filter(p => p.trim()).map((p, i) => <p key={i}>{p}</p>)}
        {personal.trim() && <p className="letter-personal">{personal}</p>}
        {signer && <p className="letter-sign">{signer}</p>}
        {signer && from.trim() && signer !== from.trim() && <p className="letter-company">{from}</p>}
      </div>
    </article>
  );
}
