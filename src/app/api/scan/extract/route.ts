import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission, type SessionUser } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { AUDIT_ACTIONS } from '@/lib/constants';
import { getCurrentSession } from '@/lib/settings';
import { SCAN_KINDS, type ScanKind } from '@/lib/scan/schemas';
import type { PermissionCode } from '@/lib/permissions';
import { BusinessRuleError } from '@/server/action-result';
import { loadMarksContext } from '@/server/services/scan/context';
import {
  countPdfPages,
  readDocument,
  ScanError,
  scanningConfigured,
  sniffScanFile,
} from '@/server/services/scan/read-document';

export const dynamic = 'force-dynamic';
// Reading a full page of handwriting can take a minute or two.
export const maxDuration = 300;

const PERMISSION: Record<ScanKind, PermissionCode> = {
  marks: 'marks.import',
  students: 'students.import',
  admissions: 'admissions.manage',
};

/** Vercel refuses request bodies over 4.5 MB before this code ever runs. */
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_PDF_PAGES = 10;

/** Each file read is paid for, so a runaway loop or a misuse cannot run up a large bill. */
function dailyLimit(): number {
  const configured = Number(process.env.SCAN_DAILY_LIMIT);
  return Number.isFinite(configured) && configured > 0 ? configured : 150;
}

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

/**
 * Reads one uploaded photo or PDF and returns what it says. Stores nothing:
 * the file is sent to the reading service and discarded, and the rows go back
 * to the browser for review.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('The upload could not be read. It may be too large — keep each file under 4 MB.', 413);
  }

  const kind = String(form.get('kind') ?? '') as ScanKind;
  if (!SCAN_KINDS.includes(kind)) return fail('Choose what kind of document this is.', 400);

  let user: SessionUser;
  try {
    user = await requirePermission(PERMISSION[kind]);
  } catch {
    return fail('Your account is not allowed to import this kind of document.', 403);
  }

  if (!scanningConfigured()) {
    return fail('Document scanning is not switched on yet. A Super Admin needs to add ANTHROPIC_API_KEY in Vercel.', 503);
  }

  const upload = form.get('file');
  if (!(upload instanceof File) || upload.size === 0) return fail('No file was received.', 400);
  if (upload.size > MAX_BYTES) {
    return fail(`${upload.name} is ${(upload.size / 1024 / 1024).toFixed(1)} MB. Each file must be under 4 MB.`, 413);
  }

  const data = Buffer.from(await upload.arrayBuffer());
  const mediaType = sniffScanFile(data, upload.type);
  if (!mediaType) return fail(`${upload.name} is not a JPEG, PNG or WebP photo, or a PDF.`, 415);

  if (mediaType === 'application/pdf' && countPdfPages(data) > MAX_PDF_PAGES) {
    return fail(`${upload.name} has more than ${MAX_PDF_PAGES} pages. Split it into smaller PDFs.`, 413);
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const readToday = await prisma.auditLog.count({
    where: { action: AUDIT_ACTIONS.DOCUMENT_SCANNED, createdAt: { gte: since } },
  });
  if (readToday >= dailyLimit()) {
    return fail(
      `The academy has read ${readToday} documents in the last 24 hours, which is the daily limit. Try again later, or raise SCAN_DAILY_LIMIT in Vercel.`,
      429,
    );
  }

  let context = '';
  try {
    context = await describeContext(kind, form);
  } catch (error) {
    if (error instanceof BusinessRuleError) return fail(error.message, 400);
    throw error;
  }

  try {
    const result = await readDocument({ kind, mediaType, data, context });

    await recordAudit({
      action: AUDIT_ACTIONS.DOCUMENT_SCANNED,
      entityType: 'Scan',
      entityId: kind,
      description: `Read ${kind === 'marks' ? 'a marks sheet' : kind === 'students' ? 'a student list' : 'admission forms'} from "${upload.name.slice(0, 120)}"`,
      newValue: { model: result.model, ...result.usage, bytes: upload.size },
      severity: 'INFO',
    });

    return NextResponse.json({ ok: true, ...result, fileName: upload.name });
  } catch (error) {
    if (error instanceof ScanError) return fail(error.message, 502);
    console.error('[scan] failed', { user: user.id, error });
    return fail('Something went wrong while reading this document. Please try again.', 500);
  }
}

/**
 * What the reader is told about the school so it can recognise subjects and
 * make out handwritten names. It is reference only; the prompt forbids copying
 * from it.
 */
async function describeContext(kind: ScanKind, form: FormData): Promise<string> {
  if (kind === 'marks') {
    const examId = String(form.get('examId') ?? '');
    const classId = String(form.get('classId') ?? '');
    const sectionId = String(form.get('sectionId') ?? '') || null;
    if (!examId || !classId) throw new BusinessRuleError('Choose the examination and class first.');

    const ctx = await loadMarksContext(examId, classId, sectionId);

    const subjects = ctx.subjects.map((s) =>
      s.practicalMarks > 0
        ? `${s.code} — ${s.name} — out of ${s.maxMarks} (theory ${s.theoryMarks}, practical ${s.practicalMarks})`
        : `${s.code} — ${s.name} — out of ${s.maxMarks}`,
    );
    const students = ctx.students
      .slice(0, 400)
      .map((s) => {
        const rolls = [s.examRoll && `roll ${s.examRoll}`, s.classRoll && `class roll ${s.classRoll}`]
          .filter(Boolean)
          .join(', ');
        return `${rolls || 'no roll number'} — ${s.fullName} s/o ${s.fatherName}`;
      });

    return [
      `Examination: ${ctx.exam.name}. Class: ${ctx.className}${ctx.sectionName ? `, section ${ctx.sectionName}` : ''}.`,
      '',
      'Subjects in this examination (use these codes for subjectCode):',
      ...subjects,
      '',
      'Students in this class. This is only to help you make out handwriting — transcribe roll numbers and names as the page shows them, and do not add anyone who is not on the page:',
      ...students,
    ].join('\n');
  }

  if (kind === 'admissions') {
    const session = await getCurrentSession();
    const classes = await prisma.schoolClass.findMany({
      where: session ? { sessionId: session.id, isActive: true } : { isActive: true },
      select: { name: true },
      orderBy: { displayOrder: 'asc' },
    });
    const names = [...new Set(classes.map((c) => c.name))];
    return names.length ? `Classes at this school: ${names.join(', ')}.` : '';
  }

  return '';
}
