import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAcademySettings } from '@/lib/settings';
import { verificationQr } from '@/lib/qr';
import { AcademyMark } from '@/components/brand/crest';
import { PrintToolbar } from '../print-toolbar';
import { CERTIFICATE_TYPE_LABELS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Certificate' };
export const dynamic = 'force-dynamic';

export default async function CertificatePrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('certificates.view');
  const params = await searchParams;
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const certificateId = pick('id');
  const examId = pick('examId');
  const type = pick('type');

  const academy = await getAcademySettings();

  const certificates = await prisma.certificate.findMany({
    where: {
      ...(certificateId ? { id: certificateId } : {}),
      ...(examId ? { examId } : {}),
      ...(type ? { type } : {}),
    },
    include: {
      student: { select: { fullName: true, fatherName: true, admissionNumber: true } },
      exam: { select: { name: true, session: { select: { name: true } } } },
    },
    orderBy: [{ issuedDate: 'desc' }, { title: 'asc' }],
  });

  if (certificates.length === 0) notFound();

  const withQr = await Promise.all(
    certificates.map(async (certificate) => ({
      certificate,
      qr: await verificationQr(certificate.verificationCode, 120),
    })),
  );

  return (
    <>
      <PrintToolbar
        title="Certificates"
        subtitle={`${certificates.length} certificate(s)`}
        landscape
        hint='Use your browser print dialog, choose "Save as PDF", set paper to A4 landscape, margins to None and enable background graphics.'
      />

      {withQr.map(({ certificate, qr }) => (
        <section
          key={certificate.id}
          className="sheet sheet-a4-landscape"
          style={{ position: 'relative', background: '#fffdf7' }}
        >
          {/* Ornamental double border */}
          <div
            style={{
              position: 'absolute',
              inset: '6mm',
              border: '1.2mm solid #0f2547',
              borderRadius: '2mm',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: '8.5mm',
              border: '0.4mm solid #c8a34a',
              borderRadius: '1.5mm',
              pointerEvents: 'none',
            }}
          />

          <div
            style={{
              position: 'relative',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              padding: '6mm 14mm 4mm',
            }}
          >
            <AcademyMark
              logoPath={academy.logoPath}
              monogram={academy.shortName}
              className="h-[22mm] w-auto"
            />

            <h1
              className="doc-title"
              style={{
                fontSize: '20pt',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#0f2547',
                marginTop: '2.5mm',
              }}
            >
              {academy.name}
            </h1>
            <p style={{ fontSize: '9pt', color: '#3a4a60' }}>{academy.address}</p>
            <p style={{ fontSize: '9pt', color: '#3a4a60' }}>{academy.contactLine}</p>

            <div
              style={{
                height: '1.4mm',
                width: '80mm',
                margin: '3.5mm 0',
                background: 'linear-gradient(90deg,#c8a34a,#e6cd8d,#c8a34a)',
                borderRadius: '1mm',
              }}
            />

            <h2
              className="doc-title"
              style={{
                fontSize: '24pt',
                fontWeight: 700,
                color: '#0f2547',
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
              }}
            >
              {certificate.title}
            </h2>
            <p
              style={{
                fontSize: '9.5pt',
                color: '#a97f34',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginTop: '1mm',
              }}
            >
              {CERTIFICATE_TYPE_LABELS[certificate.type] ?? certificate.type}
            </p>

            <p style={{ fontSize: '11pt', color: '#24384f', marginTop: '6mm' }}>
              This certificate is proudly presented to
            </p>

            <p
              className="doc-title"
              style={{
                fontSize: '26pt',
                fontWeight: 700,
                color: '#1e368a',
                marginTop: '2mm',
                borderBottom: '0.4mm solid #c8a34a',
                paddingBottom: '1.5mm',
                minWidth: '120mm',
              }}
            >
              {certificate.student.fullName}
            </p>

            <p style={{ fontSize: '10pt', color: '#3a4a60', marginTop: '1.5mm' }}>
              S/O — D/O {certificate.student.fatherName} · Admission No.{' '}
              {certificate.student.admissionNumber}
            </p>

            <p
              style={{
                fontSize: '10.5pt',
                lineHeight: 1.7,
                color: '#24384f',
                marginTop: '4mm',
                maxWidth: '190mm',
              }}
            >
              {certificate.description ??
                `In recognition of outstanding academic achievement in ${
                  certificate.exam?.name ?? 'the examination'
                }.`}
            </p>

            <div
              style={{
                marginTop: '3mm',
                display: 'flex',
                gap: '10mm',
                fontSize: '9.5pt',
                color: '#0f2547',
                fontWeight: 600,
              }}
            >
              {certificate.className && <span>Class: {certificate.className}</span>}
              {certificate.sessionName && <span>Session: {certificate.sessionName}</span>}
              <span>Date: {formatDate(certificate.issuedDate)}</span>
            </div>

            {/* --------------------------------------------- signatures */}
            <div
              style={{
                marginTop: 'auto',
                width: '100%',
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr',
                gap: '10mm',
                alignItems: 'end',
                paddingTop: '8mm',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    height: '10mm',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                  }}
                >
                  {academy.examControllerSign ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={academy.examControllerSign}
                      alt=""
                      style={{ maxHeight: '10mm', objectFit: 'contain' }}
                    />
                  ) : null}
                </div>
                <div className="sign-line">
                  {academy.examControllerName ? (
                    <>
                      <span style={{ display: 'block', fontSize: '9pt' }}>
                        {academy.examControllerName}
                      </span>
                      <span
                        style={{ display: 'block', fontSize: '7.5pt', fontWeight: 400, color: '#3a4a60' }}
                      >
                        Examination Controller
                      </span>
                    </>
                  ) : (
                    'Examination Controller'
                  )}
                </div>
              </div>

              <div style={{ textAlign: 'center', width: '24mm' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="Verification QR code" style={{ width: '100%', height: 'auto' }} />
                <p style={{ fontSize: '6pt', color: '#3a4a60', marginTop: '0.8mm' }}>
                  {certificate.verificationCode}
                </p>
              </div>

              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    height: '10mm',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                  }}
                >
                  {academy.principalSignPath ?? academy.directorSignPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={(academy.principalSignPath ?? academy.directorSignPath)!}
                      alt=""
                      style={{ maxHeight: '10mm', objectFit: 'contain' }}
                    />
                  ) : null}
                </div>
                <div className="sign-line">
                  {academy.principalName ?? academy.directorName ? (
                    <>
                      <span style={{ display: 'block', fontSize: '9pt' }}>
                        {academy.principalName ?? academy.directorName}
                      </span>
                      <span
                        style={{ display: 'block', fontSize: '7.5pt', fontWeight: 400, color: '#3a4a60' }}
                      >
                        Principal / Director
                      </span>
                    </>
                  ) : (
                    'Principal / Director'
                  )}
                </div>
              </div>
            </div>

            <p style={{ fontSize: '7pt', color: '#7c8ca3', marginTop: '2.5mm' }}>
              Verify this certificate online using the QR code or code {certificate.verificationCode}.
            </p>
          </div>
        </section>
      ))}
    </>
  );
}
