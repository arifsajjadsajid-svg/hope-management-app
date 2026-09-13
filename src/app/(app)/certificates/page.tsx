import type { Metadata } from 'next';
import Link from 'next/link';
import { Medal, Printer } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { PageHeader } from '@/components/layout/page-header';
import { Card, EmptyState, LinkButton, Badge } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { StatCard } from '@/components/ui/stat-card';
import {
  IssueCertificateDialog,
  AutoIssueDialog,
  RevokeCertificateButton,
} from './certificate-clients';
import { CERTIFICATE_TYPES, CERTIFICATE_TYPE_LABELS } from '@/lib/constants';
import { formatDate, toISODateInput } from '@/lib/utils';

export const metadata: Metadata = { title: 'Certificates' };
export const dynamic = 'force-dynamic';

const TYPE_TONE: Record<string, string> = {
  FIRST_POSITION: 'bg-gold-gradient text-navy-950 ring-gold-500',
  SECOND_POSITION: 'bg-slate-200 text-navy-800 ring-slate-300',
  THIRD_POSITION: 'bg-amber-100 text-amber-900 ring-amber-300',
  ACADEMIC_EXCELLENCE: 'bg-royal-50 text-royal-700 ring-royal-200',
  SUBJECT_TOPPER: 'bg-teal-50 text-teal-700 ring-teal-200',
  MOST_IMPROVED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  OUTSTANDING: 'bg-purple-50 text-purple-700 ring-purple-200',
  PERFECT_ATTENDANCE: 'bg-slate-100 text-slate-700 ring-slate-200',
};

export default async function CertificatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('certificates.view');
  const canIssue = userCan(user, 'certificates.issue');
  const params = await searchParams;
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const session = await getCurrentSession();

  const [exams, certificates, students] = await Promise.all([
    prisma.exam.findMany({
      where: { results: { some: {} } },
      orderBy: { startDate: 'desc' },
      select: { id: true, name: true },
    }),
    prisma.certificate.findMany({
      where: {
        ...(pick('examId') ? { examId: pick('examId') } : {}),
        ...(pick('type') ? { type: pick('type') } : {}),
        ...(pick('q')
          ? {
              OR: [
                { student: { fullName: { contains: pick('q')! } } },
                { title: { contains: pick('q')! } },
                { verificationCode: { contains: pick('q')!.toUpperCase() } },
              ],
            }
          : {}),
      },
      include: {
        student: { select: { id: true, fullName: true, fatherName: true, admissionNumber: true } },
        exam: { select: { name: true } },
        issuedBy: { select: { fullName: true } },
      },
      orderBy: [{ issuedDate: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    }),
    prisma.enrollment.findMany({
      where: { ...(session ? { sessionId: session.id } : {}), student: { status: 'ACTIVE' } },
      include: {
        student: { select: { id: true, fullName: true, admissionNumber: true } },
        schoolClass: { select: { name: true } },
        section: { select: { name: true } },
      },
      orderBy: [{ schoolClass: { displayOrder: 'asc' } }, { rollNumber: 'asc' }],
      take: 800,
    }),
  ]);

  const byType = new Map<string, number>();
  for (const certificate of certificates) {
    byType.set(certificate.type, (byType.get(certificate.type) ?? 0) + 1);
  }

  const printQuery = new URLSearchParams();
  if (pick('examId')) printQuery.set('examId', pick('examId')!);
  if (pick('type')) printQuery.set('type', pick('type')!);

  return (
    <>
      <PageHeader
        title="Certificates"
        description="Branded, QR-verifiable award certificates for position holders, subject toppers and special recognition."
        breadcrumbs={[{ label: 'Certificates' }]}
        actions={
          <>
            {certificates.length > 0 && (
              <LinkButton
                href={`/print/certificate?${printQuery.toString()}`}
                variant="outline"
                size="sm"
                newTab
              >
                <Printer className="h-4 w-4" />
                Print {certificates.length}
              </LinkButton>
            )}
            {canIssue && (
              <>
                <AutoIssueDialog
                  exams={exams}
                  defaultExamId={pick('examId') ?? exams[0]?.id}
                />
                <IssueCertificateDialog
                  exams={exams}
                  defaultExamId={pick('examId')}
                  today={toISODateInput(new Date())}
                  students={students.map((e) => ({
                    id: e.studentId,
                    label: `${e.student.fullName} — ${e.schoolClass.name} ${e.section.name} (${e.student.admissionNumber})`,
                  }))}
                />
              </>
            )}
          </>
        }
      />

      <section className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatCard label="Total Issued" value={certificates.length} tone="navy" />
        <StatCard
          label="Position Awards"
          value={
            (byType.get('FIRST_POSITION') ?? 0) +
            (byType.get('SECOND_POSITION') ?? 0) +
            (byType.get('THIRD_POSITION') ?? 0)
          }
          tone="gold"
        />
        <StatCard label="Subject Toppers" value={byType.get('SUBJECT_TOPPER') ?? 0} tone="royal" />
        <StatCard
          label="Other Awards"
          value={
            certificates.length -
            ((byType.get('FIRST_POSITION') ?? 0) +
              (byType.get('SECOND_POSITION') ?? 0) +
              (byType.get('THIRD_POSITION') ?? 0) +
              (byType.get('SUBJECT_TOPPER') ?? 0))
          }
          tone="emerald"
        />
      </section>

      <Card>
        <FilterBar
          fields={[
            { type: 'search', name: 'q', placeholder: 'Student, title or verification code…' },
            {
              type: 'select',
              name: 'examId',
              label: 'Examination',
              className: 'min-w-[220px]',
              options: [
                { value: '', label: 'All examinations' },
                ...exams.map((e) => ({ value: e.id, label: e.name })),
              ],
            },
            {
              type: 'select',
              name: 'type',
              label: 'Certificate Type',
              className: 'w-[220px]',
              options: [
                { value: '', label: 'All types' },
                ...CERTIFICATE_TYPES.map((t) => ({ value: t, label: CERTIFICATE_TYPE_LABELS[t]! })),
              ],
            },
          ]}
        />

        {certificates.length === 0 ? (
          <EmptyState
            icon={<Medal className="h-6 w-6" />}
            title="No certificates issued"
            description="Use Auto-issue to generate position and subject topper certificates from a processed result, or issue one individually."
            action={
              canIssue && (
                <AutoIssueDialog exams={exams} defaultExamId={exams[0]?.id} />
              )
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Certificate</Th>
                  <Th>Student</Th>
                  <Th>Father Name</Th>
                  <Th>Class</Th>
                  <Th>Examination</Th>
                  <Th>Issued</Th>
                  <Th>Verification Code</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {certificates.map((certificate) => (
                  <tr key={certificate.id}>
                    <Td>
                      <span className="block font-semibold text-navy-900">{certificate.title}</span>
                      <Badge
                        className="mt-1"
                        tone={TYPE_TONE[certificate.type] ?? 'bg-slate-100 text-slate-700 ring-slate-200'}
                      >
                        {CERTIFICATE_TYPE_LABELS[certificate.type] ?? certificate.type}
                      </Badge>
                    </Td>
                    <Td>
                      <Link
                        href={`/students/${certificate.student.id}`}
                        className="font-semibold text-navy-900 hover:text-royal-700"
                      >
                        {certificate.student.fullName}
                      </Link>
                      <span className="block text-[11.5px] text-slate-500 tabular">
                        {certificate.student.admissionNumber}
                      </span>
                    </Td>
                    <Td className="text-slate-700">{certificate.student.fatherName}</Td>
                    <Td className="whitespace-nowrap text-slate-700">
                      {certificate.className ?? '—'}
                      {certificate.sessionName && (
                        <span className="block text-[11.5px] text-slate-500 tabular">
                          {certificate.sessionName}
                        </span>
                      )}
                    </Td>
                    <Td className="text-slate-700">{certificate.exam?.name ?? '—'}</Td>
                    <Td className="whitespace-nowrap text-[12.5px] text-slate-600 tabular">
                      {formatDate(certificate.issuedDate)}
                      {certificate.issuedBy && (
                        <span className="block text-[11px] text-slate-400">
                          by {certificate.issuedBy.fullName}
                        </span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap font-mono text-[11.5px] text-slate-600">
                      {certificate.verificationCode}
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-1.5">
                        <a
                          href={`/print/certificate?id=${certificate.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[12.5px] font-semibold text-royal-700 hover:underline"
                        >
                          Print
                        </a>
                        {canIssue && (
                          <RevokeCertificateButton
                            id={certificate.id}
                            title={certificate.title}
                          />
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
