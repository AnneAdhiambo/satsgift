import type { ReactNode } from 'react';
import { ThemePicker } from '../components/ThemePicker';
import type { Theme } from '../themes';

const CHIPS = ['Happy Birthday! 🎂', 'Congratulations!', 'Thank you so much', 'Karibu, enjoy!'];

type Props = {
  theme: Theme; to: string; from: string; message: string; card: ReactNode;
  onTheme: (t: Theme) => void; onTo: (v: string) => void; onFrom: (v: string) => void; onMessage: (v: string) => void;
  onBack: () => void; onNext: () => void;
};

export function PersonaliseStep({ theme, to, from, message, card, onTheme, onTo, onFrom, onMessage, onBack, onNext }: Props) {
  return (
    <div className="personalise-editor">
      <div className="builder-grid">
        <div className="editor">
          <h2>Make it personal</h2>
          <p className="muted">Your preview updates as you type.</p>
          <ThemePicker theme={theme} onChange={onTheme}/>
          <div className="input-row">
            <div><label htmlFor="to">Recipient</label><input id="to" value={to} maxLength={50} placeholder="Amina" onChange={e => onTo(e.target.value)}/></div>
            <div><label htmlFor="from">From</label><input id="from" value={from} maxLength={50} placeholder="Your name" onChange={e => onFrom(e.target.value)}/></div>
          </div>
          <label htmlFor="message">Message</label>
          <textarea id="message" value={message} maxLength={140} onChange={e => onMessage(e.target.value)}/>
          <div className="message-chips">{CHIPS.map(m => <button key={m} onClick={() => onMessage(m)}>{m}</button>)}</div>
        </div>
        <aside className="live-preview" aria-label="Live gift preview">{card}</aside>
      </div>
      <div className="navigation">
        <button className="secondary" onClick={onBack}>← Back</button>
        <button className="primary" onClick={onNext}>Create gift ✨</button>
      </div>
    </div>
  );
}
