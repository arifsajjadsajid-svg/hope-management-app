/**
 * SMS message sizing.
 *
 * Unlike WhatsApp, an SMS is billed per 160-character segment — and a single
 * character outside the GSM-7 alphabet forces the whole message into UCS-2,
 * cutting each segment to 70 characters. An em dash or a curly quote pasted
 * from Word can therefore triple the cost of a result announcement, so the
 * composer shows the operator exactly what a message will cost before sending.
 */

/** The GSM 03.38 basic alphabet: one septet each. */
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

/** Characters that need an escape septet, so they count as two. */
const GSM_EXTENDED = '^{}\\[~]|€';

const BASIC = new Set(GSM_BASIC.split(''));
const EXTENDED = new Set(GSM_EXTENDED.split(''));

export type SmsEncoding = 'GSM-7' | 'UCS-2';

export type SmsMetrics = {
  encoding: SmsEncoding;
  /** Billable length: extended GSM characters count as two. */
  length: number;
  characters: number;
  segments: number;
  /** Characters still available inside the current segment count. */
  remaining: number;
  perSegment: number;
  /** Non-GSM characters that forced UCS-2, with their positions. */
  offenders: { char: string; count: number }[];
};

/** Whether every character fits the GSM-7 alphabet. */
export function isGsm7(text: string): boolean {
  for (const char of text) {
    if (!BASIC.has(char) && !EXTENDED.has(char)) return false;
  }
  return true;
}

/** The characters that would force an expensive UCS-2 encoding. */
export function nonGsmCharacters(text: string): { char: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const char of text) {
    if (BASIC.has(char) || EXTENDED.has(char)) continue;
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([char, count]) => ({ char, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Measures a message the way a carrier will bill it.
 */
export function measureSms(text: string): SmsMetrics {
  const offenders = nonGsmCharacters(text);
  const encoding: SmsEncoding = offenders.length === 0 ? 'GSM-7' : 'UCS-2';

  // UCS-2 counts UTF-16 code units, so an emoji costs two.
  const characters = [...text].length;

  let length: number;
  if (encoding === 'GSM-7') {
    length = 0;
    for (const char of text) length += EXTENDED.has(char) ? 2 : 1;
  } else {
    length = text.length; // UTF-16 code units
  }

  const single = encoding === 'GSM-7' ? 160 : 70;
  const concatenated = encoding === 'GSM-7' ? 153 : 67;

  const segments = length === 0 ? 0 : length <= single ? 1 : Math.ceil(length / concatenated);
  const perSegment = segments <= 1 ? single : concatenated;
  const capacity = segments <= 1 ? single : segments * concatenated;

  return {
    encoding,
    length,
    characters,
    segments,
    remaining: Math.max(0, capacity - length),
    perSegment,
    offenders,
  };
}

/**
 * Replaces the typographic characters that most often push a message into
 * UCS-2 with their plain GSM-7 equivalents, leaving the meaning intact.
 */
export function toGsmSafe(text: string): string {
  return text
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—―]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[•·]/g, '-')
    .replace(/×/g, 'x')
    .replace(/₹/g, 'Rs')
    .replace(/→/g, '->');
}

/** A short, human explanation of what the message will cost to send. */
export function describeSms(metrics: SmsMetrics): string {
  if (metrics.segments === 0) return 'Empty message';
  const unit = metrics.segments === 1 ? 'SMS' : 'SMS messages';
  return `${metrics.length} characters — ${metrics.segments} ${unit} per recipient (${metrics.encoding}, ${metrics.perSegment} per part)`;
}
