import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAcademySettings } from '@/lib/settings';
import { verificationQr } from '@/lib/qr';
import { ReportCardSheet, REPORT_CARD_INCLUDE } from '@/components/documents/report-card-sheet';
import { PrintToolbar } from '../print-toolbar';

export const metadata: Metadata = { title: 'Report Card' };
export const dynamic = 'force-dynamic';

export default async function ReportCardPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('results.view');
  const params = await searchParams;
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const examId = pick('examId');
  if (!examId) notFound();

  const [academy, exam] = await Promise.all([
    getAcademySettings(),
    prisma.exam.findUnique({ where: { id: examId }, include: { session: true } }),
  ]);
  if (!exam) notFound();

  const results = await prisma.result.findMany({
    where: {
      examId,
      ...(pick('studentId') ? { studentId: pick('studentId') } : {}),
      ...(pick('classId') ? { enrollment: { classId: pick('classId') } } : {}),
      ...(pick('sectionId') ? { enrollment: { sectionId: pick('sectionId') } } : {}),
      ...(pick('status') ? { status: pick('status') } : {}),
      ...(pick('q')
        ? {
            student: {
              OR: [
                { fullName: { contains: pick('q')! } },
                { fatherName: { contains: pick('q')! } },
                { admissionNumber: { contains: pick('q')! } },
              ],
            },
          }
        : {}),
    },
    include: REPORT_CARD_INCLUDE,
    orderBy: [
      { enrollment: { schoolClass: { displayOrder: 'asc' } } },
      { classPosition: 'asc' },
      { percentage: 'desc' },
    ],
  });

  if (results.length === 0) {
    return (
      <>
        <PrintToolbar title="Report Cards" subtitle={exam.name} />
        <div className="sheet sheet-a4 flex items-center justify-center">
          <p className="text-center text-[11pt] text-slate-600">
            No results match this selection. Process the examination result first.
          </p>
        </div>
      </>
    );
  }

  const rolls = await prisma.rollNumberAllocation.findMany({
    where: { examId },
    select: { studentId: true, rollNumber: true },
  });
  const rollByStudent = new Map(rolls.map((r) => [r.studentId, r.rollNumber]));

  const cards = await Promise.all(
    results.map(async (result) => ({
      result,
      rollNumber: rollByStudent.get(result.studentId) ?? result.enrollment.rollNumber ?? '—',
      qr: await verificationQr(result.verificationCode, 132),
    })),
  );

  return (
    <>
      <PrintToolbar
        title="Report Cards"
        subtitle={`${exam.name} · ${cards.length} report card(s)`}
      />

      {cards.map(({ result, rollNumber, qr }) => (
        <ReportCardSheet
          key={result.id}
          result={result}
          exam={exam}
          academy={academy}
          rollNumber={rollNumber}
          qr={qr}
        />
      ))}
    </>
  );
}
