import type { Metadata } from 'next';
import Link from 'next/link';
import { Users, UserPlus, FileSpreadsheet, Printer, Upload } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { listStudents, academicOptions } from '@/server/queries/students';
import { PageHeader } from '@/components/layout/page-header';
import { Card, LinkButton, EmptyState } from "@/components/ui/primitives";
import { FilterBar } from '@/components/ui/filter-bar';
import { Table, TableWrap, Th, Td, Pagination } from '@/components/ui/table';
import { StudentStatusBadge, StudentAvatar } from '@/components/ui/status-badge';
import { STUDENT_STATUS, STUDENT_STATUS_LABELS, GENDER_LABELS, GENDERS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { title: 'All Students' };
export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function single(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('students.view');
  const params = await searchParams;

  const filters = {
    q: single(params, 'q'),
    classId: single(params, 'classId'),
    sectionId: single(params, 'sectionId'),
    sessionId: single(params, 'sessionId'),
    status: single(params, 'status'),
    gender: single(params, 'gender'),
    page: Number(single(params, 'page') ?? 1) || 1,
    pageSize: Number(single(params, 'pageSize') ?? 25) || 25,
  };

  const { students, total, page, pageSize, session } = await listStudents(filters);
  const { sessions, classes, sections } = await academicOptions(filters.sessionId);

  const visibleSections = filters.classId
    ? sections.filter((s) => s.classId === filters.classId)
    : sections;

  const exportQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value && key !== 'page' && key !== 'pageSize') exportQuery.set(key, String(value));
  }

  return (
    <>
      <PageHeader
        title="All Students"
        description={
          session
            ? `${total.toLocaleString()} student${total === 1 ? '' : 's'} in session ${session.name}.`
            : 'No academic session has been configured yet.'
        }
        breadcrumbs={[{ label: 'Students', href: '/students' }, { label: 'All Students' }]}
        actions={
          <>
            {userCan(user, 'students.export') && (
              <>
                <LinkButton
                  href={`/api/export/students?format=xlsx&${exportQuery.toString()}`}
                  variant="outline"
                  size="sm"
                  download
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Excel
                </LinkButton>
                <LinkButton
                  href={`/print/student-list?${exportQuery.toString()}`}
                  variant="outline"
                  size="sm"
                  newTab
                >
                  <Printer className="h-4 w-4" />
                  Print / PDF
                </LinkButton>
              </>
            )}
            {userCan(user, 'students.import') && (
              <LinkButton href="/students/import" variant="outline" size="sm">
                <Upload className="h-4 w-4" />
                Import
              </LinkButton>
            )}
            {userCan(user, 'students.create') && (
              <LinkButton href="/students/new" size="sm">
                <UserPlus className="h-4 w-4" />
                Add Student
              </LinkButton>
            )}
          </>
        }
      />

      <Card>
        <FilterBar
          fields={[
            {
              type: 'search',
              name: 'q',
              placeholder: 'Name, father name, admission no., phone…',
            },
            {
              type: 'select',
              name: 'sessionId',
              label: 'Session',
              options: sessions.map((s) => ({ value: s.id, label: s.name })),
            },
            {
              type: 'select',
              name: 'classId',
              label: 'Class',
              options: [
                { value: '', label: 'All classes' },
                ...classes.map((c) => ({ value: c.id, label: c.name })),
              ],
            },
            {
              type: 'select',
              name: 'sectionId',
              label: 'Section',
              options: [
                { value: '', label: 'All sections' },
                ...visibleSections.map((s) => ({
                  value: s.id,
                  label: `${s.schoolClass.name} — ${s.name}`,
                })),
              ],
            },
            {
              type: 'select',
              name: 'status',
              label: 'Status',
              options: [
                { value: '', label: 'All statuses' },
                ...STUDENT_STATUS.map((s) => ({ value: s, label: STUDENT_STATUS_LABELS[s]! })),
              ],
            },
            {
              type: 'select',
              name: 'gender',
              label: 'Gender',
              className: 'w-[140px]',
              options: [
                { value: '', label: 'All' },
                ...GENDERS.map((g) => ({ value: g, label: GENDER_LABELS[g]! })),
              ],
            },
          ]}
        />

        {students.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No students found"
            description={
              filters.q || filters.classId || filters.status
                ? 'No student matches the current filters. Try clearing them.'
                : 'Add your first student, or import an existing roster from Excel or CSV.'
            }
            action={
              userCan(user, 'students.create') && (
                <LinkButton href="/students/new">
                  <UserPlus className="h-4 w-4" />
                  Add Student
                </LinkButton>
              )
            }
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Student</Th>
                    <Th>Admission No.</Th>
                    <Th>Father Name</Th>
                    <Th>Class / Section</Th>
                    <Th align="center">Roll</Th>
                    <Th>Contact</Th>
                    <Th>Admitted</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id}>
                      <Td>
                        <Link
                          href={`/students/${student.id}`}
                          className="flex items-center gap-2.5 group"
                        >
                          <StudentAvatar
                            name={student.fullName}
                            photoPath={student.photoPath}
                            size={34}
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-navy-900 group-hover:text-royal-700">
                              {student.fullName}
                            </span>
                            <span className="block truncate text-[11.5px] text-slate-500">
                              {GENDER_LABELS[student.gender] ?? student.gender}
                              {student.dateOfBirth ? ` · DOB ${formatDate(student.dateOfBirth)}` : ''}
                            </span>
                          </span>
                        </Link>
                      </Td>
                      <Td className="whitespace-nowrap font-medium tabular">
                        {student.admissionNumber}
                      </Td>
                      <Td className="text-slate-700">{student.fatherName}</Td>
                      <Td className="whitespace-nowrap">
                        {student.enrollment ? (
                          <span className="font-medium text-navy-800">
                            {student.enrollment.schoolClass.name}
                            <span className="text-slate-400"> — </span>
                            {student.enrollment.section.name}
                          </span>
                        ) : (
                          <span className="text-slate-400">Not enrolled</span>
                        )}
                      </Td>
                      <Td align="center" className="tabular text-slate-700">
                        {student.enrollment?.rollNumber ?? '—'}
                      </Td>
                      <Td className="whitespace-nowrap text-[12.5px] text-slate-600 tabular">
                        {student.parentPhone ?? student.studentPhone ?? '—'}
                      </Td>
                      <Td className="whitespace-nowrap text-[12.5px] text-slate-600 tabular">
                        {formatDate(student.admissionDate)}
                      </Td>
                      <Td>
                        <StudentStatusBadge status={student.status} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>

            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              basePath="/students"
              searchParams={Object.fromEntries(
                Object.entries(filters).map(([k, v]) => [k, v ? String(v) : undefined]),
              )}
            />
          </>
        )}
      </Card>
    </>
  );
}
