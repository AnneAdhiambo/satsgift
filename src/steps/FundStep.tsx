import { useState } from 'react';
import { LightningFund } from '../components/LightningFund';
import { PasteFund } from '../components/PasteFund';
import { MyGifts } from '../components/MyGifts';
import { EcashCoins } from '../components/EcashCoins';
import { CashuExplainer } from '../components/CashuExplainer';

type Props = {
  token: string; demo: boolean; valid: boolean; amount: number; mint: string; notice: string; saving: boolean;
  onDemo: () => void; onFunded: (token: string) => void; onCopy: () => void; onNext: () => void;
};

export function FundStep({ token, demo, valid, amount, mint, notice, saving, onDemo, onFunded, onCopy, onNext }: Props) {
  const [tab, setTab] = useState<'lightning' | 'paste'>('lightning');
  const real = valid && !demo;
  return (
    <div className="token-editor editor">
      <h2>Get your Cashu ecash</h2>
      <p className="muted">Mint fresh ecash from a Cashu mint, or paste a Cashu token you already have. Everything happens in this browser.</p>
      <p className="demo-bar">✨ Just exploring? <button className="text-button" onClick={onDemo}>Try a demo gift</button> No sats needed: walk through the card, the scratch-off and the M-Pesa claim.</p>
      <p className="demo-bar team-bar">👥 Sending to a whole team? <a className="text-button" href="#team">Send to a team</a> One payment, one letter, and a gift for each person.</p>

      <div className="fund-tabs" role="tablist" aria-label="How to add sats">
        <button role="tab" id="tab-lightning" aria-controls="panel-lightning" aria-selected={tab === 'lightning'} onClick={() => setTab('lightning')}>🥜 Mint Cashu ecash</button>
        <button role="tab" id="tab-paste" aria-controls="panel-paste" aria-selected={tab === 'paste'} onClick={() => setTab('paste')}>Paste a token</button>
      </div>

      {/* Both panels stay mounted so an open invoice survives switching tabs. */}
      <div role="tabpanel" id="panel-lightning" aria-labelledby="tab-lightning" hidden={tab !== 'lightning'}>
        <LightningFund funded={real} onFunded={onFunded}/>
      </div>
      <div role="tabpanel" id="panel-paste" aria-labelledby="tab-paste" hidden={tab !== 'paste'}>
        <PasteFund onFunded={onFunded}/>
      </div>

      {valid && (
        <div className="token-status" role="status">
          <strong>{demo ? 'Demo mode — no real funds' : `✓ ${amount.toLocaleString()} sats ready`}</strong>
          <span>{mint}</span>
          {real && <small>{saving ? 'Saved in this browser, so a refresh won’t lose it.' : 'This browser can’t save. Copy the backup token before you refresh.'}</small>}
          {real && <EcashCoins token={token} onCopy={onCopy}/>}
        </div>
      )}
      <p role="status" className="notice">{notice}</p>
      <CashuExplainer/>

      <div className="navigation token-navigation">
        <button className="primary" disabled={!valid} onClick={onNext}>Choose a format →</button>
      </div>
      <MyGifts onUse={onFunded}/>
    </div>
  );
}
