import type { Metadata } from 'next';
import { IdCard, Printer, FileSpreadsheet } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { previewRollNumbers } from '@/server/services/roll-numbers';
import { PageHeader } from '@/components/layout/page-header';
import { Card, EmptyState, LinkButton, Alert, Badge } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { StatCard } from '@/components/ui/stat-card';
import {
  GenerateRollNumbersButton,
  ManualRollNumberInput,
  DuplicateWarning,
} from './roll-number-clients';
import { ROLL_METHOD_LABELS } from '@/lib/constants';

export const metadata: Metadata = { title: 'Roll Numbers' };
export const dynamic = 'force-dynamic';

export default async function RollNumbersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('exams.view');
  const canManage = userCan(user, 'rollnumbers.manage');
  const params = await searchParams;
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const session = await getCurrentSession();
  const exams = await prisma.exam.findMany({
    where: session ? { sessionId: session.id } : {},
    orderBy: { startDate: 'desc' },
    select: { id: true, name: true },
  });

  const examId = pick('examId') || exams[0]?.id;
  const classFilter = pick('classId');

  if (!examId) {
    return (
      <>
        <PageHeader
          title="Roll Numbers"
          description="Allocate examination roll numbers."
          breadcrumbs={[{ label: 'Examinations', href: '/exams' }, { label: 'Roll Numbers' }]}
        />
        <Card>
          <EmptyState
            icon={<IdCard className="h-6 w-6" />}
            title="No examinations yet"
            description="Create an examination before allocating roll numbers."
          />
        </Card>
      </>
    );
  }

  const exam = await prisma.exam.findUniqueOrThrow({
    where: { id: examId },
    include: {
      session: { select: { name: true } },
      examClasses: { include: { schoolClass: { select: { id: true, name: true } } } },
      _count: { select: { rollNumbers: true } },
    },
  });

  const preview = await previewRollNumbers(examId);
  const rows = classFilter
    ? preview.rows.filter((r) => {
        const cls = exam.examClasses.find((c) => c.schoolClass.id === classFilter);
        return cls ? r.className === cls.schoolClass.name : true;
      })
    : preview.rows;

  const changedCount = preview.rows.filter((r) => r.changed).length;
  const newCount = preview.rows.filter((r) => r.existing === null).length;
  const isManual = exam.rollNumberMethod === 'MANUAL';
  const locked = exam.resultLocked;

  return (
    <>
      <PageHeader
        title="Roll Numbers"
        description={`${exam.name} · Session ${exam.session.name} · ${ROLL_METHOD_LABELS[exam.rollNumberMethod] ?? exam.rollNumberMethod}`}
        breadcrumbs={[{ label: 'Examinations', href: '/exams' }, { label: 'Roll Numbers' }]}
        actions={
          <>
            <LinkButton
              href={`/api/export/roll-numbers?examId=${exam.id}`}
              variant="outline"
              size="sm"
              download
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </LinkButton>
            <LinkButton
              href={`/print/roll-number-list?examId=${exam.id}`}
              variant="outline"
              size="sm"
              newTab
            >
              <Printer className="h-4 w-4" />
              Print List
            </LinkButton>
            {canManage && !isManual && (
              <GenerateRollNumbersButton
                examId={exam.id}
                hasExisting={exam._count.rollNumbers > 0}
                duplicates={preview.duplicates}
                disabled={locked}
                count={preview.rows.length}
              />
            )}
          </>
        }
      />

      {locked && (
        <Alert tone="warning" title="Results are locked" className="mb-5">
          Roll numbers cannot be regenerated while the result is locked.
        </Alert>
      )}

      <DuplicateWarning duplicates={preview.duplicates} />

      <section className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatCard label="Eligible Students" value={preview.rows.length} tone="navy" />
        <StatCard label="Already Allocated" value={exam._count.rollNumbers} tone="emerald" />
        <StatCard label="New Allocations" value={newCount} tone="royal" />
        <StatCard
          label="Would Change"
          value={changedCount}
          tone={changedCount ? 'amber' : 'slate'}
          hint={changedCount ? 'existing numbers differ from the preview' : 'preview matches'}
        />
      </section>

      {isManual && (
        <Alert tone="info" title="Manual allocation" className="mb-5">
          This examination is set to manual roll numbers. Type each roll number below and press
          Enter, or switch the method on the examination to allocate them automatically.
        </Alert>
      )}

      <Card>
        <FilterBar
          fields={[
            {
              type: 'select',
              name: 'examId',
              label: 'Examination',
              className: 'min-w-[260px] flex-1',
              options: exams.map((e) => ({ value: e.id, label: e.name })),
            },
            {
              type: 'select',
              name: 'classId',
              label: 'Class',
              options: [
                { value: '', label: 'All classes' },
                ...exam.examClasses.map((ec) => ({
                  value: ec.schoolClass.id,
                  label: ec.schoolClass.name,
                })),
              ],
            },
          ]}
        />

        {rows.length === 0 ? (
          <EmptyState
            icon={<IdCard className="h-6 w-6" />}
            title="No eligible students"
            description="No active students are enrolled in the classes and sections selected for this examination."
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th align="center">#</Th>
                  <Th>Student</Th>
                  <Th>Father Name</Th>
                  <Th>Admission No.</Th>
                  <Th>Class / Section</Th>
                  <Th align="center">Class Roll</Th>
                  <Th align="center">Current</Th>
                  <Th align="center">{isManual ? 'Roll Number' : 'Preview'}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.studentId}>
                    <Td align="center" className="tabular text-slate-400">
                      {index + 1}
                    </Td>
                    <Td className="font-semibold text-navy-900">{row.studentName}</Td>
                    <Td className="text-slate-700">{row.fatherName}</Td>
                    <Td className="whitespace-nowrap tabular text-slate-600">
                      {row.admissionNumber}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-700">
                      {row.className} — {row.sectionName}
                    </Td>
                    <Td align="center" className="tabular text-slate-600">
                      {row.classRoll ?? '—'}
                    </Td>
                    <Td align="center">
                      {row.existing ? (
                        <span className="rounded-md bg-navy-900 px-2 py-1 text-[12px] font-bold text-gold-300 tabular">
                          {row.existing}
                        </span>
                      ) : (
                        <span className="text-[12px] text-slate-400">Not allocated</span>
                      )}
                    </Td>
                    <Td align="center">
                      {isManual ? (
                        <ManualRollNumberInput
                          examId={exam.id}
                          studentId={row.studentId}
                          current={row.existing ?? ''}
                          disabled={!canManage || locked}
                        />
                      ) : (
                        <span
                          className={`rounded-md px-2 py-1 text-[12px] font-bold tabular ${
                            row.changed
                              ? 'bg-amber-100 text-amber-800'
                              : row.existing
                                ? 'bg-slate-100 text-slate-600'
                                : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {row.rollNumber}
                        </span>
                      )}
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
