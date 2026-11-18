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

- **Sender:** add sats (pay a Lightning invoice, or paste a Cashu token) → pick a format → personalise → share
- **Test mode:** only test mints are accepted (Testnut pays its own invoices). To go live, add real mints to `MINTS` in `src/mint.ts`
- **Lightning funding** via a Cashu mint (NUT-04); an invoice paid across a refresh is still collected
- **Pasted tokens** are checked and swapped at the mint (NUT-03), so spent or fake tokens are caught
- **Your gifts:** every gift made in this browser, with Waiting / Claimed status (NUT-07)
- **Gift links:** the gift (token + card) is compressed into the link’s `#g=…` fragment, which browsers never send to a server
- **Share:** WhatsApp, the phone’s share sheet, copy link, or a QR of the link. Printed vouchers carry the link QR
- **Recipient page:** envelope → card or scratch-off → claim with a Cashu wallet. Shows “already claimed” using NUT-07
- The sender never sees a claimable QR: previews show a hidden claim code
- Cabana-stripe design with coral, lagoon, sunshine and night themes; responsive, keyboard-friendly, reduced-motion and print styles

## Project layout

```
src/App.tsx            routes: #g=… → recipient page, otherwise the builder
src/pages/             Builder (sender) and Recipient
src/steps/             Fund, Format, Personalise, Share
src/components/        GiftCard, GiftReveal, Scratch, LightningFund, ThemePicker, Shell
src/mint.ts            all mint calls (invoice, mint, swap, claimed check) and the allowed mints
src/storage.ts         browser saving: draft, pending invoice, your gifts
src/giftLink.ts        encode/decode gifts in the link
src/token.ts           token parsing and validation
```

## Scope and privacy

There is no backend, account or analytics. The app talks only to the Cashu mint (to create invoices, mint sats and check whether a gift was claimed) and to Google Fonts. **The gift link is the money:** whoever opens it first can claim the sats, so share it privately. Gifts in progress, unpaid invoices and every gift you make are saved in this browser (localStorage), and “Your gifts” doubles as the backup until a gift is claimed. Clearing site data deletes them. Each mint holds the bitcoin behind its tokens, so only use mints you trust.
