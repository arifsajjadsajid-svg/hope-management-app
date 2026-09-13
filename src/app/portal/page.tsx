import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  CalendarDays,
  IdCard,
  Award,
  TrendingUp,
  TrendingDown,
  Minus,
  Medal,
  Printer,
} from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getStudentProfile, analyseStudentPerformance } from '@/server/queries/students';
import { Card, CardBody, CardHeader, EmptyState, Alert, Badge, LinkButton } from '@/components/ui/primitives';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { GradeBadge, ResultStatusBadge, StudentAvatar } from '@/components/ui/status-badge';
import { ProgressChart } from '@/components/charts/charts';
import { DetailItem } from '@/components/layout/page-header';
import { EXAM_TYPE_LABELS, CERTIFICATE_TYPE_LABELS } from '@/lib/constants';
import { formatDate, formatTime12, formatPercent, ordinal, round, dayName } from '@/lib/utils';

export const metadata: Metadata = { title: 'Student Portal' };
export const dynamic = 'force-dynamic';

export default async function PortalPage() {
  const user = await requireUser();

  // Staff accounts belong in the main application.
  if (!user.studentId) {
    if (user.roleCode !== 'STUDENT') redirect('/dashboard');
    return (
      <Alert tone="warning" title="No student linked to this account">
        This portal account is not linked to a student record. Please contact the academy office.
      </Alert>
    );
  }

  const profile = await getStudentProfile(user.studentId);
  if (!profile) {
    return (
      <Alert tone="warning" title="Student record not found">
        The linked student record no longer exists. Please contact the academy office.
      </Alert>
    );
  }

  const { student, results, rollNumbers, currentEnrollment } = profile;
  const performance = analyseStudentPerformance(results);

  // Upcoming and current examinations for this student's class.
  const upcomingPapers = currentEnrollment
    ? await prisma.dateSheetEntry.findMany({
        where: {
          classId: currentEnrollment.classId,
          exam: {
            sessionId: currentEnrollment.sessionId,
            status: { in: ['SCHEDULED', 'IN_PROGRESS', 'MARKS_ENTRY'] },
          },
        },
        include: {
          exam: { select: { id: true, name: true } },
          examSubject: { include: { subject: { select: { name: true, code: true } } } },
          room: { select: { name: true, roomNumber: true } },
        },
        orderBy: [{ paperDate: 'asc' }, { startTime: 'asc' }],
      })
    : [];

  const activeRollSlips = rollNumbers.filter((r) =>
    ['SCHEDULED', 'IN_PROGRESS', 'MARKS_ENTRY', 'PUBLISHED'].includes(r.exam.status),
  );

  const TrendIcon =
    performance.change === null ? Minus : performance.change > 0 ? TrendingUp : TrendingDown;
  const trendTone =
    performance.change === null
      ? 'text-slate-500'
      : performance.change > 0
        ? 'text-emerald-600'
        : performance.change < 0
          ? 'text-rose-600'
          : 'text-slate-500';

  return (
    <>
      {/* -------------------------------------------------------- profile */}
      <Card className="mb-5 overflow-hidden">
        <div className="flex flex-wrap items-center gap-5 bg-navy-gradient px-5 py-6 sm:px-7">
          <StudentAvatar
            name={student.fullName}
            photoPath={student.photoPath}
            size={82}
            className="ring-4 ring-white/25"
          />
          <div className="min-w-0 flex-1">
            <h2 className="doc-title text-xl font-bold text-white sm:text-2xl">
              {student.fullName}
            </h2>
            <p className="text-[13px] text-navy-200">S/O — D/O {student.fatherName}</p>
            {currentEnrollment && (
              <p className="mt-1 text-[13px] font-semibold text-gold-300">
                {currentEnrollment.schoolClass.name} — Section {currentEnrollment.section.name} ·
                Session {currentEnrollment.session.name}
              </p>
            )}
          </div>
          {performance.currentPercentage !== null && (
            <div className="text-right">
              <p className="text-3xl font-bold leading-none text-white tabular">
                {formatPercent(performance.currentPercentage)}
              </p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-navy-200">
                Latest result
              </p>
            </div>
          )}
        </div>

        <CardBody>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-3.5 sm:grid-cols-4">
            <DetailItem label="Admission No." value={student.admissionNumber} />
            <DetailItem label="Registration No." value={student.registrationNo} />
            <DetailItem label="Class Roll" value={currentEnrollment?.rollNumber} />
            <DetailItem label="Date of Birth" value={formatDate(student.dateOfBirth)} />
          </dl>
        </CardBody>
      </Card>

      {/* ---------------------------------------------------- performance */}
      <section className="mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {[
          {
            label: 'Current Percentage',
            value:
              performance.currentPercentage !== null
                ? formatPercent(performance.currentPercentage)
                : '—',
            hint: performance.latest?.exam.name ?? 'No published result',
          },
          {
            label: 'Previous Percentage',
            value:
              performance.previousPercentage !== null
                ? formatPercent(performance.previousPercentage)
                : '—',
            hint: performance.previous?.exam.name ?? '—',
          },
          {
            label: 'Class Position',
            value: performance.latest?.classPosition
              ? ordinal(performance.latest.classPosition)
              : '—',
            hint: performance.latest?.sectionPosition
              ? `Section ${ordinal(performance.latest.sectionPosition)}`
              : '—',
          },
          {
            label: 'Change',
            value:
              performance.change !== null
                ? `${performance.change > 0 ? '+' : ''}${round(performance.change, 2)}%`
                : '—',
            hint:
              performance.change === null
                ? 'Needs two results'
                : performance.change > 0
                  ? 'Improvement'
                  : performance.change < 0
                    ? 'Decline'
                    : 'No change',
            tone: trendTone,
            icon: TrendIcon,
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {item.label}
              </p>
              <p
                className={`mt-1.5 flex items-center gap-1 text-2xl font-bold leading-none tabular ${item.tone ?? 'text-navy-900'}`}
              >
                {Icon && <Icon className="h-5 w-5" />}
                {item.value}
              </p>
              <p className="mt-1 truncate text-[11.5px] text-slate-500">{item.hint}</p>
            </Card>
          );
        })}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* --------------------------------------------------- date sheet */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Date sheet"
            description="Upcoming and current examination papers for your class"
          />
          {upcomingPapers.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-6 w-6" />}
              title="No papers scheduled"
              description="Your date sheet will appear here once the academy publishes it."
            />
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Day</Th>
                    <Th>Subject</Th>
                    <Th>Timing</Th>
                    <Th>Room</Th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingPapers.map((paper) => (
                    <tr key={paper.id}>
                      <Td className="whitespace-nowrap tabular font-semibold text-navy-900">
                        {formatDate(paper.paperDate)}
                      </Td>
                      <Td className="text-slate-600">{dayName(paper.paperDate)}</Td>
                      <Td>
                        <span className="font-semibold text-navy-900">
                          {paper.examSubject.subject.name}
                        </span>
                        <span className="block text-[11.5px] text-slate-500">
                          {paper.exam.name}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap tabular text-slate-700">
                        {formatTime12(paper.startTime)} – {formatTime12(paper.endTime)}
                      </Td>
                      <Td className="whitespace-nowrap text-[12.5px] text-slate-600">
                        {paper.room ? `${paper.room.name} (${paper.room.roomNumber})` : '—'}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>

        {/* -------------------------------------------------- roll slips */}
        <Card>
          <CardHeader title="Roll number slips" />
          {activeRollSlips.length === 0 ? (
            <EmptyState
              icon={<IdCard className="h-6 w-6" />}
              title="No slips available"
              description="Your roll number slip appears once the academy generates it."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {activeRollSlips.map((roll) => (
                <li key={roll.id} className="px-5 py-3.5">
                  <p className="text-[13px] font-semibold text-navy-900">{roll.exam.name}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <Badge tone="bg-navy-900 text-gold-300 ring-navy-800">{roll.rollNumber}</Badge>
                    <a
                      href={`/print/roll-slips?examId=${roll.exam.id}&studentId=${student.id}&perPage=1`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-royal-700 hover:underline"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Download
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------- latest result */}
      {performance.latest && (
        <Card className="mt-5">
          <CardHeader
            title="Latest published result"
            description={`${performance.latest.exam.name} · ${performance.latest.exam.session.name}`}
            actions={
              <LinkButton
                href={`/print/report-card?examId=${performance.latest.exam.id}&studentId=${student.id}`}
                size="sm"
                newTab
              >
                <Award className="h-4 w-4" />
                Report Card
              </LinkButton>
            }
          />
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Subject</Th>
                  <Th align="center">Maximum</Th>
                  <Th align="center">Passing</Th>
                  <Th align="center">Obtained</Th>
                  <Th align="center">%</Th>
                  <Th align="center">Grade</Th>
                  <Th align="center">Position</Th>
                </tr>
              </thead>
              <tbody>
                {performance.latest.subjects.map((subject) => (
                  <tr key={subject.id}>
                    <Td className="font-medium text-navy-900">{subject.subjectName}</Td>
                    <Td align="center" className="tabular">{subject.maxMarks}</Td>
                    <Td align="center" className="tabular">{subject.passingMarks}</Td>
                    <Td align="center" className="font-semibold tabular">
                      {subject.specialStatus !== 'NONE'
                        ? subject.specialStatus
                        : subject.obtainedMarks}
                    </Td>
                    <Td align="center" className="tabular">
                      {subject.specialStatus !== 'NONE' ? '—' : formatPercent(subject.percentage, 1)}
                    </Td>
                    <Td align="center">
                      <GradeBadge grade={subject.grade} />
                    </Td>
                    <Td align="center" className="tabular">
                      {subject.classPosition ? ordinal(subject.classPosition) : '—'}
                    </Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-navy-50 font-bold">
                  <Td className="text-navy-900">Total</Td>
                  <Td align="center" className="tabular">{performance.latest.totalMaxMarks}</Td>
                  <Td align="center">—</Td>
                  <Td align="center" className="tabular">{performance.latest.totalObtained}</Td>
                  <Td align="center" className="tabular">
                    {formatPercent(performance.latest.percentage)}
                  </Td>
                  <Td align="center">
                    <GradeBadge grade={performance.latest.grade} />
                  </Td>
                  <Td align="center">
                    <ResultStatusBadge status={performance.latest.status} />
                  </Td>
                </tr>
              </tfoot>
            </Table>
          </TableWrap>
        </Card>
      )}

      {/* ---------------------------------------------- progress & history */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Progress" description="Percentage across published examinations" />
          <CardBody>
            <ProgressChart
              data={performance.history.map((h) => ({
                label: h.examName.length > 16 ? `${h.examName.slice(0, 15)}…` : h.examName,
                percentage: h.percentage,
              }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Academic history" description="Every published result" />
          {performance.history.length === 0 ? (
            <EmptyState
              icon={<Award className="h-6 w-6" />}
              title="No results published yet"
              description="Your results will appear here once the academy publishes them."
            />
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Examination</Th>
                    <Th>Session</Th>
                    <Th align="center">%</Th>
                    <Th align="center">Grade</Th>
                    <Th align="center">Position</Th>
                    <Th align="right">Report</Th>
                  </tr>
                </thead>
                <tbody>
                  {[...performance.history].reverse().map((entry) => (
                    <tr key={entry.examId}>
                      <Td>
                        <span className="font-semibold text-navy-900">{entry.examName}</span>
                        <span className="block text-[11px] text-slate-500">
                          {EXAM_TYPE_LABELS[entry.examType] ?? entry.examType}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap tabular text-slate-600">
                        {entry.sessionName}
                      </Td>
                      <Td align="center" className="font-bold tabular">
                        {formatPercent(entry.percentage)}
                      </Td>
                      <Td align="center">
                        <GradeBadge grade={entry.grade} />
                      </Td>
                      <Td align="center" className="tabular">
                        {entry.classPosition ? ordinal(entry.classPosition) : '—'}
                      </Td>
                      <Td align="right">
                        <a
                          href={`/print/report-card?examId=${entry.examId}&studentId=${student.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[12.5px] font-semibold text-royal-700 hover:underline"
                        >
                          Print
                        </a>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------------ awards */}
      {student.certificates.length > 0 && (
        <Card className="mt-5">
          <CardHeader title="Certificates & awards" />
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {student.certificates.map((certificate) => (
              <div
                key={certificate.id}
                className="rounded-xl border border-gold-300 bg-gold-50/50 p-4"
              >
                <div className="flex items-start gap-2.5">
                  <Medal className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-navy-900">{certificate.title}</p>
                    <p className="text-[11.5px] text-slate-600">
                      {CERTIFICATE_TYPE_LABELS[certificate.type] ?? certificate.type}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-slate-500 tabular">
                      {formatDate(certificate.issuedDate)}
                    </p>
                    <a
                      href={`/print/certificate?id=${certificate.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 inline-block text-[12px] font-semibold text-royal-700 hover:underline"
                    >
                      Download certificate
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
