import 'server-only';

import QRCode from 'qrcode';
import { appBaseUrl } from './settings';

/**
 * Renders a QR code as a data URI so it can be embedded directly in a printed
 * document without a second network request at print time.
 */
export async function qrDataUrl(value: string, size = 128): Promise<string> {
  try {
    return await QRCode.toDataURL(value, {
      width: size,
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f2547ff', light: '#ffffffff' },
    });
  } catch (error) {
    console.error('[qr] failed to render QR code', error);
    // A transparent 1×1 GIF keeps the layout intact if rendering ever fails.
    return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  }
}

/** Absolute URL of the public verification page for a document code. */
export function verificationUrl(code: string): string {
  return `${appBaseUrl()}/verify/${encodeURIComponent(code)}`;
}

/** Convenience: QR image for a verification code. */
export async function verificationQr(code: string, size = 128): Promise<string> {
  return qrDataUrl(verificationUrl(code), size);
}
