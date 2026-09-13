import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAcademySettings } from '@/lib/settings';
import { Letterhead, DocumentFooter, SignatureRow } from '@/components/brand/letterhead';
import { PrintToolbar } from '../print-toolbar';
import { formatDate, formatTime12, dayName, chunk } from '@/lib/utils';

export const metadata: Metadata = { title: 'Examination Attendance Sheet' };
export const dynamic = 'force-dynamic';

const ROWS_PER_PAGE = 22;

export default async function AttendanceSheetPrintPage({
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

  const paperId = pick('paperId');
  if (!paperId) notFound();

  const [academy, paper] = await Promise.all([
    getAcademySettings(),
    prisma.dateSheetEntry.findUnique({
      where: { id: paperId },
      include: {
        exam: { include: { session: true } },
        examSubject: { include: { subject: { select: { name: true, code: true } } } },
        schoolClass: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        room: { select: { name: true, roomNumber: true } },
      },
    }),
  ]);

  if (!paper) notFound();

  const [enrollments, rolls, seats, attendance] = await Promise.all([
    prisma.enrollment.findMany({
      where: {
        sessionId: paper.exam.sessionId,
        classId: paper.classId,
        ...(paper.sectionId ? { sectionId: paper.sectionId } : {}),
        student: { status: 'ACTIVE' },
      },
      include: {
        student: { select: { id: true, fullName: true, fatherName: true } },
        section: { select: { name: true } },
      },
    }),
    prisma.rollNumberAllocation.findMany({ where: { examId: paper.examId } }),
    prisma.seatAssignment.findMany({ where: { examId: paper.examId } }),
    prisma.examAttendance.findMany({ where: { dateSheetEntryId: paperId } }),
  ]);

  const rollByStudent = new Map(rolls.map((r) => [r.studentId, r.rollNumber]));
  const seatByStudent = new Map(seats.map((s) => [s.studentId, s.seatNumber]));
  const statusByStudent = new Map(attendance.map((a) => [a.studentId, a.status]));

  const rows = enrollments
    .map((enrollment) => ({
      studentId: enrollment.studentId,
      rollNumber: rollByStudent.get(enrollment.studentId) ?? enrollment.rollNumber ?? '—',
      studentName: enrollment.student.fullName,
      fatherName: enrollment.student.fatherName,
      sectionName: enrollment.section.name,
      seatNumber: seatByStudent.get(enrollment.studentId) ?? '',
      status: statusByStudent.get(enrollment.studentId) ?? null,
    }))
    .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true }));

  const pages = chunk(rows, ROWS_PER_PAGE);
  const presentCount = rows.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
  const absentCount = rows.filter((r) => r.status === 'ABSENT').length;

  return (
    <>
      <PrintToolbar
        title="Examination Attendance Sheet"
        subtitle={`${paper.examSubject.subject.name} — ${paper.schoolClass.name} · ${formatDate(paper.paperDate)}`}
      />

      {pages.map((pageRows, pageIndex) => (
        <section key={pageIndex} className="sheet sheet-a4">
          <Letterhead
            academy={academy}
            documentTitle="Examination Attendance Sheet"
            subtitle={paper.exam.name}
          />

          <div
            style={{
              marginTop: '4mm',
              border: '0.4mm solid #24384f',
              borderRadius: '1.5mm',
              background: '#f4f6fa',
              padding: '2.5mm 3mm',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '1.5mm 4mm',
              fontSize: '9pt',
            }}
          >
            <span>
              <strong>Subject:</strong> {paper.examSubject.subject.name} (
              {paper.examSubject.subject.code})
            </span>
            <span>
              <strong>Class:</strong> {paper.schoolClass.name}
              {paper.section ? ` — ${paper.section.name}` : ''}
            </span>
            <span>
              <strong>Session:</strong> {paper.exam.session.name}
            </span>
            <span>
              <strong>Date:</strong> {formatDate(paper.paperDate)} ({dayName(paper.paperDate)})
            </span>
            <span>
              <strong>Timing:</strong> {formatTime12(paper.startTime)} –{' '}
              {formatTime12(paper.endTime)}
            </span>
            <span>
              <strong>Room:</strong>{' '}
              {paper.room ? `${paper.room.name} (${paper.room.roomNumber})` : '—'}
            </span>
          </div>

          <table className="doc-table" style={{ marginTop: '3.5mm' }}>
            <thead>
              <tr>
                <th className="num" style={{ width: '6%' }}>
                  Sr.
                </th>
                <th className="num" style={{ width: '13%' }}>
                  Roll No.
                </th>
                <th>Student Name</th>
                <th>Father Name</th>
                <th className="num" style={{ width: '8%' }}>
                  Seat
                </th>
                <th className="num" style={{ width: '7%' }}>
                  P
                </th>
                <th className="num" style={{ width: '7%' }}>
                  A
                </th>
                <th className="num" style={{ width: '7%' }}>
                  L
                </th>
                <th style={{ width: '20%' }}>Candidate Signature</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, index) => (
                <tr key={row.studentId}>
                  <td className="num">{pageIndex * ROWS_PER_PAGE + index + 1}</td>
                  <td className="num">
                    <strong>{row.rollNumber}</strong>
                  </td>
                  <td>{row.studentName}</td>
                  <td>{row.fatherName}</td>
                  <td className="num">{row.seatNumber || '—'}</td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {row.status === 'PRESENT' ? '✓' : ''}
                  </td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {row.status === 'ABSENT' ? '✓' : ''}
                  </td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {row.status === 'LATE' ? '✓' : ''}
                  </td>
                  <td style={{ height: '7mm' }} />
                </tr>
              ))}
            </tbody>
          </table>

          {pageIndex === pages.length - 1 && (
            <>
              <div
                style={{
                  marginTop: '4mm',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: '2mm',
                  fontSize: '9pt',
                }}
              >
                {[
                  ['Total Candidates', rows.length],
                  ['Present', presentCount],
                  ['Absent', absentCount],
                  ['Not Marked', rows.length - presentCount - absentCount],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    style={{
                      border: '0.3mm solid #24384f',
                      borderRadius: '1.2mm',
                      padding: '2mm',
                      textAlign: 'center',
                    }}
                  >
                    <p style={{ fontSize: '7pt', textTransform: 'uppercase', color: '#3a4a60', fontWeight: 700 }}>
                      {label}
                    </p>
                    <p style={{ fontSize: '12pt', fontWeight: 700, color: '#0f2547' }}>{value}</p>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '12mm' }}>
                <SignatureRow
                  signatures={[
                    { label: 'Invigilator Signature', name: null },
                    {
                      label: 'Examination Controller',
                      name: academy.examControllerName,
                      imagePath: academy.examControllerSign,
                    },
                  ]}
                />
              </div>
            </>
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
