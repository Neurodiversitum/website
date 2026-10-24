// File rules for pictures and material. Pure functions, testable in Node.

export const PICTURE_MAX_BYTES = 2 * 1024 * 1024;
export const MATERIAL_MAX_BYTES = 25 * 1024 * 1024;

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

/** The image type by its first bytes, or null when the bytes are not a supported image. */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return 'image/png';
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** File types the board may upload as material, by extension. */
export const MATERIAL_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  odt: 'application/vnd.oasis.opendocument.text',
  odp: 'application/vnd.oasis.opendocument.presentation',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  zip: 'application/zip',
  ics: 'text/calendar',
};

/** The content type for a material file name, or null when the type is not allowed. */
export function materialContentType(fileName: string): string | null {
  const extension = fileName.toLowerCase().split('.').pop() ?? '';
  return MATERIAL_TYPES[extension] ?? null;
}

/** A file name that is safe in a header and an object key: ASCII letters, digits, dots, dashes. */
export function safeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const clean = base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+\./g, '.')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 100);
  return clean || 'file';
}

/** 1.2 MB, 340 kB, 12 B (binary steps, so the limits read as round numbers) */
export function formatBytes(size: number, lang: 'en' | 'de' = 'en'): string {
  const units = ['B', 'kB', 'MB', 'GB'];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const text = unit === 0 ? String(value) : value.toFixed(value < 10 ? 1 : 0);
  return `${lang === 'de' ? text.replace('.', ',') : text} ${units[unit]}`;
}
