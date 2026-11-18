import type { CSSProperties } from 'react';

export type Format = 'card' | 'scratch' | 'print';

// stripe: awning colour · ink: accent text that stays readable on paper · paper: card background · text: body ink
export const themes = {
  coral: { stripe: '#e8553e', ink: '#c23b26', paper: '#fff6ee', text: '#3a1f1a' },
  lagoon: { stripe: '#1f9e95', ink: '#137067', paper: '#effaf7', text: '#173533' },
  sunshine: { stripe: '#f5b83d', ink: '#94600a', paper: '#fff8e6', text: '#3b2c0b' },
  night: { stripe: '#f5b83d', ink: '#f5b83d', paper: '#1f2f4a', text: '#fff3dc' },
};
export type Theme = keyof typeof themes;

export const formats: { id: Format; icon: string; name: string; text: string }[] = [
  { id: 'card', icon: '💌', name: 'Digital gift card', text: 'A personal card in an envelope with a QR code.' },
  { id: 'scratch', icon: '🪙', name: 'Scratch card', text: 'Recipient scratches off the foil to reveal the gift.' },
  { id: 'print', icon: '🖨️', name: 'Print voucher', text: 'A paper voucher with claim instructions.' },
];

/** CSS custom properties that colour a gift card or envelope. */
export function themeStyle(theme: Theme): CSSProperties {
  const t = themes[theme];
  return { '--accent': t.stripe, '--accent-ink': t.ink, '--paper': t.paper, '--card-ink': t.text } as CSSProperties;
}
