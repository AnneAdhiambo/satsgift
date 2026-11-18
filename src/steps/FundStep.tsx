import { useState } from 'react';
import { LightningFund } from '../components/LightningFund';

type Props = {
  token: string; demo: boolean; valid: boolean; amount: number; mint: string; error: string; notice: string;
  onPaste: (raw: string) => void; onDemo: () => void; onFunded: (token: string) => void; onCopy: () => void; onNext: () => void;
};

export function FundStep({ token, demo, valid, amount, mint, error, notice, onPaste, onDemo, onFunded, onCopy, onNext }: Props) {
  const [tab, setTab] = useState<'lightning' | 'paste'>('lightning');
  const real = valid && !demo;
  return (
    <div className="token-editor editor">
      <h2>Add your sats</h2>
      <p className="muted">Pay a Lightning invoice, or paste a Cashu token you already have. Everything happens in this browser.</p>

      <div className="fund-tabs" role="tablist" aria-label="How to add sats">
        <button role="tab" id="tab-lightning" aria-controls="panel-lightning" aria-selected={tab === 'lightning'} onClick={() => setTab('lightning')}>⚡ Pay with Lightning</button>
        <button role="tab" id="tab-paste" aria-controls="panel-paste" aria-selected={tab === 'paste'} onClick={() => setTab('paste')}>Paste a token</button>
      </div>

      {/* Both panels stay mounted so an open invoice survives switching tabs. */}
      <div role="tabpanel" id="panel-lightning" aria-labelledby="tab-lightning" hidden={tab !== 'lightning'}>
        <LightningFund funded={real} onFunded={onFunded}/>
      </div>
      <div role="tabpanel" id="panel-paste" aria-labelledby="tab-paste" hidden={tab !== 'paste'}>
        <label htmlFor="token">Cashu token</label>
        <textarea id="token" className="token-input" value={token} placeholder="cashuB…" onChange={e => onPaste(e.target.value)} spellCheck={false} autoComplete="off"/>
        <button className="text-button" onClick={onDemo}>Try a demo token</button>
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      {valid && (
        <div className="token-status" role="status">
          <strong>{demo ? 'Demo mode — no real funds' : `✓ ${amount.toLocaleString()} sats ready`}</strong>
          <span>{mint}</span>
          {real && <small>Keep a backup until you’ve shared the gift: refreshing this page discards it.</small>}
          {real && <button className="text-button" onClick={onCopy}>Copy backup token</button>}
        </div>
      )}
      <p role="status" className="notice">{notice}</p>

      <div className="navigation token-navigation">
        <button className="primary" disabled={!valid} onClick={onNext}>Choose a format →</button>
      </div>
    </div>
  );
}
