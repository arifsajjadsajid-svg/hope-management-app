import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAcademySettings } from '@/lib/settings';
import { verificationQr } from '@/lib/qr';
import { Letterhead, DocumentFooter } from '@/components/brand/letterhead';
import { PrintToolbar } from '../print-toolbar';
import {
  EXAM_TYPE_LABELS,
  RESULT_STATUS_LABELS,
  MARK_SPECIAL_LABELS,
} from '@/lib/constants';
import { formatDate, formatMarks, formatPercent, ordinal } from '@/lib/utils';

export const metadata: Metadata = { title: 'Report Card' };
export const dynamic = 'force-dynamic';

/** Photograph box matching the roll number slip. */
function PhotoBox({ photoPath }: { photoPath: string | null }) {
  return (
    <div
      style={{
        width: '24mm',
        height: '29mm',
        border: '0.4mm solid #24384f',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: '#ffffff',
        flexShrink: 0,
      }}
    >
      {photoPath ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoPath} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ fontSize: '6.5pt', color: '#7c8ca3', textAlign: 'center', lineHeight: 1.4 }}>
          Student
          <br />
          Photograph
        </span>
      )}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '1.5mm', alignItems: 'baseline' }}>
      <span style={{ fontSize: '8pt', color: '#3a4a60', width: '26mm', flexShrink: 0, fontWeight: 600 }}>
        {label}
      </span>
      <span
        style={{
          fontSize: '9pt',
          fontWeight: 700,
          color: '#0f2547',
          flex: 1,
          borderBottom: '0.2mm dotted #93a3b8',
          paddingBottom: '0.3mm',
        }}
      >
        {value ?? '—'}
      </span>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  PASS: '#047857',
  FAIL: '#be123c',
  COMPARTMENT: '#b45309',
  ABSENT: '#475569',
  WITHHELD: '#6d28d9',
};

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
    include: {
      student: true,
      enrollment: {
        include: {
          schoolClass: { select: { name: true, displayOrder: true } },
          section: { select: { name: true, classTeacher: { select: { fullName: true } } } },
        },
      },
      subjects: { orderBy: { displayOrder: 'asc' } },
    },
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

      {cards.map(({ result, rollNumber, qr }) => {
        const counted = result.subjects.filter((s) => s.status !== 'EXEMPTED');
        const attendancePercent =
          result.attendanceTotal > 0
            ? (result.attendancePresent / result.attendanceTotal) * 100
            : null;

        return (
          <section key={result.id} className="sheet sheet-a4">
            <Letterhead
              academy={academy}
              documentTitle="Student Report Card"
              subtitle={`${exam.name} — ${EXAM_TYPE_LABELS[exam.type] ?? exam.type}`}
            />

            {/* -------------------------------------------- student block */}
            <div
              style={{
                marginTop: '4mm',
                display: 'flex',
                gap: '4mm',
                border: '0.4mm solid #24384f',
                borderRadius: '1.5mm',
                padding: '3mm',
                background: '#f8fafc',
              }}
            >
              <PhotoBox photoPath={result.student.photoPath} />

              <div
                style={{
                  flex: 1,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1.6mm 5mm',
                  alignContent: 'center',
                }}
              >
                <InfoCell label="Student Name" value={result.student.fullName} />
                <InfoCell label="Roll Number" value={rollNumber} />
                <InfoCell label="Father Name" value={result.student.fatherName} />
                <InfoCell label="Admission No." value={result.student.admissionNumber} />
                <InfoCell label="Class" value={result.enrollment.schoolClass.name} />
                <InfoCell label="Section" value={result.enrollment.section.name} />
                <InfoCell label="Session" value={exam.session.name} />
                <InfoCell label="Examination" value={exam.name} />
              </div>

              <div style={{ width: '22mm', textAlign: 'center', flexShrink: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="Verification QR code" style={{ width: '100%', height: 'auto' }} />
                <p style={{ fontSize: '5.5pt', color: '#3a4a60', marginTop: '0.8mm', lineHeight: 1.3 }}>
                  Scan to verify
                </p>
              </div>
            </div>

            {/* ------------------------------------------------- subjects */}
            <table className="doc-table" style={{ marginTop: '4mm' }}>
              <thead>
                <tr>
                  <th style={{ width: '7%' }} className="num">
                    Sr.
                  </th>
                  <th>Subject</th>
                  <th style={{ width: '11%' }} className="num">
                    Max Marks
                  </th>
                  <th style={{ width: '11%' }} className="num">
                    Passing
                  </th>
                  <th style={{ width: '11%' }} className="num">
                    Obtained
                  </th>
                  <th style={{ width: '11%' }} className="num">
                    Percentage
                  </th>
                  <th style={{ width: '9%' }} className="num">
                    Grade
                  </th>
                  <th style={{ width: '11%' }} className="num">
                    Position
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.subjects.map((subject, index) => {
                  const special = subject.specialStatus !== 'NONE';
                  return (
                    <tr key={subject.id}>
                      <td className="num">{index + 1}</td>
                      <td>
                        <strong>{subject.subjectName}</strong>
                        <span style={{ color: '#3a4a60' }}> ({subject.subjectCode})</span>
                        {subject.graceApplied > 0 && (
                          <span style={{ color: '#b45309', fontSize: '8pt' }}>
                            {' '}
                            · grace {formatMarks(subject.graceApplied)}
                          </span>
                        )}
                      </td>
                      <td className="num">{formatMarks(subject.maxMarks)}</td>
                      <td className="num">{formatMarks(subject.passingMarks)}</td>
                      <td className="num" style={{ fontWeight: 700 }}>
                        {special ? subject.specialStatus : formatMarks(subject.obtainedMarks)}
                      </td>
                      <td className="num">
                        {special ? '—' : formatPercent(subject.percentage, 1)}
                      </td>
                      <td className="num" style={{ fontWeight: 700 }}>
                        {subject.grade}
                      </td>
                      <td className="num">
                        {subject.classPosition ? ordinal(subject.classPosition) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#0f2547', color: '#ffffff', fontWeight: 700 }}>
                  <td colSpan={2} style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Total
                  </td>
                  <td className="num">{formatMarks(result.totalMaxMarks)}</td>
                  <td className="num">—</td>
                  <td className="num">{formatMarks(result.totalObtained)}</td>
                  <td className="num">{formatPercent(result.percentage)}</td>
                  <td className="num">{result.grade}</td>
                  <td className="num">
                    {result.classPosition ? ordinal(result.classPosition) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* -------------------------------------------------- summary */}
            <div
              style={{
                marginTop: '4mm',
                display: 'grid',
                gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                gap: '2mm',
              }}
            >
              {[
                { label: 'Total Marks', value: formatMarks(result.totalMaxMarks) },
                { label: 'Obtained', value: formatMarks(result.totalObtained) },
                { label: 'Percentage', value: formatPercent(result.percentage) },
                { label: 'Grade', value: result.grade },
                {
                  label: 'Class Position',
                  value: result.classPosition ? ordinal(result.classPosition) : '—',
                },
                {
                  label: 'Section Position',
                  value: result.sectionPosition ? ordinal(result.sectionPosition) : '—',
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    border: '0.3mm solid #24384f',
                    borderRadius: '1.2mm',
                    padding: '2mm 1.5mm',
                    textAlign: 'center',
                    background: '#f4f6fa',
                  }}
                >
                  <p
                    style={{
                      fontSize: '6.5pt',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: '#3a4a60',
                      fontWeight: 700,
                    }}
                  >
                    {item.label}
                  </p>
                  <p
                    style={{
                      fontSize: '11pt',
                      fontWeight: 700,
                      color: '#0f2547',
                      marginTop: '0.6mm',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: '3mm',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '2mm',
                fontSize: '9pt',
              }}
            >
              <div
                style={{
                  border: '0.3mm solid #24384f',
                  borderRadius: '1.2mm',
                  padding: '2mm 3mm',
                }}
              >
                <strong>Attendance:</strong>{' '}
                {result.attendanceTotal > 0
                  ? `${result.attendancePresent} / ${result.attendanceTotal} papers${
                      attendancePercent !== null ? ` (${attendancePercent.toFixed(0)}%)` : ''
                    }`
                  : 'Not recorded'}
              </div>
              <div
                style={{
                  border: '0.3mm solid #24384f',
                  borderRadius: '1.2mm',
                  padding: '2mm 3mm',
                }}
              >
                <strong>Papers:</strong> {result.papersAttended} of {result.papersTotal} attempted
                {result.subjectsFailed > 0 && ` · ${result.subjectsFailed} below pass`}
              </div>
              <div
                style={{
                  border: '0.4mm solid ' + (STATUS_COLOR[result.status] ?? '#24384f'),
                  borderRadius: '1.2mm',
                  padding: '2mm 3mm',
                  textAlign: 'center',
                  color: STATUS_COLOR[result.status] ?? '#0f2547',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Result: {RESULT_STATUS_LABELS[result.status] ?? result.status}
                {result.promotionStatus && (
                  <span style={{ display: 'block', fontSize: '7.5pt', fontWeight: 600 }}>
                    {result.promotionStatus === 'PROMOTED' ? 'Promoted' : 'Not Promoted'}
                  </span>
                )}
              </div>
            </div>

            {/* -------------------------------------------------- remarks */}
            <div
              style={{
                marginTop: '3mm',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '3mm',
              }}
            >
              {[
                { label: 'Class Teacher Remarks', value: result.teacherRemarks },
                { label: 'Principal Remarks', value: result.principalRemarks },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    border: '0.3mm solid #24384f',
                    borderRadius: '1.2mm',
                    padding: '2mm 3mm',
                    minHeight: '14mm',
                  }}
                >
                  <p
                    style={{
                      fontSize: '7pt',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: '#3a4a60',
                      fontWeight: 700,
                    }}
                  >
                    {item.label}
                  </p>
                  <p style={{ fontSize: '8.5pt', marginTop: '1mm', lineHeight: 1.5 }}>
                    {item.value ?? ''}
                  </p>
                </div>
              ))}
            </div>

            {/* ----------------------------------------------- signatures */}
            <div
              className="avoid-break"
              style={{
                marginTop: '10mm',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: '4mm',
              }}
            >
              {[
                { label: 'Parent / Guardian', name: null, image: null },
                {
                  label: 'Class Teacher',
                  name: result.enrollment.section.classTeacher?.fullName ?? null,
                  image: null,
                },
                {
                  label: 'Examination Controller',
                  name: academy.examControllerName,
                  image: academy.examControllerSign,
                },
                {
                  label: 'Principal / Director',
                  name: academy.principalName ?? academy.directorName,
                  image: academy.principalSignPath ?? academy.directorSignPath,
                },
              ].map((sig) => (
                <div key={sig.label} style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      height: '10mm',
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'center',
                    }}
                  >
                    {sig.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={sig.image}
                        alt=""
                        style={{ maxHeight: '10mm', maxWidth: '100%', objectFit: 'contain' }}
                      />
                    ) : null}
                  </div>
                  <div className="sign-line">
                    {sig.name ? (
                      <>
                        <span style={{ display: 'block', fontSize: '8pt' }}>{sig.name}</span>
                        <span
                          style={{ display: 'block', fontSize: '7pt', fontWeight: 400, color: '#3a4a60' }}
                        >
                          {sig.label}
                        </span>
                      </>
                    ) : (
                      sig.label
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '5mm' }}>
              <DocumentFooter
                academy={academy}
                note={`Verification code ${result.verificationCode} — verify online at ${
                  process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
                }/verify · Issued ${formatDate(result.computedAt)}`}
              />
            </div>
          </section>
        );
      })}
    </>
  );
}
