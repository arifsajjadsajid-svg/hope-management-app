import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { getAcademySettings } from '@/lib/settings';
import { listStudents } from '@/server/queries/students';
import { Letterhead, DocumentFooter, SignatureRow } from '@/components/brand/letterhead';
import { PrintToolbar } from '../print-toolbar';
import { STUDENT_STATUS_LABELS, GENDER_LABELS } from '@/lib/constants';
import { formatDate, chunk } from '@/lib/utils';

export const metadata: Metadata = { title: 'Student List' };
export const dynamic = 'force-dynamic';

const ROWS_PER_PAGE = 24;

export default async function StudentListPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('students.view');
  const params = await searchParams;
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const academy = await getAcademySettings();
  const { students, session, total } = await listStudents({
    q: pick('q'),
    classId: pick('classId'),
    sectionId: pick('sectionId'),
    sessionId: pick('sessionId'),
    status: pick('status'),
    gender: pick('gender'),
    page: 1,
    pageSize: 500,
  });

  const pages = chunk(students, ROWS_PER_PAGE);

  if (students.length === 0) {
    return (
      <>
        <PrintToolbar title="Student List" subtitle="No students match this selection" />
        <div className="sheet sheet-a4 flex items-center justify-center">
          <p className="text-[11pt] text-slate-600">No students match the current filters.</p>
        </div>
      </>
    );
  }

  const scopeParts = [
    session ? `Session ${session.name}` : null,
    students[0]?.enrollment && pick('classId') ? students[0].enrollment.schoolClass.name : null,
    pick('status') ? STUDENT_STATUS_LABELS[pick('status')!] : null,
    pick('gender') ? GENDER_LABELS[pick('gender')!] : null,
  ].filter(Boolean);

  return (
    <>
      <PrintToolbar title="Student List" subtitle={`${total} student(s)`} />

      {pages.map((pageStudents, pageIndex) => (
        <section key={pageIndex} className="sheet sheet-a4">
          <Letterhead
            academy={academy}
            documentTitle="Student List"
            subtitle={scopeParts.join(' · ')}
          />

          <table className="doc-table" style={{ marginTop: '4mm', fontSize: '9pt' }}>
            <thead>
              <tr>
                <th className="num" style={{ width: '6%' }}>
                  Sr.
                </th>
                <th style={{ width: '15%' }}>Admission No.</th>
                <th>Student Name</th>
                <th>Father Name</th>
                <th style={{ width: '13%' }}>Class / Section</th>
                <th className="num" style={{ width: '7%' }}>
                  Roll
                </th>
                <th className="num" style={{ width: '14%' }}>
                  Contact
                </th>
                <th style={{ width: '10%' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {pageStudents.map((student, index) => (
                <tr key={student.id}>
                  <td className="num">{pageIndex * ROWS_PER_PAGE + index + 1}</td>
                  <td className="num">{student.admissionNumber}</td>
                  <td>
                    <strong>{student.fullName}</strong>
                  </td>
                  <td>{student.fatherName}</td>
                  <td>
                    {student.enrollment
                      ? `${student.enrollment.schoolClass.name} — ${student.enrollment.section.name}`
                      : '—'}
                  </td>
                  <td className="num">{student.enrollment?.rollNumber ?? '—'}</td>
                  <td className="num">{student.parentPhone ?? student.studentPhone ?? '—'}</td>
                  <td>{STUDENT_STATUS_LABELS[student.status] ?? student.status}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {pageIndex === pages.length - 1 && (
            <div style={{ marginTop: '12mm' }}>
              <SignatureRow
                signatures={[
                  { label: 'Prepared By', name: null },
                  {
                    label: 'Principal / Director',
                    name: academy.principalName ?? academy.directorName,
                    imagePath: academy.principalSignPath ?? academy.directorSignPath,
                  },
                ]}
              />
            </div>
          )}

          <div style={{ marginTop: '6mm' }}>
            <DocumentFooter
              academy={academy}
              note={`Page ${pageIndex + 1} of ${pages.length} · ${total} student(s) · Generated ${formatDate(new Date())}`}
            />
          </div>
        </section>
      ))}
    </>
  );
}
