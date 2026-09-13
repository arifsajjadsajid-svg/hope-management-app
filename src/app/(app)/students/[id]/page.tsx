import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Pencil,
  TrendingUp,
  TrendingDown,
  Minus,
  Award,
  IdCard,
  Medal,
  History,
  BookOpen,
  UserCog,
} from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { getStudentProfile, analyseStudentPerformance } from '@/server/queries/students';
import { PageHeader, DetailItem } from '@/components/layout/page-header';
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LinkButton,
  Badge,
} from '@/components/ui/primitives';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import {
  StudentAvatar,
  StudentStatusBadge,
  ResultStatusBadge,
  GradeBadge,
} from '@/components/ui/status-badge';
import { ProgressChart, SubjectRadarChart } from '@/components/charts/charts';
import { StudentArchiveButton } from './student-actions';
import {
  EXAM_TYPE_LABELS,
  GENDER_LABELS,
  CERTIFICATE_TYPE_LABELS,
  PROMOTION_ACTION_LABELS,
} from '@/lib/constants';
import { formatDate, formatPercent, ordinal, round } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const profile = await getStudentProfile(id);
  return { title: profile?.student.fullName ?? 'Student' };
}

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('students.view');
  const { id } = await params;

  const profile = await getStudentProfile(id);
  if (!profile) notFound();

  const { student, results, rollNumbers, currentEnrollment } = profile;
  const performance = analyseStudentPerformance(results);

  const trendIcon =
    performance.change === null ? Minus : performance.change > 0 ? TrendingUp : TrendingDown;
  const TrendIcon = trendIcon;
  const trendTone =
    performance.change === null
      ? 'text-slate-500'
      : performance.change > 0
        ? 'text-emerald-600'
        : performance.change < 0
          ? 'text-rose-600'
          : 'text-slate-500';

  const latestSubjects = performance.latest?.subjects ?? [];

  return (
    <>
      <PageHeader
        title={student.fullName}
        description={`Admission number ${student.admissionNumber}${
          currentEnrollment
            ? ` · ${currentEnrollment.schoolClass.name} — Section ${currentEnrollment.section.name} · ${currentEnrollment.session.name}`
            : ''
        }`}
        breadcrumbs={[{ label: 'Students', href: '/students' }, { label: student.fullName }]}
        actions={
          <>
            {userCan(user, 'students.archive') && (
              <StudentArchiveButton
                studentId={student.id}
                studentName={student.fullName}
                currentStatus={student.status}
              />
            )}
            {userCan(user, 'students.edit') && (
              <LinkButton href={`/students/${student.id}/edit`} size="sm">
                <Pencil className="h-4 w-4" />
                Edit
              </LinkButton>
            )}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-3">
        {/* --------------------------------------------------- identity card */}
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="bg-navy-gradient px-5 py-6 text-center">
              <div className="flex justify-center">
                <StudentAvatar
                  name={student.fullName}
                  photoPath={student.photoPath}
                  size={96}
                  className="ring-4 ring-white/20"
                />
              </div>
              <p className="mt-3 text-lg font-bold text-white">{student.fullName}</p>
              <p className="text-[12.5px] text-navy-200">S/O — D/O {student.fatherName}</p>
              <div className="mt-3 flex justify-center">
                <StudentStatusBadge status={student.status} />
              </div>
            </div>

            <CardBody>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
                <DetailItem label="Admission No." value={<span className="tabular">{student.admissionNumber}</span>} />
                <DetailItem label="Registration No." value={student.registrationNo} />
                <DetailItem label="Class" value={currentEnrollment?.schoolClass.name} />
                <DetailItem label="Section" value={currentEnrollment?.section.name} />
                <DetailItem label="Class Roll" value={currentEnrollment?.rollNumber} />
                <DetailItem label="Session" value={currentEnrollment?.session.name} />
                <DetailItem label="Gender" value={GENDER_LABELS[student.gender] ?? student.gender} />
                <DetailItem label="Date of Birth" value={formatDate(student.dateOfBirth)} />
                <DetailItem label="B-Form / CNIC" value={student.bformCnic} />
                <DetailItem label="Admitted On" value={formatDate(student.admissionDate)} />
                <DetailItem label="Mother Name" value={student.motherName} />
                <DetailItem label="Guardian" value={student.guardianName} />
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Contact" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
                <DetailItem label="Parent Phone" value={student.parentPhone} />
                <DetailItem label="Student Phone" value={student.studentPhone} />
                <DetailItem label="WhatsApp" value={student.whatsappNumber} />
                <DetailItem label="Emergency" value={student.emergencyContact} />
                <DetailItem label="Email" value={student.email} className="col-span-2" />
                <DetailItem label="Address" value={student.address} className="col-span-2" />
                <DetailItem label="Previous School" value={student.previousSchool} className="col-span-2" />
                {student.notes && (
                  <DetailItem
                    label="Notes"
                    value={<span className="whitespace-pre-line">{student.notes}</span>}
                    className="col-span-2"
                  />
                )}
              </dl>
            </CardBody>
          </Card>

          {student.portalUsers.length > 0 && (
            <Card>
              <CardHeader title="Portal access" description="Student / parent sign-in accounts" />
              <CardBody className="space-y-2.5">
                {student.portalUsers.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-navy-900">
                        <UserCog className="h-3.5 w-3.5 text-slate-400" />
                        {account.username}
                      </p>
                      <p className="text-[11.5px] text-slate-500">
                        Last sign-in {formatDate(account.lastLoginAt)}
                      </p>
                    </div>
                    <Badge
                      tone={
                        account.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : 'bg-slate-100 text-slate-600 ring-slate-200'
                      }
                    >
                      {account.status}
                    </Badge>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>

        {/* --------------------------------------------------- performance */}
        <div className="space-y-5 xl:col-span-2">
          <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Current %
              </p>
              <p className="mt-1.5 text-2xl font-bold leading-none text-navy-900 tabular">
                {performance.currentPercentage !== null
                  ? formatPercent(performance.currentPercentage)
                  : '—'}
              </p>
              <p className="mt-1 truncate text-[11.5px] text-slate-500">
                {performance.latest?.exam.name ?? 'No published result'}
              </p>
            </Card>

            <Card className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Previous %
              </p>
              <p className="mt-1.5 text-2xl font-bold leading-none text-navy-900 tabular">
                {performance.previousPercentage !== null
                  ? formatPercent(performance.previousPercentage)
                  : '—'}
              </p>
              <p className="mt-1 truncate text-[11.5px] text-slate-500">
                {performance.previous?.exam.name ?? '—'}
              </p>
            </Card>

            <Card className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Change</p>
              <p className={`mt-1.5 flex items-center gap-1 text-2xl font-bold leading-none tabular ${trendTone}`}>
                <TrendIcon className="h-5 w-5" />
                {performance.change !== null
                  ? `${performance.change > 0 ? '+' : ''}${round(performance.change, 2)}%`
                  : '—'}
              </p>
              <p className="mt-1 text-[11.5px] text-slate-500">
                {performance.change === null
                  ? 'Needs two results'
                  : performance.change > 0
                    ? 'Improvement'
                    : performance.change < 0
                      ? 'Decline'
                      : 'No change'}
              </p>
            </Card>

            <Card className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Class Position
              </p>
              <p className="mt-1.5 text-2xl font-bold leading-none text-navy-900 tabular">
                {performance.latest?.classPosition
                  ? ordinal(performance.latest.classPosition)
                  : '—'}
              </p>
              <p className="mt-1 text-[11.5px] text-slate-500">
                Section {performance.latest?.sectionPosition
                  ? ordinal(performance.latest.sectionPosition)
                  : '—'}
              </p>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Progress across examinations" />
              <CardBody>
                <ProgressChart
                  data={performance.history.map((h) => ({
                    label: h.examName.length > 18 ? `${h.examName.slice(0, 17)}…` : h.examName,
                    percentage: h.percentage,
                  }))}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Subject profile"
                description="Average percentage across all published results"
              />
              <CardBody>
                <SubjectRadarChart
                  data={performance.subjectAverages.map((s) => ({
                    subject: s.code,
                    percentage: round(s.average, 1),
                  }))}
                />
              </CardBody>
            </Card>
          </div>

          {(performance.strongestSubject || performance.weakestSubject) && (
            <div className="grid gap-3.5 sm:grid-cols-2">
              {performance.strongestSubject && (
                <Card className="border-emerald-200 bg-emerald-50/50 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                    Strongest subject
                  </p>
                  <p className="mt-1 text-lg font-bold text-navy-900">
                    {performance.strongestSubject.name}
                  </p>
                  <p className="text-[13px] font-semibold text-emerald-700 tabular">
                    {formatPercent(performance.strongestSubject.average, 1)} average
                  </p>
                </Card>
              )}
              {performance.weakestSubject && (
                <Card className="border-amber-200 bg-amber-50/50 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                    Needs attention
                  </p>
                  <p className="mt-1 text-lg font-bold text-navy-900">
                    {performance.weakestSubject.name}
                  </p>
                  <p className="text-[13px] font-semibold text-amber-700 tabular">
                    {formatPercent(performance.weakestSubject.average, 1)} average
                  </p>
                </Card>
              )}
            </div>
          )}

          {/* ------------------------------------------- latest result card */}
          {performance.latest && (
            <Card>
              <CardHeader
                title="Latest result"
                description={`${performance.latest.exam.name} · ${performance.latest.exam.session.name}`}
                actions={
                  <LinkButton
                    href={`/print/report-card?examId=${performance.latest.exam.id}&studentId=${student.id}`}
                    variant="outline"
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
                      <Th align="center">Max</Th>
                      <Th align="center">Passing</Th>
                      <Th align="center">Obtained</Th>
                      <Th align="center">%</Th>
                      <Th align="center">Grade</Th>
                      <Th align="center">Position</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestSubjects.map((subject) => (
                      <tr key={subject.id}>
                        <Td className="font-medium text-navy-900">
                          {subject.subjectName}
                          <span className="ml-1.5 text-[11px] text-slate-400">{subject.subjectCode}</span>
                        </Td>
                        <Td align="center" className="tabular">{subject.maxMarks}</Td>
                        <Td align="center" className="tabular">{subject.passingMarks}</Td>
                        <Td align="center" className="font-semibold tabular">
                          {subject.specialStatus !== 'NONE' ? subject.specialStatus : subject.obtainedMarks}
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
                        <Td>
                          <ResultStatusBadge status={subject.status} />
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
                      <Td align="center" className="tabular">
                        {performance.latest.classPosition
                          ? ordinal(performance.latest.classPosition)
                          : '—'}
                      </Td>
                      <Td>
                        <ResultStatusBadge status={performance.latest.status} />
                      </Td>
                    </tr>
                  </tfoot>
                </Table>
              </TableWrap>
            </Card>
          )}

          {/* -------------------------------------------- academic history */}
          <Card>
            <CardHeader
              title="Academic history"
              description="Every published examination result, oldest first"
            />
            {performance.history.length === 0 ? (
              <EmptyState
                icon={<History className="h-6 w-6" />}
                title="No published results yet"
                description="Results appear here once an examination has been processed and published."
              />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Examination</Th>
                      <Th>Session</Th>
                      <Th>Class</Th>
                      <Th align="center">Obtained</Th>
                      <Th align="center">%</Th>
                      <Th align="center">Grade</Th>
                      <Th align="center">Class Pos.</Th>
                      <Th>Status</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {performance.history.map((entry) => (
                      <tr key={entry.examId}>
                        <Td>
                          <Link
                            href={`/exams/${entry.examId}`}
                            className="font-semibold text-navy-900 hover:text-royal-700"
                          >
                            {entry.examName}
                          </Link>
                          <span className="block text-[11px] text-slate-500">
                            {EXAM_TYPE_LABELS[entry.examType] ?? entry.examType}
                          </span>
                        </Td>
                        <Td className="whitespace-nowrap text-slate-600 tabular">{entry.sessionName}</Td>
                        <Td className="whitespace-nowrap text-slate-700">
                          {entry.className} — {entry.sectionName}
                        </Td>
                        <Td align="center" className="tabular">
                          {entry.totalObtained} / {entry.totalMaxMarks}
                        </Td>
                        <Td align="center" className="font-semibold tabular">
                          {formatPercent(entry.percentage)}
                        </Td>
                        <Td align="center">
                          <GradeBadge grade={entry.grade} />
                        </Td>
                        <Td align="center" className="tabular">
                          {entry.classPosition ? ordinal(entry.classPosition) : '—'}
                        </Td>
                        <Td>
                          <ResultStatusBadge status={entry.status} />
                        </Td>
                        <Td>
                          <Link
                            href={`/print/report-card?examId=${entry.examId}&studentId=${student.id}`}
                            target="_blank"
                            className="text-[12px] font-semibold text-royal-700 hover:underline"
                          >
                            Report card
                          </Link>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>

          {/* -------------------------------------------------- roll numbers */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Examination roll numbers" />
              {rollNumbers.length === 0 ? (
                <EmptyState
                  icon={<IdCard className="h-6 w-6" />}
                  title="No roll numbers allocated"
                  description="Roll numbers appear once they are generated for an examination."
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {rollNumbers.map((roll) => (
                    <li key={roll.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-navy-900">
                          {roll.exam.name}
                        </p>
                        <p className="text-[11.5px] text-slate-500">
                          {formatDate(roll.exam.startDate)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="rounded-md bg-navy-900 px-2.5 py-1 text-[12.5px] font-bold text-gold-300 tabular">
                          {roll.rollNumber}
                        </span>
                        <Link
                          href={`/print/roll-slips?examId=${roll.exam.id}&studentId=${student.id}&perPage=1`}
                          target="_blank"
                          className="text-[12px] font-semibold text-royal-700 hover:underline"
                        >
                          Slip
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader title="Certificates & awards" />
              {student.certificates.length === 0 ? (
                <EmptyState
                  icon={<Medal className="h-6 w-6" />}
                  title="No certificates issued"
                  description="Position and merit certificates issued to this student will be listed here."
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {student.certificates.map((certificate) => (
                    <li key={certificate.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-navy-900">
                          {certificate.title}
                        </p>
                        <p className="truncate text-[11.5px] text-slate-500">
                          {CERTIFICATE_TYPE_LABELS[certificate.type] ?? certificate.type}
                          {certificate.exam ? ` · ${certificate.exam.name}` : ''} ·{' '}
                          {formatDate(certificate.issuedDate)}
                        </p>
                      </div>
                      <Link
                        href={`/print/certificate?id=${certificate.id}`}
                        target="_blank"
                        className="shrink-0 text-[12px] font-semibold text-royal-700 hover:underline"
                      >
                        Print
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* ----------------------------------------- enrolment & promotion */}
          <Card>
            <CardHeader title="Enrolment & promotion history" />
            {student.enrollments.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="h-6 w-6" />}
                title="No enrolment records"
                description="This student has not been placed in a class yet."
              />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Session</Th>
                      <Th>Class</Th>
                      <Th>Section</Th>
                      <Th align="center">Class Roll</Th>
                      <Th>Enrolment Status</Th>
                      <Th>Outcome</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {student.enrollments.map((enrollment) => {
                      const promotion = student.promotions.find(
                        (p) => p.fromSessionId === enrollment.sessionId,
                      );
                      return (
                        <tr key={enrollment.id}>
                          <Td className="whitespace-nowrap font-semibold text-navy-900 tabular">
                            {enrollment.session.name}
                          </Td>
                          <Td>{enrollment.schoolClass.name}</Td>
                          <Td>{enrollment.section.name}</Td>
                          <Td align="center" className="tabular">{enrollment.rollNumber ?? '—'}</Td>
                          <Td className="text-slate-600">{enrollment.status}</Td>
                          <Td className="text-[12.5px] text-slate-600">
                            {promotion
                              ? `${PROMOTION_ACTION_LABELS[promotion.action] ?? promotion.action}${
                                  promotion.toClass ? ` → ${promotion.toClass.name}` : ''
                                }`
                              : '—'}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
