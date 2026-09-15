import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requireParent, childrenForPhone } from '@/lib/parent-auth';
import { prisma } from '@/lib/prisma';
import { getAcademySettings } from '@/lib/settings';
import { verificationQr } from '@/lib/qr';
import { ReportCardSheet, REPORT_CARD_INCLUDE } from '@/components/documents/report-card-sheet';
import { PrintToolbar } from '@/app/print/print-toolbar';

export const metadata: Metadata = { title: 'Report Card' };
export const dynamic = 'force-dynamic';

/**
 * A parent's printable report card.
 *
 * Lives outside /print because every document there is staff-only. It renders
 * the very same sheet, but only for a result that is both published and belongs
 * to one of this parent's children. Anything else is a 404, so the address
 * cannot be used to discover other students' results by changing the ID.
 */
export default async function ParentReportCardPage({
  params,
}: {
  params: Promise<{ resultId: string }>;
}) {
  const parent = await requireParent();
  if (parent.mustChangePassword) redirect('/parent/change-password');

  const { resultId } = await params;

  const [academy, children, result] = await Promise.all([
    getAcademySettings(),
    childrenForPhone(parent.phone),
    prisma.result.findUnique({ where: { id: resultId }, include: REPORT_CARD_INCLUDE }),
  ]);

  if (!result || !result.isPublished) notFound();
  if (!children.some((child) => child.id === result.studentId)) notFound();

  const [exam, roll, qr] = await Promise.all([
    prisma.exam.findUnique({ where: { id: result.examId }, include: { session: true } }),
    prisma.rollNumberAllocation.findUnique({
      where: { examId_studentId: { examId: result.examId, studentId: result.studentId } },
      select: { rollNumber: true },
    }),
    verificationQr(result.verificationCode, 132),
  ]);

  if (!exam) notFound();

  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <PrintToolbar
        title="Report Card"
        subtitle={`${result.student.fullName} · ${exam.name}`}
        hint='To keep a copy, choose "Save as PDF" in the print dialog. On a phone, use Share → Print, then save or share the PDF.'
      />
      <ReportCardSheet
        result={result}
        exam={exam}
        academy={academy}
        rollNumber={roll?.rollNumber ?? result.enrollment.rollNumber ?? '—'}
        qr={qr}
      />
    </div>
  );
}
