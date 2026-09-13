import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Circle, Lock, ShieldCheck, Upload } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { runMarksVerification } from '@/server/services/result-processing';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader, EmptyState, LinkButton, Alert, Badge } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { ExamStatusBadge } from '@/components/ui/status-badge';
import {
  SubmitForApprovalButton,
  ApproveResultsButton,
  PublishResultsButton,
  UnpublishResultsButton,
  LockResultsButton,
  UnlockResultsButton,
} from '../result-workflow-clients';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Publish Results' };
export const dynamic = 'force-dynamic';

export default async function PublishResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('results.view');
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

  if (!examId) {
    return (
      <>
        <PageHeader
          title="Publish Results"
          description="Approval, locking and publication."
          breadcrumbs={[{ label: 'Results' }, { label: 'Publish Results' }]}
        />
        <Card>
          <EmptyState
            icon={<Upload className="h-6 w-6" />}
            title="No examinations yet"
            description="Create an examination and process its results first."
          />
        </Card>
      </>
    );
  }

  const exam = await prisma.exam.findUniqueOrThrow({
    where: { id: examId },
    include: {
      session: { select: { name: true } },
      workflowEvents: { orderBy: { createdAt: 'desc' } },
      _count: { select: { results: true, marks: true } },
    },
  });

  const verification = await runMarksVerification(examId);
  const publishedCount = await prisma.result.count({ where: { examId, isPublished: true } });

  const steps = [
    {
      key: 'MARKS',
      label: 'Marks completed',
      done: exam._count.marks > 0,
      detail: `${exam._count.marks.toLocaleString()} mark(s) recorded`,
    },
    {
      key: 'VERIFY',
      label: 'Verification passed',
      done: exam._count.marks > 0 && verification.criticalCount === 0,
      detail:
        verification.criticalCount === 0
          ? `No critical issues (${verification.warningCount} warning(s))`
          : `${verification.criticalCount} critical issue(s) outstanding`,
    },
    {
      key: 'PROCESS',
      label: 'Results processed',
      done: exam._count.results > 0,
      detail: exam.processedAt
        ? `${exam._count.results} result(s) — ${formatDateTime(exam.processedAt)}`
        : 'Not processed yet',
    },
    {
      key: 'REVIEW',
      label: 'Submitted for approval',
      done: ['AWAITING_APPROVAL', 'PUBLISHED', 'LOCKED', 'ARCHIVED'].includes(exam.status) || Boolean(exam.approvedAt),
      detail:
        exam.status === 'AWAITING_APPROVAL'
          ? 'Awaiting the Principal / Director'
          : exam.approvedAt
            ? 'Reviewed'
            : 'Not submitted',
    },
    {
      key: 'APPROVE',
      label: 'Principal approval',
      done: Boolean(exam.approvedAt),
      detail: exam.approvedAt
        ? `${exam.approvedByName ?? 'Approved'} — ${formatDateTime(exam.approvedAt)}`
        : 'Awaiting approval',
    },
    {
      key: 'PUBLISH',
      label: 'Result published',
      done: exam.status === 'PUBLISHED' || publishedCount > 0,
      detail: exam.publishedAt
        ? `${publishedCount} result(s) — ${formatDateTime(exam.publishedAt)}`
        : 'Not published',
    },
    {
      key: 'LOCK',
      label: 'Result locked',
      done: exam.resultLocked,
      detail: exam.lockedAt ? `Locked ${formatDateTime(exam.lockedAt)}` : 'Marks still editable',
    },
  ];

  const completedSteps = steps.filter((s) => s.done).length;

  return (
    <>
      <PageHeader
        title="Result Approval & Publication"
        description={`${exam.name} · Session ${exam.session.name}`}
        breadcrumbs={[{ label: 'Results' }, { label: 'Publish Results' }]}
        actions={
          <>
            <LinkButton href={`/marks/verification?examId=${exam.id}`} variant="outline" size="sm">
              <ShieldCheck className="h-4 w-4" />
              Verification
            </LinkButton>
            <ExamStatusBadge status={exam.resultLocked ? 'LOCKED' : exam.status} />
          </>
        }
      />

      <Card className="mb-5">
        <FilterBar
          fields={[
            {
              type: 'select',
              name: 'examId',
              label: 'Examination',
              className: 'min-w-[300px] flex-1',
              options: exams.map((e) => ({ value: e.id, label: e.name })),
            },
          ]}
        />
      </Card>

      {verification.criticalCount > 0 && (
        <Alert tone="danger" title="Publication is blocked" className="mb-5">
          <strong>{verification.criticalCount}</strong> critical marks issue
          {verification.criticalCount === 1 ? '' : 's'} must be corrected first.{' '}
          <Link href={`/marks/verification?examId=${exam.id}`} className="font-semibold underline">
            Open Marks Verification
          </Link>
        </Alert>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        {/* --------------------------------------------------- workflow steps */}
        <div className="xl:col-span-2">
          <Card>
            <CardHeader
              title="Result workflow"
              description={`${completedSteps} of ${steps.length} stages complete`}
            />
            <CardBody>
              <ol className="relative space-y-0">
                {steps.map((step, index) => (
                  <li key={step.key} className="relative flex gap-4 pb-6 last:pb-0">
                    {index < steps.length - 1 && (
                      <span
                        className={cn(
                          'absolute left-[15px] top-8 h-full w-0.5',
                          step.done ? 'bg-emerald-400' : 'bg-slate-200',
                        )}
                        aria-hidden
                      />
                    )}
                    <span
                      className={cn(
                        'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white',
                        step.done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500',
                      )}
                    >
                      {step.done ? <Check className="h-4 w-4" /> : <Circle className="h-3 w-3" />}
                    </span>
                    <div className="min-w-0 flex-1 pt-1">
                      <p
                        className={cn(
                          'text-[14px] font-bold',
                          step.done ? 'text-navy-900' : 'text-slate-500',
                        )}
                      >
                        {step.label}
                      </p>
                      <p className="mt-0.5 text-[12.5px] text-slate-600">{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>

          <Card className="mt-5">
            <CardHeader
              title="Available actions"
              description="Each action is recorded in the workflow trail and the audit log."
            />
            <CardBody>
              <div className="flex flex-wrap gap-2.5">
                {userCan(user, 'results.process') && (
                  <SubmitForApprovalButton
                    examId={exam.id}
                    disabled={
                      exam._count.results === 0 ||
                      exam.resultLocked ||
                      exam.status === 'AWAITING_APPROVAL' ||
                      Boolean(exam.approvedAt)
                    }
                  />
                )}

                {userCan(user, 'results.approve') && (
                  <ApproveResultsButton
                    examId={exam.id}
                    disabled={exam._count.results === 0 || Boolean(exam.approvedAt)}
                  />
                )}

                {userCan(user, 'results.publish') && (
                  <>
                    <PublishResultsButton
                      examId={exam.id}
                      count={exam._count.results}
                      approved={Boolean(exam.approvedAt)}
                      disabled={
                        exam._count.results === 0 ||
                        !exam.approvedAt ||
                        exam.status === 'PUBLISHED' ||
                        verification.criticalCount > 0
                      }
                    />
                    <UnpublishResultsButton
                      examId={exam.id}
                      disabled={exam.status !== 'PUBLISHED' || exam.resultLocked}
                    />
                  </>
                )}

                {userCan(user, 'results.lock') && (
                  <LockResultsButton
                    examId={exam.id}
                    disabled={exam.resultLocked || !exam.approvedAt}
                  />
                )}

                {userCan(user, 'results.unlock') && (
                  <UnlockResultsButton examId={exam.id} disabled={!exam.resultLocked} />
                )}
              </div>

              <div className="mt-5 space-y-2 rounded-lg bg-slate-50 p-4 text-[12.5px] leading-relaxed text-slate-600">
                <p>
                  <strong className="text-navy-900">Order of operations:</strong> marks completed →
                  verification → processing → controller review → principal approval → publication →
                  lock.
                </p>
                <p>
                  <strong className="text-navy-900">After locking</strong>, teachers and the
                  Examination Controller can no longer change marks, the date sheet, roll numbers or
                  the seating plan. Only a Super Admin can unlock, and only with a written reason and
                  password confirmation.
                </p>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* ------------------------------------------------------ audit trail */}
        <Card className="h-fit">
          <CardHeader title="Workflow trail" description="Newest first" />
          {exam.workflowEvents.length === 0 ? (
            <EmptyState
              icon={<Lock className="h-6 w-6" />}
              title="No workflow events yet"
              description="Actions taken on this result will be listed here."
            />
          ) : (
            <ul className="max-h-[600px] divide-y divide-slate-100 overflow-y-auto">
              {exam.workflowEvents.map((event) => (
                <li key={event.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      tone={
                        event.action === 'UNLOCK' || event.action === 'UNPUBLISH'
                          ? 'bg-rose-50 text-rose-700 ring-rose-200'
                          : event.action === 'PUBLISH' || event.action === 'APPROVE'
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : 'bg-royal-50 text-royal-700 ring-royal-200'
                      }
                    >
                      {event.action.replace(/_/g, ' ')}
                    </Badge>
                    <span className="text-[11px] text-slate-400 tabular">
                      {formatDateTime(event.createdAt)}
                    </span>
                  </div>
                  {event.reason && (
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-700">
                      {event.reason}
                    </p>
                  )}
                  <p className="mt-1 text-[11.5px] font-medium text-slate-500">
                    {event.userName ?? 'System'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
