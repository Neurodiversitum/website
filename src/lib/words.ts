// Small numbers as words, for lines such as "Three ideas for a calmer campus."
import type { Language } from './i18n';

const WORDS: Record<Language, string[]> = {
  en: [
    'No',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
  ],
  de: [
    'Keine',
    'Eine',
    'Zwei',
    'Drei',
    'Vier',
    'Fünf',
    'Sechs',
    'Sieben',
    'Acht',
    'Neun',
  ],
};

/** The number as a capitalised word up to nine, as digits from ten. */
export function countWord(n: number, lang: Language): string {
  return WORDS[lang][n] ?? String(n);
}
