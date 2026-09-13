/**
 * Phone number handling for parent messaging.
 *
 * Numbers are stored the way the office types them ("0300-4200000"), but a
 * WhatsApp chat link needs the international form with no punctuation
 * ("923004200000"). Everything here is pure so it can run on both sides.
 */

/** Pakistan. Change this if the academy ever enrols families abroad. */
export const DEFAULT_COUNTRY_CODE = '92';

export type NormalisedPhone =
  | { ok: true; dialNumber: string; display: string }
  | { ok: false; reason: string };

/**
 * Converts a locally-written number into international dialling form.
 *
 *   0300-4200000    -> 923004200000
 *   +92 300 4200000 -> 923004200000
 *   3004200000      -> 923004200000
 */
export function normalisePhone(
  raw: string | null | undefined,
  countryCode = DEFAULT_COUNTRY_CODE,
): NormalisedPhone {
  if (!raw || !raw.trim()) return { ok: false, reason: 'No number on file' };

  let digits = raw.replace(/[^\d+]/g, '');

  // "00" is the international prefix in Pakistan; "+" means the same thing.
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);

  if (!/^\d+$/.test(digits)) return { ok: false, reason: 'Number contains invalid characters' };

  // A national number written with the trunk "0": 03004200000
  if (digits.startsWith('0')) digits = countryCode + digits.slice(1);
  // A bare mobile number with no trunk prefix: 3004200000
  else if (digits.length === 10 && !digits.startsWith(countryCode)) digits = countryCode + digits;

  if (digits.length < 10) return { ok: false, reason: 'Number is too short' };
  if (digits.length > 15) return { ok: false, reason: 'Number is too long' };

  // Pakistani mobiles are 92 followed by 10 digits beginning with 3.
  if (countryCode === '92' && digits.startsWith('92')) {
    const national = digits.slice(2);
    if (national.length !== 10) {
      return { ok: false, reason: 'A Pakistani mobile number needs 10 digits after 92' };
    }
    if (!national.startsWith('3')) {
      return { ok: false, reason: 'Not a mobile number — messaging needs a mobile' };
    }
  }

  return { ok: true, dialNumber: digits, display: formatDisplay(digits, countryCode) };
}

/** "923004200000" -> "+92 300 4200000" */
export function formatDisplay(dialNumber: string, countryCode = DEFAULT_COUNTRY_CODE): string {
  if (countryCode === '92' && dialNumber.startsWith('92') && dialNumber.length === 12) {
    const national = dialNumber.slice(2);
    return `+92 ${national.slice(0, 3)} ${national.slice(3)}`;
  }
  return `+${dialNumber}`;
}

/**
 * Builds a WhatsApp click-to-chat link. Opening it launches WhatsApp (desktop
 * app, or web) with the conversation open and the message already typed — the
 * operator only has to press send.
 */
export function whatsappLink(dialNumber: string, message: string): string {
  return `https://wa.me/${dialNumber}?text=${encodeURIComponent(message)}`;
}

/**
 * Builds an `sms:` link that opens the device's messaging app with the number
 * and text already filled in.
 *
 * The separator before `body` differs by platform: iOS historically expects
 * `&`, Android and the RFC expect `?`. Pass the user agent to get the right one.
 */
export function smsLink(dialNumber: string, message: string, userAgent?: string): string {
  const isApple = /iPhone|iPad|iPod|Macintosh/i.test(userAgent ?? '');
  const separator = isApple ? '&' : '?';
  return `sms:+${dialNumber}${separator}body=${encodeURIComponent(message)}`;
}

/**
 * Picks the best number to message a family on, in order of preference.
 *
 * The channel only affects the label shown to the operator: the number saved in
 * the WhatsApp field is the family's mobile, so calling it "WhatsApp" on an SMS
 * send list would read as the wrong app.
 */
export function preferredContact(
  student: {
    whatsappNumber?: string | null;
    parentPhone?: string | null;
    studentPhone?: string | null;
    emergencyContact?: string | null;
    fatherName?: string | null;
    guardianName?: string | null;
    fullName?: string | null;
  },
  channel: 'WHATSAPP' | 'SMS' = 'WHATSAPP',
): { phone: string; label: string; contactName: string } | null {
  const candidates: { phone: string | null | undefined; label: string; contactName: string }[] = [
    {
      phone: student.whatsappNumber,
      label: channel === 'SMS' ? 'Mobile' : 'WhatsApp',
      contactName: student.fatherName ?? student.guardianName ?? 'Parent',
    },
    {
      phone: student.parentPhone,
      label: 'Parent phone',
      contactName: student.fatherName ?? student.guardianName ?? 'Parent',
    },
    {
      phone: student.studentPhone,
      label: 'Student phone',
      contactName: student.fullName ?? 'Student',
    },
    {
      phone: student.emergencyContact,
      label: 'Emergency contact',
      contactName: 'Emergency contact',
    },
  ];

  for (const candidate of candidates) {
    if (candidate.phone && normalisePhone(candidate.phone).ok) {
      return {
        phone: candidate.phone,
        label: candidate.label,
        contactName: candidate.contactName,
      };
    }
  }

  // Fall back to the first number present, even if it fails validation, so the
  // operator can see and correct it rather than the student vanishing silently.
  const anyNumber = candidates.find((c) => c.phone?.trim());
  return anyNumber
    ? { phone: anyNumber.phone!, label: anyNumber.label, contactName: anyNumber.contactName }
    : null;
}
