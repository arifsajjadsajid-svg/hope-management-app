import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import {
  admissionFormSchema,
  marksSheetSchema,
  studentListSchema,
  type ScanKind,
  type ScanReading,
} from '@/lib/scan/schemas';

/**
 * Reads a photograph or PDF of a school document into structured rows, using
 * Claude. Nothing read here is saved: the rows go to a review screen, and only
 * what a person has checked there is written to the database.
 */

/** Can be pointed at a cheaper model from the Vercel settings without a code change. */
export const SCAN_MODEL = process.env.SCAN_MODEL?.trim() || 'claude-opus-5';

export const SCAN_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export type ScanMediaType = (typeof SCAN_MEDIA_TYPES)[number];

export class ScanError extends Error {}

export function scanningConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/** Confirms the bytes really are the type the browser said, before they go anywhere. */
export function sniffScanFile(buffer: Buffer, declared: string): ScanMediaType | null {
  if (buffer.length < 12) return null;
  const is = (type: ScanMediaType) => (declared === type ? type : null);
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return is('application/pdf');
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return is('image/jpeg');
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return is('image/png');
  }
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return is('image/webp');
  }
  return null;
}

/** A rough page count, good enough to turn away a whole scanned register in one file. */
export function countPdfPages(buffer: Buffer): number {
  const matches = buffer.toString('latin1').match(/\/Type\s*\/Page(?!s)/g);
  return matches?.length ?? 1;
}

const SYSTEM_PROMPT = `You read photographs and scans of documents from a school in Pakistan — marks sheets and award lists, result sheets, student registers and admission forms — and transcribe them into structured data for the school office.

Your transcription is checked by a person before anything is saved, and marks decide children's results, so faithfulness matters more than completeness:
- Transcribe what is written. Never fill a value in from the reference lists you are given, from a total, or from what seems likely. A blank stays blank.
- When a value is hard to read, give your best reading and list that field in "unclear". Put anything smudged, overwritten, cut off or ambiguous there; the office would much rather check a value than save a wrong one.
- Where a value has been crossed out and rewritten, use the final value and list it as unclear.
- Absent, exempt, medical and withheld marks are written ABS, EX, MED and WH. Half marks are decimals, such as 32.5.
- Dates here are written day first. Give yyyy-mm-dd only when day, month and year are all clear; otherwise copy the date as written.
- Names written in Urdu should be given in English letters as they are usually spelt in Pakistan, and listed as unclear.
- Leave out headings, signatures, stamps and summary lines such as class averages or column totals.
- If the page is not the kind of document expected, say what it is in documentKind and explain in problem.`;

function kindInstructions(kind: ScanKind): string {
  switch (kind) {
    case 'marks':
      return 'This should be a marks sheet, award list or result sheet. Give one row per student and one column for each column of marks or totals. Roll number and name are not columns.';
    case 'students':
      return 'This should be a list or register of students. Give one row per student with whatever details the page shows.';
    case 'admissions':
      return 'This should be one or more admission forms. Give one entry per child applying.';
  }
}

function schemaFor(kind: ScanKind) {
  switch (kind) {
    case 'marks':
      return marksSheetSchema;
    case 'students':
      return studentListSchema;
    case 'admissions':
      return admissionFormSchema;
  }
}

/** Models that accept automatic fallback when their safety checks decline a request. */
function supportsDefaultFallback(model: string): boolean {
  return model === 'claude-opus-5' || model.startsWith('claude-fable-5');
}

export type ReadResult = ScanReading & {
  model: string;
  usage: { inputTokens: number; outputTokens: number };
};

export async function readDocument(input: {
  kind: ScanKind;
  mediaType: ScanMediaType;
  data: Buffer;
  /** Reference details for this page: the exam's subjects, the class list. */
  context: string;
}): Promise<ReadResult> {
  if (!scanningConfigured()) {
    throw new ScanError('Document scanning is not switched on. Add ANTHROPIC_API_KEY in the Vercel project settings.');
  }

  const client = new Anthropic({ maxRetries: 2 });

  const documentBlock: BetaContentBlockParam =
    input.mediaType === 'application/pdf'
      ? {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: input.data.toString('base64') },
        }
      : {
          type: 'image',
          source: { type: 'base64', media_type: input.mediaType, data: input.data.toString('base64') },
        };

  const fallback = supportsDefaultFallback(SCAN_MODEL)
    ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
    : {};

  let message;
  try {
    const stream = client.beta.messages.stream(
      {
        model: SCAN_MODEL,
        max_tokens: 64000,
        ...fallback,
        thinking: { type: 'adaptive' },
        system: SYSTEM_PROMPT,
        output_config: { format: betaZodOutputFormat(schemaFor(input.kind)) },
        messages: [
          {
            role: 'user',
            content: [
              documentBlock,
              { type: 'text', text: `${kindInstructions(input.kind)}\n\n${input.context}`.trim() },
            ],
          },
        ],
      },
      // Leaves time to answer before the hosting platform ends the request at 300 seconds.
      { signal: AbortSignal.timeout(280_000) },
    );
    message = await stream.finalMessage();
  } catch (error) {
    throw toScanError(error);
  }

  if (message.stop_reason === 'refusal') {
    throw new ScanError('This document could not be read. Try a clearer photo of just the page itself.');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new ScanError('This page holds more than can be read in one go. Photograph it in two halves and upload both.');
  }
  if (!message.parsed_output) {
    throw new ScanError('The reading came back incomplete. Please try this page again.');
  }

  const usage = {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };

  return { kind: input.kind, reading: message.parsed_output, model: message.model, usage } as ReadResult;
}

function toScanError(error: unknown): ScanError {
  if (error instanceof ScanError) return error;

  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ScanError(
      'The scanning service did not accept the API key. Check ANTHROPIC_API_KEY in the Vercel project settings.',
    );
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ScanError('Too many pages are being read at once. Wait a minute, then try again.');
  }
  if (error instanceof Anthropic.BadRequestError) {
    console.error('[scan] request rejected', error.message);
    return new ScanError(
      'The scanning service rejected this page. If every page fails, the Anthropic account may be out of credit — check Billing at console.anthropic.com.',
    );
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError || (error instanceof Error && error.name === 'AbortError')) {
    return new ScanError('Reading this page took too long. Try a smaller photo, or split a PDF into fewer pages.');
  }
  if (error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionError) {
    return new ScanError('The scanning service is busy or unreachable right now. Please try again in a few minutes.');
  }
  if (error instanceof Anthropic.APIError) {
    console.error('[scan] API error', error.status, error.message);
    return new ScanError(`The scanning service returned an error (${error.status ?? 'unknown'}). Please try again.`);
  }

  console.error('[scan] unexpected failure', error);
  return new ScanError('Something went wrong while reading this page. Please try again.');
}
