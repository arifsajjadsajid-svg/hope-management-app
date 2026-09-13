import * as React from 'react';
import type { AcademyProfile } from '@/lib/settings';
import { Letterhead } from '@/components/brand/letterhead';
import { formatDate, formatTime12, dayName } from '@/lib/utils';

export type SlipPaper = {
  subjectName: string;
  subjectCode: string;
  paperDate: Date;
  startTime: string;
  endTime: string;
  roomLabel: string | null;
};

export type SlipData = {
  studentId: string;
  rollNumber: string;
  studentName: string;
  fatherName: string;
  admissionNumber: string;
  photoPath: string | null;
  className: string;
  sectionName: string;
  sessionName: string;
  examName: string;
  examCenter: string;
  roomLabel: string | null;
  seatNumber: string | null;
  qrDataUrl: string;
  verificationCode: string;
  papers: SlipPaper[];
};

/** Photograph box, or a ruled placeholder when no photo is on file. */
function PhotoBox({ photoPath, size }: { photoPath: string | null; size: 'lg' | 'sm' }) {
  const dims = size === 'lg' ? { width: '25mm', height: '30mm' } : { width: '18mm', height: '22mm' };
  return (
    <div
      style={{
        ...dims,
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
        <img
          src={photoPath}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span
          style={{
            fontSize: size === 'lg' ? '7pt' : '6pt',
            color: '#7c8ca3',
            textAlign: 'center',
            lineHeight: 1.4,
            padding: '1mm',
          }}
        >
          Affix
          <br />
          Candidate
          <br />
          Photograph
        </span>
      )}
    </div>
  );
}

function DetailLine({
  label,
  value,
  size,
}: {
  label: string;
  value: React.ReactNode;
  size: 'lg' | 'sm';
}) {
  return (
    <div style={{ display: 'flex', gap: '2mm', alignItems: 'baseline' }}>
      <span
        style={{
          fontSize: size === 'lg' ? '8.5pt' : '7pt',
          color: '#3a4a60',
          width: size === 'lg' ? '28mm' : '22mm',
          flexShrink: 0,
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: size === 'lg' ? '9.5pt' : '7.5pt',
          fontWeight: 700,
          color: '#0f2547',
          borderBottom: '0.2mm dotted #93a3b8',
          flex: 1,
          paddingBottom: '0.4mm',
        }}
      >
        {value ?? '—'}
      </span>
    </div>
  );
}

/**
 * One examination roll number slip. `size` controls the layout density so the
 * same component serves the one, two and four-per-page arrangements.
 */
export function RollSlip({
  academy,
  slip,
  size,
  showDateSheet,
}: {
  academy: AcademyProfile;
  slip: SlipData;
  size: 'lg' | 'sm';
  showDateSheet: boolean;
}) {
  const large = size === 'lg';

  return (
    <div
      className="avoid-break"
      style={{
        border: '0.5mm solid #0f2547',
        borderRadius: '2mm',
        padding: large ? '5mm' : '3.5mm',
        background: '#ffffff',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Letterhead academy={academy} size={large ? 'full' : 'compact'} />

      <div
        style={{
          marginTop: large ? '3mm' : '2mm',
          textAlign: 'center',
          background: '#0f2547',
          color: '#e6cd8d',
          borderRadius: '1.2mm',
          padding: large ? '1.6mm 4mm' : '1mm 3mm',
          fontFamily: 'Georgia, serif',
          fontWeight: 700,
          letterSpacing: '0.08em',
          fontSize: large ? '11pt' : '8pt',
          textTransform: 'uppercase',
        }}
      >
        Roll Number Slip
      </div>

      <p
        style={{
          textAlign: 'center',
          marginTop: large ? '1.5mm' : '1mm',
          fontSize: large ? '10pt' : '7.5pt',
          fontWeight: 700,
          color: '#0f2547',
        }}
      >
        {slip.examName}
      </p>

      {/* ------------------------------------------------ identity block */}
      <div
        style={{
          display: 'flex',
          gap: large ? '4mm' : '3mm',
          marginTop: large ? '3.5mm' : '2.5mm',
          alignItems: 'flex-start',
        }}
      >
        <PhotoBox photoPath={slip.photoPath} size={size} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: large ? '1.8mm' : '1.1mm' }}>
          <DetailLine label="Roll Number" value={slip.rollNumber} size={size} />
          <DetailLine label="Student Name" value={slip.studentName} size={size} />
          <DetailLine label="Father Name" value={slip.fatherName} size={size} />
          <DetailLine label="Admission No." value={slip.admissionNumber} size={size} />
          <DetailLine
            label="Class / Section"
            value={`${slip.className} — ${slip.sectionName}`}
            size={size}
          />
          <DetailLine label="Session" value={slip.sessionName} size={size} />
        </div>

        <div
          style={{
            width: large ? '26mm' : '18mm',
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slip.qrDataUrl}
            alt="Verification QR code"
            style={{ width: '100%', height: 'auto' }}
          />
          <p
            style={{
              fontSize: large ? '6pt' : '5pt',
              color: '#3a4a60',
              marginTop: '0.8mm',
              lineHeight: 1.3,
              wordBreak: 'break-all',
            }}
          >
            {slip.verificationCode}
          </p>
        </div>
      </div>

      {/* ------------------------------------------------- centre & seat */}
      <div
        style={{
          marginTop: large ? '3mm' : '2mm',
          border: '0.3mm solid #24384f',
          borderRadius: '1.2mm',
          background: '#f4f6fa',
          padding: large ? '2.5mm 3mm' : '1.6mm 2mm',
          display: 'grid',
          gridTemplateColumns: '1fr auto auto',
          gap: large ? '3mm' : '2mm',
          fontSize: large ? '8.5pt' : '6.5pt',
        }}
      >
        <span>
          <strong>Centre:</strong> {slip.examCenter}
        </span>
        <span>
          <strong>Room:</strong> {slip.roomLabel ?? '—'}
        </span>
        <span>
          <strong>Seat:</strong> {slip.seatNumber ?? '—'}
        </span>
      </div>

      {/* ----------------------------------------------------- date sheet */}
      {showDateSheet && slip.papers.length > 0 && (
        <div style={{ marginTop: large ? '3mm' : '2mm' }}>
          <p
            style={{
              fontSize: large ? '8.5pt' : '6.5pt',
              fontWeight: 700,
              color: '#0f2547',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '1mm',
            }}
          >
            Date Sheet
          </p>
          <table className="doc-table" style={{ fontSize: large ? '8.5pt' : '6.5pt' }}>
            <thead>
              <tr>
                <th style={{ padding: large ? '2mm' : '1.1mm', fontSize: large ? '8pt' : '6pt' }}>
                  Date
                </th>
                <th style={{ padding: large ? '2mm' : '1.1mm', fontSize: large ? '8pt' : '6pt' }}>
                  Day
                </th>
                <th style={{ padding: large ? '2mm' : '1.1mm', fontSize: large ? '8pt' : '6pt' }}>
                  Subject
                </th>
                <th style={{ padding: large ? '2mm' : '1.1mm', fontSize: large ? '8pt' : '6pt' }}>
                  Timing
                </th>
              </tr>
            </thead>
            <tbody>
              {slip.papers.map((paper, index) => (
                <tr key={index}>
                  <td className="num" style={{ padding: large ? '1.8mm' : '1mm' }}>
                    {formatDate(paper.paperDate)}
                  </td>
                  <td style={{ padding: large ? '1.8mm' : '1mm' }}>{dayName(paper.paperDate)}</td>
                  <td style={{ padding: large ? '1.8mm' : '1mm' }}>{paper.subjectName}</td>
                  <td className="num" style={{ padding: large ? '1.8mm' : '1mm' }}>
                    {formatTime12(paper.startTime)} – {formatTime12(paper.endTime)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* --------------------------------------------------- instructions */}
      {large && (
        <div style={{ marginTop: '3mm' }}>
          <p
            style={{
              fontSize: '8.5pt',
              fontWeight: 700,
              color: '#0f2547',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Instructions
          </p>
          <ol
            style={{
              fontSize: '7.5pt',
              lineHeight: 1.6,
              paddingLeft: '5mm',
              marginTop: '1mm',
              listStyleType: 'decimal',
            }}
          >
            <li>This slip must be produced at every paper; entry is refused without it.</li>
            <li>Be seated 15 minutes before the paper begins.</li>
            <li>Mobile phones, smart watches and unfair means are strictly prohibited.</li>
            <li>Bring your own stationery. Nothing may be borrowed inside the hall.</li>
            <li>Follow every instruction of the invigilator and the Examination Controller.</li>
          </ol>
        </div>
      )}

      {/* ----------------------------------------------------- signatures */}
      <div style={{ marginTop: 'auto', paddingTop: large ? '8mm' : '4mm' }}>
        <div
          className="avoid-break"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: large ? '5mm' : '3mm',
          }}
        >
          {[
            { label: 'Candidate Signature', name: null },
            {
              label: 'Examination Controller',
              name: large ? academy.examControllerName : null,
            },
            {
              label: 'Principal / Director',
              name: large ? (academy.principalName ?? academy.directorName) : null,
            },
          ].map((sig) => (
            <div key={sig.label} style={{ textAlign: 'center' }}>
              <div style={{ height: large ? '8mm' : '4mm' }} />
              <div
                style={{
                  borderTop: '0.3mm solid #24384f',
                  paddingTop: '1mm',
                  fontSize: large ? '7.5pt' : '5.5pt',
                  fontWeight: 600,
                  color: '#0f2547',
                }}
              >
                {sig.name ? (
                  <>
                    <span style={{ display: 'block' }}>{sig.name}</span>
                    <span style={{ display: 'block', fontWeight: 400, color: '#3a4a60' }}>
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

        <p
          style={{
            marginTop: large ? '3mm' : '1.5mm',
            textAlign: 'center',
            fontSize: large ? '6.5pt' : '5pt',
            color: '#3a4a60',
            borderTop: '0.2mm solid #cbd5e1',
            paddingTop: '1mm',
          }}
        >
          {academy.name} — {academy.address} — {academy.contactLine}
        </p>
      </div>
    </div>
  );
}
