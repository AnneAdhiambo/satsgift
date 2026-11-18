import { formats, type Format } from '../themes';

type Props = { amount: number; format: Format; onChange: (f: Format) => void; onBack: () => void; onNext: () => void };

export function FormatStep({ amount, format, onChange, onBack, onNext }: Props) {
  return (
    <div className="full-editor format-editor">
      <h2>Pick a gift format</h2>
      <p className="muted">How would you like to hand over {amount.toLocaleString()} sats?</p>
      <div className="format-options">
        {formats.map(f => (
          <button key={f.id} className={`format-option format-${f.id} ${format === f.id ? 'selected' : ''}`} aria-pressed={format === f.id} onClick={() => onChange(f.id)}>
            <span className="format-icon" aria-hidden="true">{f.icon}</span><h3>{f.name}</h3><p>{f.text}</p>
          </button>
        ))}
      </div>
      <div className="navigation">
        <button className="secondary" onClick={onBack}>← Back</button>
        <button className="primary" onClick={onNext}>Personalise →</button>
      </div>
    </div>
  );
}
