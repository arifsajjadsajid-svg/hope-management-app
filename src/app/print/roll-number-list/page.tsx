import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAcademySettings } from '@/lib/settings';
import { Letterhead, DocumentFooter, SignatureRow } from '@/components/brand/letterhead';
import { PrintToolbar } from '../print-toolbar';
import { chunk } from '@/lib/utils';

export const metadata: Metadata = { title: 'Roll Number List' };
export const dynamic = 'force-dynamic';

const ROWS_PER_PAGE = 26;

export default async function RollNumberListPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('exams.view');
  const params = await searchParams;
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const examId = pick('examId');
  if (!examId) notFound();

  const [academy, exam, allocations, seats] = await Promise.all([
    getAcademySettings(),
    prisma.exam.findUnique({ where: { id: examId }, include: { session: true } }),
    prisma.rollNumberAllocation.findMany({
      where: {
        examId,
        ...(pick('classId') ? { enrollment: { classId: pick('classId') } } : {}),
        ...(pick('sectionId') ? { enrollment: { sectionId: pick('sectionId') } } : {}),
      },
      include: {
        student: { select: { fullName: true, fatherName: true, admissionNumber: true } },
        enrollment: {
          include: {
            schoolClass: { select: { name: true, displayOrder: true } },
            section: { select: { name: true } },
          },
        },
      },
      orderBy: [{ sequence: 'asc' }, { rollNumber: 'asc' }],
    }),
    prisma.seatAssignment.findMany({
      where: { examId },
      include: { room: { select: { roomNumber: true } } },
    }),
  ]);

  if (!exam) notFound();

  const seatByStudent = new Map(seats.map((s) => [s.studentId, s]));

  if (allocations.length === 0) {
    return (
      <>
        <PrintToolbar title="Roll Number List" subtitle={exam.name} />
        <div className="sheet sheet-a4 flex items-center justify-center">
          <p className="text-[11pt] text-slate-600">No roll numbers have been allocated.</p>
        </div>
      </>
    );
  }

  const pages = chunk(allocations, ROWS_PER_PAGE);

  return (
    <>
      <PrintToolbar
        title="Roll Number List"
        subtitle={`${exam.name} · ${allocations.length} candidate(s)`}
      />

      {pages.map((pageRows, pageIndex) => (
        <section key={pageIndex} className="sheet sheet-a4">
          <Letterhead
            academy={academy}
            documentTitle="Roll Number List"
            subtitle={`${exam.name} · Session ${exam.session.name}`}
          />

          <table className="doc-table" style={{ marginTop: '4mm' }}>
            <thead>
              <tr>
                <th className="num" style={{ width: '6%' }}>
                  Sr.
                </th>
                <th className="num" style={{ width: '16%' }}>
                  Roll No.
                </th>
                <th>Student Name</th>
                <th>Father Name</th>
                <th className="num" style={{ width: '15%' }}>
                  Admission No.
                </th>
                <th style={{ width: '14%' }}>Class / Section</th>
                <th className="num" style={{ width: '12%' }}>
                  Room / Seat
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((allocation, index) => {
                const seat = seatByStudent.get(allocation.studentId);
                return (
                  <tr key={allocation.id}>
                    <td className="num">{pageIndex * ROWS_PER_PAGE + index + 1}</td>
                    <td className="num">
                      <strong>{allocation.rollNumber}</strong>
                    </td>
                    <td>{allocation.student.fullName}</td>
                    <td>{allocation.student.fatherName}</td>
                    <td className="num">{allocation.student.admissionNumber}</td>
                    <td>
                      {allocation.enrollment.schoolClass.name} —{' '}
                      {allocation.enrollment.section.name}
                    </td>
                    <td className="num">
                      {seat ? `${seat.room.roomNumber} / ${seat.seatNumber}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {pageIndex === pages.length - 1 && (
            <div style={{ marginTop: '12mm' }}>
              <SignatureRow
                signatures={[
                  {
                    label: 'Examination Controller',
                    name: academy.examControllerName,
                    imagePath: academy.examControllerSign,
                  },
                  {
                    label: 'Principal / Director',
                    name: academy.principalName ?? academy.directorName,
                    imagePath: academy.principalSignPath ?? academy.directorSignPath,
                  },
                ]}
              />
            </div>
          )}

          <div style={{ marginTop: '6mm' }}>
            <DocumentFooter
              academy={academy}
              note={`Page ${pageIndex + 1} of ${pages.length} — ${academy.footerMessage}`}
            />
          </div>
        </section>
      ))}
    </>
  );
}
