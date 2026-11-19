import type { ReactNode } from 'react';

// Glass coins sit in the side margins, below the header (positions are % of the window height).
const COINS = [{ side: "left", top: "24%" }, { side: "right", top: "30%" }, { side: "left", top: "66%" }, { side: "right", top: "74%" }];

/** Awning, header and floating coins shared by the sender and recipient pages. */
export function Shell({ children, tag = 'Gift · Scratch · Print' }: { children: ReactNode; tag?: string }) {
  return <>
    <div className="floating-coins" aria-hidden="true">
      {COINS.map((c, i) => <span key={i} className={`floating-coin ${c.side}`} style={{ top: c.top, animationDelay: `${-i * 3.5}s` }}>₿</span>)}
    </div>
    <div className="awning" aria-hidden="true"/>
    <header className="site-header">
      <a className="logo" href={location.pathname}><img className="logo-mark" src="/logo.png" width="76" height="70" alt=""/>SatsGift</a>
      <span className="header-tag">{tag}</span>
    </header>
    <main>{children}</main>
    <footer className="site-footer">
      <p>Built on <a href="https://cashu.space" target="_blank" rel="noopener noreferrer">Cashu</a> 🥜 open-source ecash for bitcoin</p>
      <p className="nuts" aria-label="Cashu specifications used">
        <code>NUT-00</code> ecash &amp; blind signatures · <code>NUT-03</code> swap · <code>NUT-04</code> mint · <code>NUT-05</code> melt · <code>NUT-07</code> spent check
      </p>
    </footer>
  </>;
}
