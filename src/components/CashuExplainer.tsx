/** "How Cashu works" in four short points and a one-line flow. */
export function CashuExplainer() {
  return (
    <details className="cashu-explainer">
      <summary>🥜 How does Cashu work?</summary>
      <ol className="cashu-flow" aria-label="How a SatsGift moves">
        <li>⚡ You pay</li><li>🏦 Mint signs ecash</li><li>🎁 Gift link</li><li>📱 They claim</li>
      </ol>
      <ul className="cashu-points">
        <li><b>Ecash is digital cash.</b> A Cashu mint issues it in exchange for bitcoin, as proofs worth 1, 2, 4, 8… sats, like coins.</li>
        <li><b>Private by design.</b> The mint signs your coins <em>blinded</em>, without seeing them, so it can’t tell who holds or spends them.</li>
        <li><b>Bearer money.</b> Whoever holds the token owns the sats. That’s why a gift can be just a link, with no accounts.</li>
        <li><b>Trust the mint.</b> The mint holds the bitcoin behind the ecash. SatsGift uses Testnut, Cashu’s test mint with fake sats.</li>
      </ul>
    </details>
  );
}
