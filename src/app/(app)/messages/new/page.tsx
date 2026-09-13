import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { PageHeader } from '@/components/layout/page-header';
import { Alert } from '@/components/ui/primitives';
import { MessageComposer } from '../composer';

export const metadata: Metadata = { title: 'New Message' };
export const dynamic = 'force-dynamic';

export default async function NewMessagePage() {
  await requirePermission('notifications.send');

  const session = await getCurrentSession();
  if (!session) {
    return (
      <>
        <PageHeader
          title="New Message"
          description="Send a WhatsApp message to parents."
          breadcrumbs={[{ label: 'Messages', href: '/messages' }, { label: 'New Message' }]}
        />
        <Alert tone="warning" title="No academic session">
          Create an academic session and enrol students before messaging parents.
        </Alert>
      </>
    );
  }

  const [classes, sections, enrollments, exams] = await Promise.all([
    prisma.schoolClass.findMany({
      where: { sessionId: session.id },
      orderBy: { displayOrder: 'asc' },
    }),
    prisma.section.findMany({
      where: { schoolClass: { sessionId: session.id } },
      include: { schoolClass: { select: { name: true, displayOrder: true } } },
      orderBy: [{ schoolClass: { displayOrder: 'asc' } }, { name: 'asc' }],
    }),
    prisma.enrollment.findMany({
      where: { sessionId: session.id, student: { status: 'ACTIVE' } },
      include: {
        student: { select: { id: true, fullName: true, admissionNumber: true } },
        schoolClass: { select: { name: true, displayOrder: true } },
        section: { select: { name: true } },
      },
      orderBy: [
        { schoolClass: { displayOrder: 'asc' } },
        { section: { name: 'asc' } },
        { rollNumber: 'asc' },
      ],
    }),
    prisma.exam.findMany({
      where: { sessionId: session.id },
      include: { _count: { select: { results: true } } },
      orderBy: { startDate: 'desc' },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="New Message"
        description="Compose once; the system personalises it for every family and hands you a click-to-send list."
        breadcrumbs={[{ label: 'Messages', href: '/messages' }, { label: 'New Message' }]}
      />

      <MessageComposer
        sessionId={session.id}
        sessionName={session.name}
        classes={classes.map((c) => ({ id: c.id, label: c.name }))}
        sections={sections.map((s) => ({
          id: s.id,
          label: `${s.schoolClass.name} — ${s.name}`,
          parentId: s.classId,
        }))}
        students={enrollments.map((e) => ({
          id: e.studentId,
          label: `${e.student.fullName} — ${e.schoolClass.name} ${e.section.name} (${e.student.admissionNumber})`,
        }))}
        exams={exams.map((exam) => ({
          id: exam.id,
          label: `${exam.name}${exam._count.results ? '' : ' — no results yet'}`,
          hasResults: exam._count.results > 0,
        }))}
      />
    </>
  );
}
