import type { CSSProperties } from 'react';
import { PENS, type CardHeader, type CardMessage } from '../card';

export type ShownMessage = CardMessage & { index?: number; hidden?: boolean };

type Props = {
  header: CardHeader; messages: ShownMessage[]; style: CSSProperties;
  /** Organiser view: show amounts and let them hide or show messages. */
  onToggleHidden?: (index: number, hidden: boolean) => void;
  emptyText?: string;
};

/** A card signed by many people: each message in its own pen colour, with a sticker. */
export function SignedCard({ header, messages, style, onToggleHidden, emptyText = 'No messages yet. Be the first to sign!' }: Props) {
  const organiser = !!onToggleHidden;
  return (
    <article className="letter signed-card" style={style} aria-label={`Card for ${header.to || 'someone special'}`}>
      <div className="card-stripe"/>
      <div className="signed-card-body">
        {(header.occasion || header.from) && (
          <div className="letter-top">
            {header.occasion && <span className="letter-occasion">{header.occasion}</span>}
            {header.from && <p className="letter-from">From {header.from}</p>}
          </div>
        )}
        <h3 className="signed-card-to">For {header.to || 'someone special'}</h3>
        {messages.length === 0
          ? <p className="signed-card-empty">{emptyText}</p>
          : <ul className="signed-messages">
              {messages.map((m, i) => (
                <li key={m.index ?? i} className={m.hidden ? 'is-hidden' : undefined} style={{ '--pen': PENS[m.pen] } as CSSProperties}>
                  {m.sticker && <span className="msg-sticker" aria-hidden="true">{m.sticker}</span>}
                  <p className="msg-text">{m.text}</p>
                  <p className="msg-name">{m.name}</p>
                  {organiser && (
                    <div className="msg-admin">
                      {m.sats > 0 && <span>⚡ {m.sats.toLocaleString()} sats</span>}
                      {m.index !== undefined && <button className="text-button" onClick={() => onToggleHidden(m.index!, !m.hidden)}>{m.hidden ? 'Show on card' : 'Hide'}</button>}
                    </div>
                  )}
                </li>
              ))}
            </ul>}
      </div>
    </article>
  );
}
