/**
 * Fixed list of painted sign texts, drawn once into one atlas texture
 * (2 columns x 16 rows, 4:1 cells). Pure data, no three.js.
 * In-world signage is art, not UI: if it should ever be translated, move the
 * list to text keys and redraw the atlas per language.
 */
export const SIGN_TEXTS = [
  'PUB',
  'COSY LOCAL',
  'THE BADGER',
  'SPORTCAFÉ',
  'BANK',
  'GEMEENTE',
  'BROUWERIJ',
  'PAKHUIS',
  'BAKKERIJ',
  'KAAS',
  'KOFFIE',
  'BLOEMEN',
  'FIETSEN',
  'KAPPER',
  'BOEKEN',
  'ANTIEK',
  'SNACKBAR',
  'WIJN',
  'TOKO',
  'TE KOOP',
  'ANNO 1672',
  'ANNO 1718',
  'ANNO 1764',
  'ANNO 1893',
  'SYNERGY',
  'SYNERGY CONSULTING',
  'THRIVING',
  'OPEN',
  'NEE NEE',
  'VERHUURD',
] as const;

export type SignText = (typeof SIGN_TEXTS)[number];

export const ATLAS_COLS = 2;
export const ATLAS_ROWS = 16;
/** Width / height of one cell. */
export const ATLAS_CELL_ASPECT = 4;

export interface AtlasCell {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export function isSignText(t: string): t is SignText {
  return (SIGN_TEXTS as readonly string[]).includes(t);
}

/** UV rectangle of a text (texture flipY: v = 1 is the top of the canvas). null if unknown. */
export function signCell(text: string): AtlasCell | null {
  const i = (SIGN_TEXTS as readonly string[]).indexOf(text);
  if (i < 0) return null;
  const col = i % ATLAS_COLS;
  const row = Math.floor(i / ATLAS_COLS);
  const pad = 0.002;
  return {
    u0: col / ATLAS_COLS + pad,
    u1: (col + 1) / ATLAS_COLS - pad,
    v0: 1 - (row + 1) / ATLAS_ROWS + pad,
    v1: 1 - row / ATLAS_ROWS - pad,
  };
}
