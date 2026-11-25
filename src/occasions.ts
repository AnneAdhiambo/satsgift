// Occasions for group sends: each fills in a friendly starting letter and theme, all fully editable.
import type { Theme } from './themes.ts';

export type OccasionId = 'christmas' | 'eid' | 'birthday' | 'graduation' | 'wedding' | 'thanks' | 'celebration' | 'other';
export type Occasion = { id: OccasionId; icon: string; label: string; theme: Theme; letter: string };

export const OCCASIONS: Occasion[] = [
  { id: 'christmas', icon: '🎄', label: 'Christmas', theme: 'coral', letter: 'Merry Christmas! Thank you for all the joy you brought this year. Here’s a little bitcoin to make the season brighter.' },
  { id: 'eid', icon: '🌙', label: 'Eid', theme: 'night', letter: 'Eid Mubarak! Wishing you peace, blessings and happiness. Here’s a little something to celebrate with.' },
  { id: 'birthday', icon: '🎂', label: 'Birthday', theme: 'sunshine', letter: 'Happy birthday! We hope your day is as wonderful as you are. Here’s a little bitcoin to treat yourself.' },
  { id: 'graduation', icon: '🎓', label: 'Graduation', theme: 'night', letter: 'Congratulations on your graduation! We’re so proud of everything you’ve achieved. Here’s a little something for the next chapter.' },
  { id: 'wedding', icon: '💍', label: 'Wedding', theme: 'lagoon', letter: 'Thank you for standing with us on our special day. We couldn’t have done it without you. Here’s a little token of our love.' },
  { id: 'thanks', icon: '🙏', label: 'Thank you', theme: 'lagoon', letter: 'Thank you for everything you bring to our lives. Here’s a little bitcoin to say how much we appreciate you.' },
  { id: 'celebration', icon: '🎉', label: 'Celebration', theme: 'sunshine', letter: 'We’re celebrating, and we wanted you to share in it! Here’s a little bitcoin from us.' },
  { id: 'other', icon: '✏️', label: 'Something else', theme: 'coral', letter: '' },
];

export const OCCASION_LABEL_MAX = 40;
export const DEFAULT_OCCASION: OccasionId = 'thanks';

export const findOccasion = (id: string) => OCCASIONS.find(o => o.id === id);

/** Is this letter still one of our starting templates (so switching occasion may replace it)? */
export const isTemplateLetter = (text: string) => !text.trim() || OCCASIONS.some(o => o.letter === text);

/** What recipients see on the envelope and letter, e.g. "🎄 Christmas" or "✏️ Back to school". */
export function occasionTag(id: string, custom: string): string {
  const o = findOccasion(id);
  if (!o) return '';
  if (o.id === 'other') return custom.trim() ? `✨ ${custom.trim()}` : '';
  return `${o.icon} ${o.label}`;
}
