import type { ReactNode } from 'react';

const COINS = [[5, 22], [22, 74], [80, 30], [94, 66]];

/** Awning, header and floating coins shared by the sender and recipient pages. */
export function Shell({ children, tag = 'Gift · Scratch · Print' }: { children: ReactNode; tag?: string }) {
  return <>
    <div className="floating-coins" aria-hidden="true">
      {COINS.map(([left, top], i) => <span key={left} className="floating-coin" style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${-i * 2}s` }}>₿</span>)}
    </div>
    <div className="awning" aria-hidden="true"/>
    <header className="site-header">
      <a className="logo" href={location.pathname}><img className="logo-mark" src="/logo.png" width="52" height="48" alt=""/>SatsGift</a>
      <span className="header-tag">{tag}</span>
    </header>
    <main>{children}</main>
  </>;
}
