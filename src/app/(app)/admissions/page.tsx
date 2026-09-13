import type { Metadata } from 'next';
import Link from 'next/link';
import { Inbox, Clock, UserCheck, ExternalLink } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAcademySettings, appBaseUrl } from '@/lib/settings';
import { normalisePhone } from '@/lib/phone';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, EmptyState, Alert, Badge } from '@/components/ui/primitives';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { StatCard } from '@/components/ui/stat-card';
import { formatDateTime, formatDate } from '@/lib/utils';
import {
  StatusControl,
  ConvertButton,
  DeleteEnquiryButton,
  ContactButton,
  type EnquiryRow,
} from './enquiry-clients';

export const metadata: Metadata = { title: 'Admission Enquiries' };
export const dynamic = 'force-dynamic';

const STATUS_STYLES: Record<string, { label: string; tone: string }> = {
  NEW: { label: 'New', tone: 'bg-royal-50 text-royal-700 ring-royal-200' },
  CONTACTED: { label: 'Contacted', tone: 'bg-amber-50 text-amber-700 ring-amber-200' },
  ADMITTED: { label: 'Admitted', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  DECLINED: { label: 'Declined', tone: 'bg-slate-100 text-slate-600 ring-slate-200' },
  SPAM: { label: 'Spam', tone: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

/** Suggests the next admission number by continuing the existing pattern. */
async function suggestAdmissionNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const latest = await prisma.student.findFirst({
    orderBy: { admissionNumber: 'desc' },
    select: { admissionNumber: true },
  });

  const trailing = latest?.admissionNumber.match(/^(.*?)(\d+)$/);
  if (trailing) {
    const [, prefix, digits] = trailing;
    return `${prefix}${String(Number(digits) + 1).padStart(digits!.length, '0')}`;
  }

  return `HSA-${year}-0001`;
}

export default async function AdmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requirePermission('admissions.view');
  const canManage = userCan(user, 'admissions.manage');
  const canCreateStudents = userCan(user, 'students.create');

  const { status: statusFilter } = await searchParams;
  const filter = statusFilter && STATUS_STYLES[statusFilter] ? statusFilter : undefined;

  const [academy, enquiries, counts, suggested] = await Promise.all([
    getAcademySettings(),
    prisma.admissionEnquiry.findMany({
      where: filter ? { status: filter } : { status: { not: 'SPAM' } },
      include: { handledBy: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.admissionEnquiry.groupBy({ by: ['status'], _count: { _all: true } }),
    suggestAdmissionNumber(),
  ]);

  const countFor = (status: string) =>
    counts.find((c) => c.status === status)?._count._all ?? 0;

  const rows: EnquiryRow[] = enquiries.map((e) => {
    const normalised = normalisePhone(e.whatsappNumber || e.contactPhone);
    return {
      id: e.id,
      reference: e.reference,
      studentName: e.studentName,
      fatherName: e.fatherName,
      classApplyingFor: e.classApplyingFor,
      gender: e.gender,
      contactPhone: e.contactPhone,
      whatsappNumber: e.whatsappNumber,
      email: e.email,
      address: e.address,
      previousSchool: e.previousSchool,
      message: e.message,
      status: e.status,
      officeNotes: e.officeNotes,
      createdAt: e.createdAt.toISOString(),
      handledByName: e.handledBy?.fullName ?? null,
      studentId: e.studentId,
      dialNumber: normalised.ok ? normalised.dialNumber : null,
    };
  });

  const publicUrl = `${appBaseUrl()}/admission`;

  return (
    <>
      <PageHeader
        title="Admission Enquiries"
        description="Families who applied through the public admission form on the academy website."
        breadcrumbs={[{ label: 'Admissions' }]}
        actions={
          <a
            href="/admission"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4" />
            View public form
          </a>
        }
      />

      <Alert tone="info" className="mb-5">
        The public form is at{' '}
        <Link href="/admission" className="font-semibold underline">
          {publicUrl}
        </Link>
        . Anyone may submit it without an account — share the address on your prospectus, signboard
        or Facebook page. Nothing submitted here becomes a student until your office presses
        <strong> Admit</strong>.
      </Alert>

      <section className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatCard
          label="Awaiting Contact"
          value={countFor('NEW')}
          tone={countFor('NEW') ? 'amber' : 'slate'}
          icon={<Clock className="h-[18px] w-[18px]" />}
        />
        <StatCard label="Contacted" value={countFor('CONTACTED')} tone="royal" />
        <StatCard
          label="Admitted"
          value={countFor('ADMITTED')}
          tone="emerald"
          icon={<UserCheck className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Declined"
          value={countFor('DECLINED')}
          tone="slate"
          hint={countFor('SPAM') ? `${countFor('SPAM')} filed as spam` : undefined}
        />
      </section>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <FilterTab label="Open" href="/admissions" active={!filter} />
        {(['NEW', 'CONTACTED', 'ADMITTED', 'DECLINED', 'SPAM'] as const).map((s) => (
          <FilterTab
            key={s}
            label={`${STATUS_STYLES[s]!.label} (${countFor(s)})`}
            href={`/admissions?status=${s}`}
            active={filter === s}
          />
        ))}
      </div>

      <Card>
        <CardHeader
          title={filter ? `${STATUS_STYLES[filter]!.label} enquiries` : 'Open enquiries'}
          description="Newest first"
        />
        {rows.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-6 w-6" />}
            title="No enquiries yet"
            description="When a parent fills in the public admission form, their enquiry appears here."
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Child</Th>
                  <Th>Class</Th>
                  <Th>Contact</Th>
                  <Th>Received</Th>
                  <Th>Status</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const style = STATUS_STYLES[row.status] ?? STATUS_STYLES.NEW!;
                  return (
                    <tr key={row.id}>
                      <Td className="whitespace-nowrap font-mono text-[12px] font-semibold text-navy-900">
                        {row.reference}
                      </Td>
                      <Td>
                        <span className="font-bold text-navy-900">{row.studentName}</span>
                        <span className="block text-[11.5px] text-slate-500">
                          c/o {row.fatherName}
                        </span>
                        {row.message && (
                          <span className="mt-0.5 block max-w-xs truncate text-[11.5px] italic text-slate-400">
                            “{row.message}”
                          </span>
                        )}
                      </Td>
                      <Td className="text-[12.5px] text-slate-700">{row.classApplyingFor}</Td>
                      <Td className="whitespace-nowrap text-[12.5px] text-slate-700 tabular">
                        {row.contactPhone}
                        {row.email && (
                          <span className="block text-[11.5px] text-slate-400">{row.email}</span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-[12px] text-slate-600 tabular">
                        {formatDateTime(new Date(row.createdAt))}
                        {row.handledByName && (
                          <span className="block text-[11px] text-slate-400">
                            {row.handledByName}
                          </span>
                        )}
                      </Td>
                      <Td>
                        <Badge tone={style.tone}>{style.label}</Badge>
                      </Td>
                      <Td align="right">
                        <div className="flex items-center justify-end gap-1.5">
                          <ContactButton row={row} academyName={academy.shortName} />
                          {canManage && <StatusControl row={row} />}
                          {canManage && canCreateStudents && row.status !== 'SPAM' && (
                            <ConvertButton row={row} suggestedAdmissionNumber={suggested} />
                          )}
                          {canManage && <DeleteEnquiryButton row={row} />}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}

function FilterTab({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${
        active
          ? 'bg-navy-800 text-white'
          : 'border border-slate-300 text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
    </Link>
  );
}
