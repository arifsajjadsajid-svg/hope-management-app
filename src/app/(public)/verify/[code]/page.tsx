import type { Metadata } from 'next';
import { ShieldCheck, ShieldX, FileText, Award, Medal, IdCard } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getAcademySettings } from '@/lib/settings';
import { normaliseCode } from '@/lib/verification';
import { Card, CardBody, Alert, Badge } from '@/components/ui/primitives';
import {
  CERTIFICATE_TYPE_LABELS,
  RESULT_STATUS_LABELS,
  EXAM_TYPE_LABELS,
} from '@/lib/constants';
import { formatDate, formatPercent, ordinal } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  return { title: `Verify ${normaliseCode(decodeURIComponent(code))}` };
}

type Verified =
  | {
      kind: 'REPORT_CARD';
      studentName: string;
      fatherName: string;
      className: string;
      sectionName: string;
      examName: string;
      examType: string;
      sessionName: string;
      percentage: number;
      grade: string;
      status: string;
      classPosition: number | null;
      issuedOn: Date;
      published: boolean;
    }
  | {
      kind: 'CERTIFICATE';
      studentName: string;
      fatherName: string;
      title: string;
      type: string;
      className: string | null;
      sessionName: string | null;
      examName: string | null;
      issuedOn: Date;
    }
  | {
      kind: 'ROLL_SLIP';
      studentName: string;
      fatherName: string;
      rollNumber: string;
      className: string;
      sectionName: string;
      examName: string;
      sessionName: string;
      issuedOn: Date;
    };

/**
 * Resolves a printed document's verification code. Report cards and
 * certificates carry stored codes; roll number slips are verified by the roll
 * number itself, prefixed with "RS-".
 */
async function verify(code: string): Promise<Verified | null> {
  const result = await prisma.result.findFirst({
    where: { verificationCode: code },
    include: {
      student: { select: { fullName: true, fatherName: true } },
      exam: { select: { name: true, type: true, session: { select: { name: true } } } },
      enrollment: {
        include: {
          schoolClass: { select: { name: true } },
          section: { select: { name: true } },
        },
      },
    },
  });

  if (result) {
    return {
      kind: 'REPORT_CARD',
      studentName: result.student.fullName,
      fatherName: result.student.fatherName,
      className: result.enrollment.schoolClass.name,
      sectionName: result.enrollment.section.name,
      examName: result.exam.name,
      examType: result.exam.type,
      sessionName: result.exam.session.name,
      percentage: result.percentage,
      grade: result.grade,
      status: result.status,
      classPosition: result.classPosition,
      issuedOn: result.computedAt,
      published: result.isPublished,
    };
  }

  const certificate = await prisma.certificate.findFirst({
    where: { verificationCode: code },
    include: {
      student: { select: { fullName: true, fatherName: true } },
      exam: { select: { name: true } },
    },
  });

  if (certificate) {
    return {
      kind: 'CERTIFICATE',
      studentName: certificate.student.fullName,
      fatherName: certificate.student.fatherName,
      title: certificate.title,
      type: certificate.type,
      className: certificate.className,
      sessionName: certificate.sessionName,
      examName: certificate.exam?.name ?? null,
      issuedOn: certificate.issuedDate,
    };
  }

  if (code.startsWith('RS-')) {
    const rollNumber = code.slice(3);
    const allocation = await prisma.rollNumberAllocation.findFirst({
      where: { rollNumber },
      include: {
        student: { select: { fullName: true, fatherName: true } },
        exam: { select: { name: true, session: { select: { name: true } } } },
        enrollment: {
          include: {
            schoolClass: { select: { name: true } },
            section: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (allocation) {
      return {
        kind: 'ROLL_SLIP',
        studentName: allocation.student.fullName,
        fatherName: allocation.student.fatherName,
        rollNumber: allocation.rollNumber,
        className: allocation.enrollment.schoolClass.name,
        sectionName: allocation.enrollment.section.name,
        examName: allocation.exam.name,
        sessionName: allocation.exam.session.name,
        issuedOn: allocation.createdAt,
      };
    }
  }

  return null;
}

const DOC_META = {
  REPORT_CARD: { label: 'Report Card', icon: Award },
  CERTIFICATE: { label: 'Certificate', icon: Medal },
  ROLL_SLIP: { label: 'Roll Number Slip', icon: IdCard },
} as const;

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const academy = await getAcademySettings();
  const { code: rawCode } = await params;
  const code = normaliseCode(decodeURIComponent(rawCode));
  const document = await verify(code);

  if (!document) {
    return (
      <>
        <div className="mb-6 text-center">
          <h1 className="doc-title text-2xl font-bold uppercase tracking-wide text-navy-900">
            Document Verification
          </h1>
        </div>

        <Card className="border-rose-300">
          <CardBody className="py-10 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <ShieldX className="h-8 w-8" />
            </span>
            <h2 className="mt-4 text-xl font-bold text-rose-800">Not verified</h2>
            <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-slate-600">
              No document issued by {academy.name} carries the code{' '}
              <strong className="font-mono text-navy-900">{code}</strong>.
            </p>
            <p className="mt-4 text-[13px] text-slate-500">
              If you believe this is an error, contact the academy office on {academy.contactLine}.
            </p>
          </CardBody>
        </Card>
      </>
    );
  }

  const meta = DOC_META[document.kind];
  const Icon = meta.icon;

  const rows: [string, React.ReactNode][] =
    document.kind === 'REPORT_CARD'
      ? [
          ['Student Name', document.studentName],
          ['Father Name', document.fatherName],
          ['Document Type', 'Report Card'],
          ['Examination', document.examName],
          ['Examination Type', EXAM_TYPE_LABELS[document.examType] ?? document.examType],
          ['Class', `${document.className} — ${document.sectionName}`],
          ['Academic Session', document.sessionName],
          ['Percentage', formatPercent(document.percentage)],
          ['Grade', document.grade],
          ['Result', RESULT_STATUS_LABELS[document.status] ?? document.status],
          ['Class Position', document.classPosition ? ordinal(document.classPosition) : '—'],
          ['Issued On', formatDate(document.issuedOn)],
        ]
      : document.kind === 'CERTIFICATE'
        ? [
            ['Student Name', document.studentName],
            ['Father Name', document.fatherName],
            ['Document Type', 'Certificate'],
            ['Award', document.title],
            ['Category', CERTIFICATE_TYPE_LABELS[document.type] ?? document.type],
            ['Examination', document.examName ?? '—'],
            ['Class', document.className ?? '—'],
            ['Academic Session', document.sessionName ?? '—'],
            ['Issued On', formatDate(document.issuedOn)],
          ]
        : [
            ['Student Name', document.studentName],
            ['Father Name', document.fatherName],
            ['Document Type', 'Roll Number Slip'],
            ['Roll Number', document.rollNumber],
            ['Examination', document.examName],
            ['Class', `${document.className} — ${document.sectionName}`],
            ['Academic Session', document.sessionName],
            ['Issued On', formatDate(document.issuedOn)],
          ];

  const unpublished = document.kind === 'REPORT_CARD' && !document.published;

  return (
    <>
      <div className="mb-6 text-center">
        <h1 className="doc-title text-2xl font-bold uppercase tracking-wide text-navy-900">
          Document Verification
        </h1>
        <p className="mt-2 text-[14px] text-slate-600">
          Official record held by {academy.name}
        </p>
      </div>

      <Card className={unpublished ? 'border-amber-300' : 'border-emerald-300'}>
        <div
          className={`px-5 py-6 text-center ${unpublished ? 'bg-amber-50' : 'bg-emerald-50'} sm:px-8`}
        >
          <span
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
              unpublished ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            <ShieldCheck className="h-8 w-8" />
          </span>
          <h2
            className={`mt-4 text-xl font-bold ${
              unpublished ? 'text-amber-800' : 'text-emerald-800'
            }`}
          >
            {unpublished ? 'Genuine — not yet published' : 'Verified as genuine'}
          </h2>
          <p className="mt-1.5 text-[13.5px] text-slate-600">
            This {meta.label.toLowerCase()} was issued by {academy.name}.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Badge tone="bg-navy-900 text-gold-300 ring-navy-800">
              <Icon className="h-3 w-3" />
              {meta.label}
            </Badge>
            <Badge tone="bg-white text-navy-800 ring-slate-300">
              <FileText className="h-3 w-3" />
              {code}
            </Badge>
          </div>
        </div>

        <CardBody>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                  {label}
                </dt>
                <dd className="mt-0.5 text-[14px] font-semibold text-navy-900">{value}</dd>
              </div>
            ))}
          </dl>
        </CardBody>

        <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-center text-[12.5px] text-slate-600 sm:px-8">
          <p>
            Verification performed on {formatDate(new Date())} against the official records of{' '}
            {academy.name}, {academy.address}.
          </p>
          <p className="mt-1 tabular">{academy.contactLine}</p>
        </div>
      </Card>

      {unpublished && (
        <Alert tone="warning" title="Result not yet published" className="mt-5">
          This report card exists in the academy records but its result has not been published to
          students and parents yet. Please contact the academy office for confirmation.
        </Alert>
      )}
    </>
  );
}
