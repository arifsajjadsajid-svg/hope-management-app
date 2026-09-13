import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAcademySettings } from '@/lib/settings';
import { getPositionHolders } from '@/server/queries/results';
import { AcademyMark } from '@/components/brand/crest';
import { PrintToolbar } from '../print-toolbar';
import { formatPercent } from '@/lib/utils';

export const metadata: Metadata = { title: 'Position Holders Poster' };
export const dynamic = 'force-dynamic';

/** Initials placeholder when a student has no photograph on file. */
function PosterPhoto({
  name,
  photoPath,
  size,
  ring,
}: {
  name: string;
  photoPath: string | null;
  size: string;
  ring: string;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        border: `1mm solid ${ring}`,
        background: '#e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {photoPath ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoPath} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span
          style={{
            fontFamily: 'Georgia, serif',
            fontWeight: 700,
            fontSize: `calc(${size} * 0.32)`,
            color: '#0f2547',
          }}
        >
          {initials}
        </span>
      )}
    </div>
  );
}

export default async function TopperPosterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('meritlists.view');
  const params = await searchParams;
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const examId = pick('examId');
  if (!examId) notFound();
  const top = Number(pick('top') ?? 10) || 10;

  const [academy, exam] = await Promise.all([
    getAcademySettings(),
    prisma.exam.findUnique({ where: { id: examId }, include: { session: true } }),
  ]);
  if (!exam) notFound();

  const holders = await getPositionHolders(examId, top);
  const podium = holders.overall.slice(0, 3);
  const rest = holders.overall.slice(3);

  if (podium.length === 0) {
    return (
      <>
        <PrintToolbar title="Position Holders Poster" subtitle={exam.name} />
        <div className="sheet sheet-a4 flex items-center justify-center">
          <p className="text-[11pt] text-slate-600">No position holders for this examination.</p>
        </div>
      </>
    );
  }

  const podiumOrder = [1, 0, 2]; // second, first, third — visual podium
  // Styling follows the visual slot; the label follows the student's true rank,
  // so tied students are both announced as first position.
  const podiumMeta = [
    { ring: '#c8a34a', size: '38mm' },
    { ring: '#94a3b8', size: '32mm' },
    { ring: '#b45309', size: '32mm' },
  ];

  const positionLabel = (position: number) =>
    position === 1
      ? 'First Position'
      : position === 2
        ? 'Second Position'
        : position === 3
          ? 'Third Position'
          : `Position ${position}`;

  return (
    <>
      <PrintToolbar
        title="Position Holders Poster"
        subtitle={`${exam.name} · top ${holders.overall.length}`}
      />

      <section
        className="sheet sheet-a4"
        style={{ background: 'linear-gradient(160deg,#0f2547 0%,#1e368a 55%,#16305c 100%)' }}
      >
        {/* ------------------------------------------------------- header */}
        <header style={{ textAlign: 'center', color: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <AcademyMark
              logoPath={academy.logoPath}
              monogram={academy.shortName}
              className="h-[26mm] w-auto"
            />
          </div>
          <h1
            className="doc-title"
            style={{
              fontSize: '22pt',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginTop: '3mm',
            }}
          >
            {academy.name}
          </h1>
          <p style={{ fontSize: '9.5pt', color: '#c5d7ec' }}>{academy.address}</p>
          <p style={{ fontSize: '9.5pt', color: '#c5d7ec' }}>{academy.contactLine}</p>

          <div
            style={{
              height: '1.6mm',
              margin: '4mm auto',
              width: '70mm',
              background: 'linear-gradient(90deg,#c8a34a,#e6cd8d,#c8a34a)',
              borderRadius: '1mm',
            }}
          />

          <h2
            className="doc-title"
            style={{
              fontSize: '17pt',
              fontWeight: 700,
              color: '#e6cd8d',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}
          >
            Position Holders
          </h2>
          <p style={{ fontSize: '11pt', marginTop: '1.5mm', fontWeight: 600 }}>{exam.name}</p>
          <p style={{ fontSize: '9pt', color: '#c5d7ec' }}>Session {exam.session.name}</p>
        </header>

        {/* ------------------------------------------------------- podium */}
        <div
          style={{
            marginTop: '8mm',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: '4mm',
            alignItems: 'end',
          }}
        >
          {podiumOrder.map((position) => {
            const row = podium[position];
            if (!row) return <div key={position} />;
            const meta = podiumMeta[position]!;

            return (
              <div
                key={row.id}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '0.3mm solid rgba(255,255,255,0.18)',
                  borderRadius: '3mm',
                  padding: position === 0 ? '6mm 3mm' : '4mm 3mm',
                  textAlign: 'center',
                  color: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <PosterPhoto
                    name={row.student.fullName}
                    photoPath={row.student.photoPath}
                    size={meta.size}
                    ring={meta.ring}
                  />
                </div>
                <p
                  style={{
                    marginTop: '2.5mm',
                    display: 'inline-block',
                    background: meta.ring,
                    color: position === 1 ? '#0f2547' : '#ffffff',
                    borderRadius: '10mm',
                    padding: '0.8mm 3.5mm',
                    fontSize: '7.5pt',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {positionLabel(row.overallPosition)}
                </p>
                <p
                  className="doc-title"
                  style={{ fontSize: position === 0 ? '13pt' : '11.5pt', fontWeight: 700, marginTop: '2mm' }}
                >
                  {row.student.fullName}
                </p>
                <p style={{ fontSize: '8pt', color: '#c5d7ec' }}>
                  S/O — D/O {row.student.fatherName}
                </p>
                <p style={{ fontSize: '8.5pt', color: '#e6cd8d', fontWeight: 600, marginTop: '1mm' }}>
                  {row.enrollment.schoolClass.name} — {row.enrollment.section.name}
                </p>
                <p style={{ fontSize: '7.5pt', color: '#98b8dc' }}>Roll No. {row.rollNumber}</p>
                <p
                  style={{
                    fontSize: position === 0 ? '19pt' : '16pt',
                    fontWeight: 700,
                    marginTop: '2.5mm',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatPercent(row.percentage)}
                </p>
                <p style={{ fontSize: '8pt', color: '#c5d7ec' }}>
                  {row.totalObtained} / {row.totalMaxMarks} · Grade {row.grade}
                </p>
              </div>
            );
          })}
        </div>

        {/* --------------------------------------------------- remainder */}
        {rest.length > 0 && (
          <div style={{ marginTop: '7mm' }}>
            <p
              style={{
                textAlign: 'center',
                color: '#e6cd8d',
                fontSize: '9.5pt',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: '2.5mm',
              }}
            >
              Remaining Merit Positions
            </p>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                color: '#ffffff',
                fontSize: '8.5pt',
              }}
            >
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.14)' }}>
                  <th style={{ padding: '2mm', textAlign: 'center', width: '12%' }}>Position</th>
                  <th style={{ padding: '2mm', textAlign: 'center', width: '16%' }}>Roll No.</th>
                  <th style={{ padding: '2mm', textAlign: 'left' }}>Student Name</th>
                  <th style={{ padding: '2mm', textAlign: 'left', width: '22%' }}>Class</th>
                  <th style={{ padding: '2mm', textAlign: 'center', width: '15%' }}>Percentage</th>
                </tr>
              </thead>
              <tbody>
                {rest.map((row, index) => (
                  <tr
                    key={row.id}
                    style={{
                      background: index % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '1.6mm 2mm', textAlign: 'center', fontWeight: 700 }}>
                      {row.overallPosition}
                    </td>
                    <td style={{ padding: '1.6mm 2mm', textAlign: 'center' }}>{row.rollNumber}</td>
                    <td style={{ padding: '1.6mm 2mm' }}>{row.student.fullName}</td>
                    <td style={{ padding: '1.6mm 2mm' }}>
                      {row.enrollment.schoolClass.name} — {row.enrollment.section.name}
                    </td>
                    <td
                      style={{
                        padding: '1.6mm 2mm',
                        textAlign: 'center',
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatPercent(row.percentage)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer
          style={{
            marginTop: '8mm',
            textAlign: 'center',
            color: '#98b8dc',
            fontSize: '7.5pt',
            borderTop: '0.3mm solid rgba(255,255,255,0.2)',
            paddingTop: '2.5mm',
          }}
        >
          <p style={{ fontWeight: 700, color: '#e6cd8d', letterSpacing: '0.06em' }}>
            CONGRATULATIONS TO OUR POSITION HOLDERS
          </p>
          <p style={{ marginTop: '1mm' }}>
            {academy.name} — {academy.address} — {academy.contactLine}
          </p>
        </footer>
      </section>
    </>
  );
}
