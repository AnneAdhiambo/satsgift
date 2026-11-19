/** Live tracker for Cashu minting. `current` is the step in progress (0–3); 4 means all done. */
export function MintSteps({ current, test }: { current: number; test: boolean }) {
  const steps = [
    { title: 'Mint quote', spec: 'NUT-04', text: 'The mint gives us a Lightning invoice for the amount.' },
    { title: 'Invoice paid', spec: 'Lightning', text: test ? 'Testnut pays test invoices itself, so these sats are free.' : 'Pay it from any Lightning wallet.' },
    { title: 'Blind signatures', spec: 'NUT-00', text: 'Your browser blinds secrets and the mint signs them, so it can’t link this ecash to you.' },
    { title: 'Ecash ready', spec: 'cashuB', text: 'The signed proofs are packed into a Cashu token for the gift.' },
  ];
  return (
    <ol className="mint-steps" aria-label="Minting progress">
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : 'todo';
        return (
          <li key={s.title} className={state} aria-current={state === 'active' ? 'step' : undefined}>
            <span className="mint-step-dot" aria-hidden="true">{state === 'done' ? '✓' : i + 1}</span>
            <div>
              <b>{s.title}</b> <code>{s.spec}</code>
              <small>{s.text}</small>
            </div>
            <span className="visually-hidden">{state === 'done' ? 'done' : state === 'active' ? 'in progress' : 'not started'}</span>
          </li>
        );
      })}
    </ol>
  );
}
