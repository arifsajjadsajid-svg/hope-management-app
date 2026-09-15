import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  Award,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  Minus,
  Medal,
  MessageSquare,
  Star,
  Target,
  FileText,
} from 'lucide-react';
import { requireParentChild } from '@/lib/parent-auth';
import { prisma } from '@/lib/prisma';
import { getStudentProfile, analyseStudentPerformance } from '@/server/queries/students';
import { Card, CardBody, CardHeader, EmptyState, Badge } from '@/components/ui/primitives';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { GradeBadge, ResultStatusBadge, StudentAvatar } from '@/components/ui/status-badge';
import { ProgressChart } from '@/components/charts/charts';
import { EXAM_TYPE_LABELS, CERTIFICATE_TYPE_LABELS } from '@/lib/constants';
import {
  formatDate,
  formatDateTime,
  formatTime12,
  formatPercent,
  formatMarks,
  ordinal,
  round,
  dayName,
} from '@/lib/utils';

export const metadata: Metadata = { title: 'Parent Portal · Results' };
export const dynamic = 'force-dynamic';

export default async function ParentChildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Refuses — with a plain 404 — any student who is not this parent's child.
  const { child } = await requireParentChild(id);

  const profile = await getStudentProfile(child.id);
  if (!profile) {
    return (
      <EmptyState
        title="Record not available"
        description="Please contact the academy office."
      />
    );
  }

  const { student, results, rollNumbers, currentEnrollment } = profile;
  const performance = analyseStudentPerformance(results);
  const resultIdByExam = new Map(results.map((r) => [r.exam.id, r.id]));

  const [upcomingPapers, notices] = await Promise.all([
    currentEnrollment
      ? prisma.dateSheetEntry.findMany({
          where: {
            classId: currentEnrollment.classId,
            paperDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            exam: {
              sessionId: currentEnrollment.sessionId,
              status: { in: ['SCHEDULED', 'IN_PROGRESS', 'MARKS_ENTRY'] },
            },
          },
          include: {
            exam: { select: { name: true } },
            examSubject: { include: { subject: { select: { name: true } } } },
          },
          orderBy: [{ paperDate: 'asc' }, { startTime: 'asc' }],
          take: 20,
        })
      : Promise.resolve([]),
    // What the academy has actually sent this family about this child.
    prisma.messageRecipient.findMany({
      where: { studentId: child.id, status: 'SENT' },
      select: {
        id: true,
        renderedBody: true,
        sentAt: true,
        campaign: { select: { title: true } },
      },
      orderBy: { sentAt: 'desc' },
      take: 15,
    }),
  ]);

  const activeRollNumbers = rollNumbers.filter((r) =>
    ['SCHEDULED', 'IN_PROGRESS', 'MARKS_ENTRY'].includes(r.exam.status),
  );

  const latest = performance.latest;
  const change = performance.change;
  const TrendIcon = change === null ? Minus : change > 0 ? TrendingUp : TrendingDown;
  const trendClass =
    change === null || change === 0 ? 'text-slate-500' : change > 0 ? 'text-emerald-600' : 'text-rose-600';

  const showWeakest =
    performance.subjectAverages.length > 1 &&
    performance.weakestSubject &&
    performance.weakestSubject.code !== performance.strongestSubject?.code;

  return (
    <>
      <Link
        href="/parent"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-royal-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        All children
      </Link>

      {/* ------------------------------------------------------ profile */}
      <Card className="mb-5 overflow-hidden">
        <div className="flex items-center gap-4 bg-navy-gradient px-4 py-5 sm:px-7 sm:py-6">
          <StudentAvatar
            name={student.fullName}
            photoPath={student.photoPath}
            size={72}
            className="ring-4 ring-white/25"
          />
          <div className="min-w-0 flex-1">
            <h1 className="doc-title truncate text-xl font-bold text-white sm:text-2xl">
              {student.fullName}
            </h1>
            {currentEnrollment && (
              <p className="mt-0.5 text-[13px] font-semibold text-gold-300">
                {currentEnrollment.schoolClass.name} · Section {currentEnrollment.section.name}
              </p>
            )}
            <p className="mt-0.5 text-[12px] text-navy-200">
              Admission No. {student.admissionNumber}
              {currentEnrollment?.rollNumber ? ` · Class roll ${currentEnrollment.rollNumber}` : ''}
            </p>
          </div>
        </div>
      </Card>

      {!latest ? (
        <Card className="mb-5">
          <EmptyState
            icon={<Award className="h-6 w-6" />}
            title="No results published yet"
            description="Results appear here as soon as the academy publishes them."
          />
        </Card>
      ) : (
        <>
          {/* ------------------------------------------------ headline */}
          <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Percentage</p>
              <p className="mt-1.5 text-[26px] font-bold leading-none tabular text-navy-900">
                {formatPercent(latest.percentage)}
              </p>
              <p className="mt-1 truncate text-[11.5px] text-slate-500">{latest.exam.name}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Grade & Result</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <GradeBadge grade={latest.grade} />
                <ResultStatusBadge status={latest.status} />
              </div>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Class Position</p>
              <p className="mt-1.5 text-[26px] font-bold leading-none tabular text-navy-900">
                {latest.classPosition ? ordinal(latest.classPosition) : '—'}
              </p>
              <p className="mt-1 text-[11.5px] text-slate-500">
                {latest.sectionPosition ? `${ordinal(latest.sectionPosition)} in section` : ' '}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Progress</p>
              <p className={`mt-1.5 flex items-center gap-1 text-[22px] font-bold leading-none tabular ${trendClass}`}>
                <TrendIcon className="h-5 w-5" />
                {change === null ? '—' : `${change > 0 ? '+' : ''}${round(change, 2)}%`}
              </p>
              <p className="mt-1 truncate text-[11.5px] text-slate-500">
                {performance.previous ? `vs ${performance.previous.exam.name}` : 'Needs two results'}
              </p>
            </Card>
          </section>

          {/* ---------------------------------------------- latest result */}
          <Card className="mb-5">
            <CardHeader
              title="Latest result"
              description={`${latest.exam.name} · ${latest.exam.session.name}`}
              actions={
                <a
                  href={`/parent/report-card/${latest.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-navy-800 px-3 py-2 text-[12.5px] font-semibold text-white transition hover:bg-navy-900"
                >
                  <FileText className="h-4 w-4" />
                  Report Card
                </a>
              }
            />
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Subject</Th>
                    <Th align="center">Marks</Th>
                    <Th align="center">%</Th>
                    <Th align="center">Grade</Th>
                    <Th align="center">Position</Th>
                  </tr>
                </thead>
                <tbody>
                  {latest.subjects.map((subject) => {
                    const special = subject.specialStatus !== 'NONE';
                    return (
                      <tr key={subject.id}>
                        <Td className="font-medium text-navy-900">{subject.subjectName}</Td>
                        <Td align="center" className="whitespace-nowrap tabular">
                          {special ? (
                            <span className="font-semibold text-slate-600">{subject.specialStatus}</span>
                          ) : (
                            <>
                              <span className="font-semibold">{formatMarks(subject.obtainedMarks)}</span>
                              <span className="text-slate-400"> / {formatMarks(subject.maxMarks)}</span>
                            </>
                          )}
                        </Td>
                        <Td align="center" className="tabular">
                          {special ? '—' : formatPercent(subject.percentage, 1)}
                        </Td>
                        <Td align="center">
                          <GradeBadge grade={subject.grade} />
                        </Td>
                        <Td align="center" className="tabular">
                          {subject.classPosition ? ordinal(subject.classPosition) : '—'}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-navy-50 font-bold">
                    <Td className="text-navy-900">Total</Td>
                    <Td align="center" className="whitespace-nowrap tabular">
                      {formatMarks(latest.totalObtained)}
                      <span className="font-normal text-slate-500"> / {formatMarks(latest.totalMaxMarks)}</span>
                    </Td>
                    <Td align="center" className="tabular">{formatPercent(latest.percentage)}</Td>
                    <Td align="center">
                      <GradeBadge grade={latest.grade} />
                    </Td>
                    <Td align="center" className="tabular">
                      {latest.classPosition ? ordinal(latest.classPosition) : '—'}
                    </Td>
                  </tr>
                </tfoot>
              </Table>
            </TableWrap>
            {(latest.teacherRemarks || latest.principalRemarks) && (
              <CardBody className="space-y-2 border-t border-slate-100">
                {latest.teacherRemarks && (
                  <p className="text-[13px] text-slate-700">
                    <strong className="text-navy-900">Class teacher:</strong> {latest.teacherRemarks}
                  </p>
                )}
                {latest.principalRemarks && (
                  <p className="text-[13px] text-slate-700">
                    <strong className="text-navy-900">Principal:</strong> {latest.principalRemarks}
                  </p>
                )}
              </CardBody>
            )}
          </Card>

          {/* ------------------------------------------- strengths */}
          {performance.strongestSubject && (
            <section className="mb-5 grid gap-3 sm:grid-cols-2">
              <Card className="flex items-center gap-3.5 p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Star className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Strongest subject</p>
                  <p className="truncate text-[15px] font-bold text-navy-900">
                    {performance.strongestSubject.name}
                  </p>
                  <p className="text-[12px] text-slate-500">
                    Averages {formatPercent(performance.strongestSubject.average, 1)} across all exams
                  </p>
                </div>
              </Card>
              {showWeakest && performance.weakestSubject && (
                <Card className="flex items-center gap-3.5 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                    <Target className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Needs attention</p>
                    <p className="truncate text-[15px] font-bold text-navy-900">
                      {performance.weakestSubject.name}
                    </p>
                    <p className="text-[12px] text-slate-500">
                      Averages {formatPercent(performance.weakestSubject.average, 1)} across all exams
                    </p>
                  </div>
                </Card>
              )}
            </section>
          )}

          {/* --------------------------------------- progress & history */}
          <div className="mb-5 grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Progress over time" description="Percentage in each published exam" />
              <CardBody>
                <ProgressChart
                  height={230}
                  data={performance.history.map((h) => ({
                    label: h.examName.length > 14 ? `${h.examName.slice(0, 13)}…` : h.examName,
                    percentage: h.percentage,
                  }))}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="All results" description="Every published examination" />
              <ul className="divide-y divide-slate-100">
                {[...performance.history].reverse().map((entry) => {
                  const resultId = resultIdByExam.get(entry.examId);
                  return (
                    <li key={entry.examId} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-semibold text-navy-900">{entry.examName}</p>
                        <p className="text-[11.5px] text-slate-500">
                          {EXAM_TYPE_LABELS[entry.examType] ?? entry.examType} · {entry.className}
                          {entry.classPosition ? ` · ${ordinal(entry.classPosition)} in class` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[15px] font-bold tabular text-navy-900">
                          {formatPercent(entry.percentage)}
                        </p>
                        <GradeBadge grade={entry.grade} />
                      </div>
                      {resultId && (
                        <a
                          href={`/parent/report-card/${resultId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md p-1.5 text-slate-400 transition hover:bg-royal-50 hover:text-royal-700"
                          aria-label={`Report card for ${entry.examName}`}
                          title="Report card"
                        >
                          <FileText className="h-4 w-4" />
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
        </>
      )}

      {/* ------------------------------------------------- upcoming exams */}
      {(upcomingPapers.length > 0 || activeRollNumbers.length > 0) && (
        <Card className="mb-5">
          <CardHeader
            title="Upcoming examination"
            description="Date sheet for your child’s class"
            actions={
              activeRollNumbers[0] ? (
                <Badge tone="bg-navy-900 text-gold-300 ring-navy-800">
                  Roll No. {activeRollNumbers[0].rollNumber}
                </Badge>
              ) : undefined
            }
          />
          {upcomingPapers.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-6 w-6" />}
              title="Date sheet not published yet"
              description="Paper dates appear here once the academy publishes them."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcomingPapers.map((paper) => (
                <li key={paper.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <div className="w-14 shrink-0 rounded-lg bg-navy-50 py-1.5 text-center">
                    <p className="text-[10px] font-bold uppercase text-navy-600">{dayName(paper.paperDate).slice(0, 3)}</p>
                    <p className="text-[13px] font-bold tabular text-navy-900">
                      {formatDate(paper.paperDate).split(' ').slice(0, 2).join(' ')}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-navy-900">
                      {paper.examSubject.subject.name}
                    </p>
                    <p className="text-[12px] tabular text-slate-500">
                      {formatTime12(paper.startTime)} – {formatTime12(paper.endTime)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* ------------------------------------------ messages from academy */}
      {notices.length > 0 && (
        <Card className="mb-5">
          <CardHeader title="Messages from the academy" description="Sent to you about your child" />
          <ul className="divide-y divide-slate-100">
            {notices.map((notice) => (
              <li key={notice.id} className="flex gap-3 px-4 py-3.5 sm:px-5">
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-royal-600" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-[13px] font-semibold text-navy-900">{notice.campaign.title}</p>
                    {notice.sentAt && (
                      <p className="text-[11.5px] tabular text-slate-400">{formatDateTime(notice.sentAt)}</p>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-slate-600">
                    {notice.renderedBody}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* --------------------------------------------------- certificates */}
      {student.certificates.length > 0 && (
        <Card>
          <CardHeader title="Certificates & awards" />
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            {student.certificates.map((certificate) => (
              <div key={certificate.id} className="flex items-start gap-2.5 rounded-xl border border-gold-300 bg-gold-50/50 p-3.5">
                <Medal className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-navy-900">{certificate.title}</p>
                  <p className="text-[11.5px] text-slate-600">
                    {CERTIFICATE_TYPE_LABELS[certificate.type] ?? certificate.type} ·{' '}
                    {formatDate(certificate.issuedDate)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
