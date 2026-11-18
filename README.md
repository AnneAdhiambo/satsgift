# SatsGift

A local-first React + TypeScript + Vite web app for turning Cashu ecash into personalised gifts.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Use **Try a demo token** to explore without funds.

```sh
npm run build
npm run preview
npm test
```

The production build is in `dist/`.

## Included

- Four-step token, format, personalisation, and creation flow
- Cashu v3/v4 decoding through `@cashu/cashu-ts`, with sats-only amount display
- Cabana-stripe design with coral, lagoon, sunshine and night themes, recipient/sender fields and messages
- Envelope reveal, pointer/touch scratch card with accessible reveal button, printable voucher/PDF via the browser
- Local QR generation and copy-token action with error handling
- Clearly labelled demo previews without redeemable tokens or fake QR codes
- Responsive layout, keyboard focus styles, reduced motion and print styles

## Scope and privacy

Tokens remain in React memory for this browser tab. Refreshing discards the gift. No backend, analytics, local storage, or mint requests are used. Token decoding does not verify signatures or whether funds are unspent. Anyone holding a real token can potentially redeem it; keep it private. Google Fonts loads fonts from Google; token contents are never included in those requests. System fonts work offline.

The digital gift is currently a local preview: recipient links, downloadable interactive gifts, mint validation, and wallet funding are not implemented. Printed vouchers contain the token QR and must be handled privately. Large tokens that exceed QR capacity can still be copied, but printing is disabled for them.
