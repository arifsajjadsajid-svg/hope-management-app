import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, userCanAny } from '@/lib/auth';
import { getCurrentSession } from '@/lib/settings';
import { EXAM_TYPE_LABELS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

type Hit = {
  id: string;
  type: 'STUDENT' | 'EXAM' | 'CLASS' | 'SECTION' | 'TEACHER' | 'SUBJECT';
  title: string;
  subtitle: string;
  href: string;
};

/**
 * Academy-wide search across students, examinations, classes, sections,
 * subjects and teachers. Results are limited to what the caller's role may see.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ results: [] }, { status: 401 });

  const term = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (term.length < 2) return NextResponse.json({ results: [] });

  const session = await getCurrentSession();
  const results: Hit[] = [];

  if (userCanAny(user, ['students.view'])) {
    const students = await prisma.student.findMany({
      where: {
        OR: [
          { fullName: { contains: term } },
          { fatherName: { contains: term } },
          { admissionNumber: { contains: term } },
          { registrationNo: { contains: term } },
          { parentPhone: { contains: term } },
          { studentPhone: { contains: term } },
          { whatsappNumber: { contains: term } },
        ],
      },
      include: {
        enrollments: {
          include: {
            schoolClass: { select: { name: true } },
            section: { select: { name: true } },
          },
          orderBy: { session: { startDate: 'desc' } },
          take: 1,
        },
      },
      take: 8,
      orderBy: { fullName: 'asc' },
    });

    for (const student of students) {
      const enrolment = student.enrollments[0];
      results.push({
        id: student.id,
        type: 'STUDENT',
        title: student.fullName,
        subtitle: `${student.admissionNumber} · S/O — D/O ${student.fatherName}${
          enrolment ? ` · ${enrolment.schoolClass.name} — ${enrolment.section.name}` : ''
        }`,
        href: `/students/${student.id}`,
      });
    }

    // Roll numbers are a common way to look a candidate up.
    const rolls = await prisma.rollNumberAllocation.findMany({
      where: { rollNumber: { contains: term } },
      include: {
        student: { select: { id: true, fullName: true } },
        exam: { select: { name: true } },
      },
      take: 5,
    });
    for (const roll of rolls) {
      results.push({
        id: `roll-${roll.id}`,
        type: 'STUDENT',
        title: `${roll.rollNumber} — ${roll.student.fullName}`,
        subtitle: `Roll number · ${roll.exam.name}`,
        href: `/students/${roll.student.id}`,
      });
    }
  }

  if (userCanAny(user, ['exams.view'])) {
    const exams = await prisma.exam.findMany({
      where: { name: { contains: term } },
      include: { session: { select: { name: true } } },
      take: 6,
      orderBy: { startDate: 'desc' },
    });
    for (const exam of exams) {
      results.push({
        id: exam.id,
        type: 'EXAM',
        title: exam.name,
        subtitle: `${EXAM_TYPE_LABELS[exam.type] ?? exam.type} · ${exam.session.name}`,
        href: `/exams/${exam.id}`,
      });
    }
  }

  if (userCanAny(user, ['academics.view'])) {
    const [classes, sections, subjects, teachers] = await Promise.all([
      prisma.schoolClass.findMany({
        where: { name: { contains: term }, ...(session ? { sessionId: session.id } : {}) },
        include: { session: { select: { name: true } } },
        take: 4,
      }),
      prisma.section.findMany({
        where: {
          name: { contains: term },
          ...(session ? { schoolClass: { sessionId: session.id } } : {}),
        },
        include: { schoolClass: { select: { name: true } } },
        take: 4,
      }),
      prisma.subject.findMany({
        where: {
          OR: [{ name: { contains: term } }, { code: { contains: term } }],
          ...(session ? { schoolClass: { sessionId: session.id } } : {}),
        },
        include: { schoolClass: { select: { name: true } } },
        take: 5,
      }),
      prisma.teacher.findMany({
        where: {
          OR: [
            { fullName: { contains: term } },
            { employeeCode: { contains: term } },
            { phone: { contains: term } },
          ],
        },
        take: 5,
      }),
    ]);

    for (const schoolClass of classes) {
      results.push({
        id: schoolClass.id,
        type: 'CLASS',
        title: schoolClass.name,
        subtitle: `Class · Session ${schoolClass.session.name}`,
        href: `/students?classId=${schoolClass.id}`,
      });
    }
    for (const section of sections) {
      results.push({
        id: section.id,
        type: 'SECTION',
        title: `${section.schoolClass.name} — ${section.name}`,
        subtitle: 'Section',
        href: `/students?sectionId=${section.id}`,
      });
    }
    for (const subject of subjects) {
      results.push({
        id: subject.id,
        type: 'SUBJECT',
        title: `${subject.name} (${subject.code})`,
        subtitle: `Subject · ${subject.schoolClass.name}`,
        href: `/academics/subjects?classId=${subject.classId}`,
      });
    }
    for (const teacher of teachers) {
      results.push({
        id: teacher.id,
        type: 'TEACHER',
        title: teacher.fullName,
        subtitle: `Teacher · ${teacher.employeeCode}${
          teacher.designation ? ` · ${teacher.designation}` : ''
        }`,
        href: `/academics/teachers?q=${encodeURIComponent(teacher.employeeCode)}`,
      });
    }
  }

  return NextResponse.json({ results: results.slice(0, 20) });
}
