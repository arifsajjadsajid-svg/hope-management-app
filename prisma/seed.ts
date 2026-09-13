/**
 * =====================================================================
 *  THE HOPE SCIENCE ACADEMY — database seed
 *  247/E-1, Johar Town, Lahore | 0322-4157001 | 0300-8194789
 * ---------------------------------------------------------------------
 *  Creates the permission catalogue, roles, staff accounts, academy
 *  settings, two academic sessions, classes, sections, subjects, a full
 *  student roster and three examinations at different stages of the
 *  workflow — including processed and published results, merit lists,
 *  certificates and audit history.
 *
 *  Safe to re-run: it clears the demonstration data first.
 * =====================================================================
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PERMISSIONS, ROLE_PERMISSIONS, ALL_PERMISSIONS } from '../src/lib/permissions';
import { ROLE, ROLE_LABELS, ACADEMY_DEFAULTS, AUDIT_ACTIONS } from '../src/lib/constants';
import { DEFAULT_GRADE_BANDS } from '../src/lib/grading';
import { verificationCode } from '../src/lib/verification';
import { processExamResults } from '../src/server/services/result-processing';
import { generateRollNumbers } from '../src/server/services/roll-numbers';
import { saveSeatingPlan } from '../src/server/services/seating';
import {
  SEED_STUDENTS,
  SEED_SUBJECTS,
  SEED_TEACHERS,
  SEED_ROOMS,
  LAHORE_AREAS,
  PREVIOUS_SCHOOLS,
} from './seed-data';

const prisma = new PrismaClient();

/* ------------------------------------------------------------ utilities */

/** Deterministic PRNG so every seed run produces the same demonstration data. */
function mulberry32(seed: number) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20260906);

function pick<T>(items: readonly T[], index: number): T {
  return items[index % items.length]!;
}

function date(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function log(step: string, detail = '') {
  console.log(`  ✓ ${step}${detail ? ` — ${detail}` : ''}`);
}

/* --------------------------------------------------------------- wipe */

async function clearDemoData() {
  // Ordered so foreign keys never block a delete on engines without cascade.
  await prisma.$transaction([
    prisma.resultSubject.deleteMany(),
    prisma.result.deleteMany(),
    prisma.resultWorkflowEvent.deleteMany(),
    prisma.mark.deleteMany(),
    prisma.examAttendance.deleteMany(),
    prisma.invigilationDuty.deleteMany(),
    prisma.seatAssignment.deleteMany(),
    prisma.rollNumberAllocation.deleteMany(),
    prisma.dateSheetEntry.deleteMany(),
    prisma.examSubject.deleteMany(),
    prisma.examSection.deleteMany(),
    prisma.examClass.deleteMany(),
    prisma.certificate.deleteMany(),
    prisma.exam.deleteMany(),
    prisma.notificationRecipient.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.studentPromotion.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.teacherAssignment.deleteMany(),
    prisma.subject.deleteMany(),
    prisma.section.deleteMany(),
    prisma.schoolClass.deleteMany(),
    prisma.academicSession.deleteMany(),
    prisma.examRoom.deleteMany(),
    prisma.importBatch.deleteMany(),
    prisma.backup.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.userSession.deleteMany(),
    prisma.loginAttempt.deleteMany(),
  ]);

  // Users reference teachers and students, so they go before both.
  await prisma.user.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.student.deleteMany();
  await prisma.gradeBand.deleteMany();
  await prisma.gradingScheme.deleteMany();
  await prisma.resultPolicy.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.role.deleteMany();

  log('Cleared previous demonstration data');
}

/* -------------------------------------------------- roles & permissions */

async function seedRolesAndPermissions() {
  for (const code of ALL_PERMISSIONS) {
    const meta = PERMISSIONS[code];
    await prisma.permission.create({
      data: { code, name: meta.name, groupName: meta.group },
    });
  }

  const permissionByCode = new Map(
    (await prisma.permission.findMany()).map((p) => [p.code, p.id]),
  );

  const descriptions: Record<string, string> = {
    SUPER_ADMIN: 'Unrestricted control of the entire system, including users, settings and backups.',
    PRINCIPAL:
      'Academy-wide performance oversight, final result approval and result locking.',
    EXAM_CONTROLLER:
      'Runs the examination cycle: schedules, roll numbers, seating, marks, results and publication.',
    TEACHER: 'Enters and edits marks for assigned classes and subjects before results are locked.',
    STUDENT: 'Secure portal access to date sheets, roll number slips, results and academic history.',
  };

  for (const [code, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.create({
      data: {
        code,
        name: ROLE_LABELS[code] ?? code,
        description: descriptions[code] ?? null,
        isSystem: true,
      },
    });

    await prisma.rolePermission.createMany({
      data: permissions
        .map((permissionCode) => permissionByCode.get(permissionCode))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({ roleId: role.id, permissionId })),
    });
  }

  log('Roles & permissions', `${ALL_PERMISSIONS.length} permissions, ${Object.keys(ROLE_PERMISSIONS).length} roles`);

  return new Map((await prisma.role.findMany()).map((r) => [r.code, r.id]));
}

/* ------------------------------------------------- grading & policies */

async function seedGradingAndPolicy() {
  const scheme = await prisma.gradingScheme.create({
    data: {
      name: 'Academy Standard Grading',
      description:
        'Default percentage-to-grade scale used across all examinations of The Hope Science Academy.',
      useGpa: true,
      isDefault: true,
      bands: {
        create: DEFAULT_GRADE_BANDS.map((band) => ({
          grade: band.grade,
          minPercent: band.minPercent,
          maxPercent: band.maxPercent,
          gpa: band.gpa,
          remarks: band.remarks,
          isFail: band.isFail,
          sortOrder: band.sortOrder,
        })),
      },
    },
  });

  const policy = await prisma.resultPolicy.create({
    data: {
      name: 'Academy Standard Result Policy',
      description:
        'Overall 50% pass (matching the A+ to F grade scale), subject-wise pass required, one compartment subject permitted, competition ranking.',
      overallPassPercent: 50,
      requireSubjectPass: true,
      requirePracticalPass: true,
      compulsoryMustPass: true,
      graceMarksMax: 0,
      graceMaxSubjects: 0,
      compartmentEnabled: true,
      compartmentMaxSubjects: 1,
      absentCountsAsZero: true,
      absentFailsResult: true,
      rankingMethod: 'COMPETITION',
      promotionPercent: 40,
      includeOptionalInTotal: false,
      isDefault: true,
    },
  });

  const testPolicy = await prisma.resultPolicy.create({
    data: {
      name: 'Monthly & Weekly Test Policy',
      description:
        'Lighter policy for class tests: 50% overall, subject-wise pass not enforced, no compartment, dense ranking so tied students share a position.',
      overallPassPercent: 50,
      requireSubjectPass: false,
      requirePracticalPass: false,
      compulsoryMustPass: false,
      compartmentEnabled: false,
      compartmentMaxSubjects: 0,
      absentCountsAsZero: true,
      absentFailsResult: false,
      rankingMethod: 'DENSE',
      promotionPercent: 40,
      isDefault: false,
    },
  });

  log('Grading scheme & result policies', `${DEFAULT_GRADE_BANDS.length} grade bands, 2 policies`);
  return { scheme, policy, testPolicy };
}

/* ------------------------------------------------------------ settings */

async function seedSettings(sessionId: string, gradingId: string, policyId: string) {
  await prisma.academySettings.upsert({
    where: { id: 'academy' },
    update: {
      name: ACADEMY_DEFAULTS.name,
      address: ACADEMY_DEFAULTS.address,
      phone1: ACADEMY_DEFAULTS.phone1,
      phone2: ACADEMY_DEFAULTS.phone2,
      currentSessionId: sessionId,
      defaultGradingId: gradingId,
      defaultPolicyId: policyId,
    },
    create: {
      id: 'academy',
      name: ACADEMY_DEFAULTS.name,
      shortName: ACADEMY_DEFAULTS.shortName,
      tagline: ACADEMY_DEFAULTS.tagline,
      address: ACADEMY_DEFAULTS.address,
      phone1: ACADEMY_DEFAULTS.phone1,
      phone2: ACADEMY_DEFAULTS.phone2,
      email: 'info@hopescienceacademy.edu.pk',
      website: 'www.hopescienceacademy.edu.pk',
      directorName: 'Mr. Muhammad Arif Sajjad',
      principalName: 'Mr. Muhammad Arif Sajjad',
      examControllerName: 'Mr. Imran Haider',
      footerMessage:
        'This is a computer generated document issued by The Hope Science Academy and is valid without a physical signature when verified online.',
      currentSessionId: sessionId,
      defaultGradingId: gradingId,
      defaultPolicyId: policyId,
      resultPortalEnabled: true,
    },
  });
  log('Academy settings', ACADEMY_DEFAULTS.name);
}

/* ------------------------------------------------------------ academics */

async function seedSession(name: string, start: string, end: string, isCurrent: boolean) {
  return prisma.academicSession.create({
    data: { name, startDate: date(start), endDate: date(end), isCurrent, isClosed: !isCurrent },
  });
}

async function seedClassesFor(
  sessionId: string,
  classNames: { name: string; order: number; sections: string[] }[],
  teacherIdByCode: Map<string, string>,
) {
  const classes = new Map<string, { id: string; sections: Map<string, string> }>();

  for (const definition of classNames) {
    const schoolClass = await prisma.schoolClass.create({
      data: { sessionId, name: definition.name, displayOrder: definition.order },
    });

    const sections = new Map<string, string>();
    for (const [index, sectionName] of definition.sections.entries()) {
      const classTeacher = SEED_TEACHERS[(definition.order + index) % SEED_TEACHERS.length]!;
      const section = await prisma.section.create({
        data: {
          classId: schoolClass.id,
          name: sectionName,
          maxStrength: 40,
          classTeacherId: teacherIdByCode.get(classTeacher.code) ?? null,
        },
      });
      sections.set(sectionName, section.id);
    }

    // Subjects
    for (const subject of SEED_SUBJECTS) {
      await prisma.subject.create({
        data: {
          classId: schoolClass.id,
          name: subject.name,
          code: subject.code,
          type: subject.type,
          maxMarks: subject.max,
          passingMarks: subject.pass,
          theoryMarks: subject.theory,
          practicalMarks: subject.practical,
          practicalPassing: subject.practicalPass,
          displayOrder: subject.order,
          teacherId: teacherIdByCode.get(subject.teacher) ?? null,
        },
      });
    }

    classes.set(definition.name, { id: schoolClass.id, sections });
  }

  return classes;
}

/* -------------------------------------------------------------- marks */

const SUBJECT_DIFFICULTY: Record<string, number> = {
  MTH: -0.05,
  PHY: -0.04,
  CHE: -0.03,
  BIO: 0.0,
  ENG: 0.0,
  CSC: 0.05,
  URD: 0.04,
  ISL: 0.07,
  PST: 0.03,
};

/**
 * Produces a coherent mark for a student in one subject. Ability, subject
 * difficulty and an examination-sequence drift combine so the demonstration
 * data shows believable progress between examinations.
 */
function markFor(ability: number, drift: number, subjectCode: string, examIndex: number): number {
  const base = 0.18 + ability * 0.78;
  const difficulty = SUBJECT_DIFFICULTY[subjectCode] ?? 0;
  const noise = (rng() - 0.5) * 0.11;
  const value = base + difficulty + drift * examIndex + noise;
  return Math.min(0.99, Math.max(0.04, value));
}

/* ---------------------------------------------------------------- main */

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  THE HOPE SCIENCE ACADEMY — seeding the database');
  console.log('  247/E-1, Johar Town, Lahore | 0322-4157001 | 0300-8194789');
  console.log('═══════════════════════════════════════════════════════════\n');

  await clearDemoData();
  const roleIdByCode = await seedRolesAndPermissions();
  const { scheme, policy, testPolicy } = await seedGradingAndPolicy();

  /* ------------------------------------------------------------ teachers */

  const teacherIdByCode = new Map<string, string>();
  for (const [teacherIndex, teacher] of SEED_TEACHERS.entries()) {
    const created = await prisma.teacher.create({
      data: {
        employeeCode: teacher.code,
        fullName: teacher.name,
        gender: teacher.gender,
        designation: teacher.designation,
        qualification: teacher.qualification,
        phone: teacher.phone,
        email: `${teacher.code.toLowerCase().replace(/-/g, '.')}@hopescienceacademy.edu.pk`,
        address: pick(LAHORE_AREAS, teacherIndex),
        joiningDate: date('2024-08-01'),
        isActive: true,
      },
    });
    teacherIdByCode.set(teacher.code, created.id);
  }
  log('Teachers', `${SEED_TEACHERS.length} staff members`);

  /* ------------------------------------------------------------ sessions */

  const previousSession = await seedSession('2025-2026', '2025-08-01', '2026-06-30', false);
  const currentSession = await seedSession('2026-2027', '2026-08-01', '2027-06-30', true);
  log('Academic sessions', '2025-2026 (closed), 2026-2027 (current)');

  await seedSettings(currentSession.id, scheme.id, policy.id);

  /* ------------------------------------------------------------- classes */

  const previousClasses = await seedClassesFor(
    previousSession.id,
    [
      { name: 'Grade 8', order: 8, sections: ['A'] },
      { name: 'Grade 9', order: 9, sections: ['A'] },
    ],
    teacherIdByCode,
  );

  const currentClasses = await seedClassesFor(
    currentSession.id,
    [
      { name: 'Grade 9', order: 9, sections: ['A', 'B'] },
      { name: 'Grade 10', order: 10, sections: ['A'] },
    ],
    teacherIdByCode,
  );
  log('Classes & sections', 'Grade 9 (A, B) and Grade 10 (A) for 2026-2027');

  /* -------------------------------------------- teacher subject assignments */

  const currentSubjects = await prisma.subject.findMany({
    where: { schoolClass: { sessionId: currentSession.id } },
  });
  const currentSections = await prisma.section.findMany({
    where: { schoolClass: { sessionId: currentSession.id } },
  });

  for (const subject of currentSubjects) {
    if (!subject.teacherId) continue;
    for (const section of currentSections.filter((s) => s.classId === subject.classId)) {
      await prisma.teacherAssignment.create({
        data: { teacherId: subject.teacherId, subjectId: subject.id, sectionId: section.id },
      });
    }
  }
  log('Teacher assignments', `${currentSubjects.length} subject/section links`);

  /* ------------------------------------------------------------- students */

  const studentIds: {
    id: string;
    seed: (typeof SEED_STUDENTS)[number];
    currentEnrollmentId: string;
  }[] = [];

  for (const [index, seed] of SEED_STUDENTS.entries()) {
    const admissionNumber = `HSA-2026-${String(index + 1).padStart(4, '0')}`;
    const student = await prisma.student.create({
      data: {
        admissionNumber,
        registrationNo: `REG-26-${String(1000 + index)}`,
        fullName: seed.name,
        fatherName: seed.father,
        motherName: seed.mother,
        guardianName: seed.father,
        dateOfBirth: date(`${2010 - (seed.className === 'Grade 10' ? 1 : 0)}-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 27) + 1).padStart(2, '0')}`),
        gender: seed.gender,
        bformCnic: `35202-${String(1000000 + index * 7919).slice(0, 7)}-${(index % 9) + 1}`,
        admissionDate: date('2026-08-05'),
        parentPhone: `0300-${String(4200000 + index * 137).slice(0, 7)}`,
        studentPhone: index % 3 === 0 ? `0321-${String(5300000 + index * 211).slice(0, 7)}` : null,
        whatsappNumber: `0300-${String(4200000 + index * 137).slice(0, 7)}`,
        email: `${seed.name.toLowerCase().replace(/[^a-z]+/g, '.')}@student.hopescienceacademy.edu.pk`,
        address: `House ${100 + index * 3}, Block ${String.fromCharCode(65 + (index % 6))}, ${pick(LAHORE_AREAS, index)}`,
        previousSchool: pick(PREVIOUS_SCHOOLS, index),
        emergencyContact: `0333-${String(7100000 + index * 173).slice(0, 7)}`,
        notes: index === 4 ? 'Requires seating near the front due to weak eyesight.' : null,
        status: 'ACTIVE',
      },
    });

    // ---- previous session enrollment (one class lower) for academic history
    const previousClassName = seed.className === 'Grade 10' ? 'Grade 9' : 'Grade 8';
    const previousClass = previousClasses.get(previousClassName)!;
    await prisma.enrollment.create({
      data: {
        studentId: student.id,
        sessionId: previousSession.id,
        classId: previousClass.id,
        sectionId: previousClass.sections.get('A')!,
        rollNumber: String(index + 1).padStart(2, '0'),
        status: 'PROMOTED',
      },
    });

    // ---- current session enrollment
    const currentClass = currentClasses.get(seed.className)!;
    const sectionId = currentClass.sections.get(seed.sectionName)!;
    const rollWithinSection =
      SEED_STUDENTS.filter(
        (s, i) => i <= index && s.className === seed.className && s.sectionName === seed.sectionName,
      ).length;

    const enrollment = await prisma.enrollment.create({
      data: {
        studentId: student.id,
        sessionId: currentSession.id,
        classId: currentClass.id,
        sectionId,
        rollNumber: String(rollWithinSection).padStart(2, '0'),
        status: 'ACTIVE',
      },
    });

    // ---- promotion history record
    await prisma.studentPromotion.create({
      data: {
        studentId: student.id,
        fromSessionId: previousSession.id,
        toSessionId: currentSession.id,
        fromClassId: previousClass.id,
        toClassId: currentClass.id,
        fromSectionId: previousClass.sections.get('A')!,
        toSectionId: sectionId,
        action: 'PROMOTED',
        remarks: 'Promoted on the 2025-2026 annual examination result.',
        processedByName: 'System (seed)',
      },
    });

    studentIds.push({ id: student.id, seed, currentEnrollmentId: enrollment.id });
  }
  log('Students', `${SEED_STUDENTS.length} enrolled, with 2025-2026 history and promotion records`);

  /* ---------------------------------------------------------------- rooms */

  const roomIds: string[] = [];
  for (const room of SEED_ROOMS) {
    const created = await prisma.examRoom.create({
      data: {
        name: room.name,
        roomNumber: room.number,
        building: room.building,
        capacity: room.capacity,
        rowCount: room.rows,
        colCount: room.cols,
      },
    });
    roomIds.push(created.id);
  }
  log('Examination rooms', `${SEED_ROOMS.length} rooms`);

  /* ----------------------------------------------------------------- users */

  const hash = (value: string) => bcrypt.hash(value, 12);

  const superAdmin = await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@hopescienceacademy.edu.pk',
      passwordHash: await hash('Hope@Admin2026'),
      fullName: 'Muhammad Arif Sajjad',
      phone: ACADEMY_DEFAULTS.phone1,
      roleId: roleIdByCode.get(ROLE.SUPER_ADMIN)!,
      // The most privileged account must not keep the password shipped with the system.
      mustChangePassword: true,
    },
  });

  await prisma.user.create({
    data: {
      username: 'principal',
      email: 'principal@hopescienceacademy.edu.pk',
      passwordHash: await hash('Hope@Principal2026'),
      fullName: 'Prof. Muhammad Arif Sajjad',
      phone: ACADEMY_DEFAULTS.phone2,
      roleId: roleIdByCode.get(ROLE.PRINCIPAL)!,
    },
  });

  await prisma.user.create({
    data: {
      username: 'controller',
      email: 'controller@hopescienceacademy.edu.pk',
      passwordHash: await hash('Hope@Exams2026'),
      fullName: 'Imran Haider',
      phone: '0300-4411203',
      roleId: roleIdByCode.get(ROLE.EXAM_CONTROLLER)!,
    },
  });

  // Teacher logins for the first three staff members.
  for (const teacher of SEED_TEACHERS.slice(0, 3)) {
    const user = await prisma.user.create({
      data: {
        username: teacher.name.toLowerCase().split(' ').slice(-1)[0]!.replace(/[^a-z]/g, ''),
        email: `${teacher.code.toLowerCase().replace(/-/g, '.')}@hopescienceacademy.edu.pk`,
        passwordHash: await hash('Hope@Teacher2026'),
        fullName: teacher.name,
        phone: teacher.phone,
        roleId: roleIdByCode.get(ROLE.TEACHER)!,
      },
    });
    await prisma.teacher.update({
      where: { id: teacherIdByCode.get(teacher.code)! },
      data: { userId: user.id },
    });
  }

  // Student / parent portal accounts for the first two students.
  for (const entry of studentIds.slice(0, 2)) {
    const student = await prisma.student.findUniqueOrThrow({ where: { id: entry.id } });
    await prisma.user.create({
      data: {
        username: student.admissionNumber.toLowerCase(),
        email: student.email,
        passwordHash: await hash('Hope@Student2026'),
        fullName: student.fullName,
        phone: student.parentPhone,
        roleId: roleIdByCode.get(ROLE.STUDENT)!,
        studentId: student.id,
      },
    });
  }
  log('User accounts', '1 super admin, 1 principal, 1 controller, 3 teachers, 2 student portals');

  /* ------------------------------------------------------------ exam maker */

  async function createExam(input: {
    name: string;
    type: string;
    sessionId: string;
    classIds: string[];
    sectionIds: string[];
    start: string;
    end: string;
    publishDate?: string;
    maxScale: number;
    policyId: string;
    rollPrefix: string;
    instructions: string;
    status: string;
  }) {
    const exam = await prisma.exam.create({
      data: {
        name: input.name,
        type: input.type,
        sessionId: input.sessionId,
        startDate: date(input.start),
        endDate: date(input.end),
        resultPublishDate: input.publishDate ? date(input.publishDate) : null,
        instructions: input.instructions,
        examCenter: `${ACADEMY_DEFAULTS.name}, ${ACADEMY_DEFAULTS.address}`,
        status: input.status,
        gradingSchemeId: scheme.id,
        resultPolicyId: input.policyId,
        rollNumberPrefix: input.rollPrefix,
        rollNumberMethod: 'CLASS_WISE',
        rollNumberStart: 1,
        rollNumberPadding: 3,
      },
    });

    await prisma.examClass.createMany({
      data: input.classIds.map((classId) => ({ examId: exam.id, classId })),
    });
    await prisma.examSection.createMany({
      data: input.sectionIds.map((sectionId) => ({ examId: exam.id, sectionId })),
    });

    // Exam subjects, scaled from the class subject definitions.
    const subjects = await prisma.subject.findMany({
      where: { classId: { in: input.classIds }, isActive: true },
      orderBy: { displayOrder: 'asc' },
    });

    for (const subject of subjects) {
      const scale = input.maxScale;
      const max = Math.round(subject.maxMarks * scale);
      const practical = Math.round(subject.practicalMarks * scale);
      await prisma.examSubject.create({
        data: {
          examId: exam.id,
          subjectId: subject.id,
          maxMarks: max,
          passingMarks: Math.round(max * 0.3333),
          theoryMarks: max - practical,
          practicalMarks: practical,
          practicalPassing: practical > 0 ? Math.max(1, Math.round(practical * 0.4)) : 0,
          displayOrder: subject.displayOrder,
        },
      });
    }

    return exam;
  }

  async function buildDateSheet(examId: string, startISO: string, classIds: string[]) {
    const examSubjects = await prisma.examSubject.findMany({
      where: { examId },
      include: { subject: true },
      orderBy: { displayOrder: 'asc' },
    });

    // One paper per day, per class, skipping Sundays.
    const byOrder = new Map<number, typeof examSubjects>();
    for (const es of examSubjects) {
      const bucket = byOrder.get(es.displayOrder) ?? [];
      bucket.push(es);
      byOrder.set(es.displayOrder, bucket);
    }

    const orders = [...byOrder.keys()].sort((a, b) => a - b);
    const cursor = new Date(`${startISO}T00:00:00.000Z`);
    const rooms = await prisma.examRoom.findMany({ orderBy: { roomNumber: 'asc' } });

    for (const [dayIndex, order] of orders.entries()) {
      while (cursor.getUTCDay() === 0) cursor.setUTCDate(cursor.getUTCDate() + 1);
      const paperDate = new Date(cursor);

      for (const es of byOrder.get(order)!) {
        if (!classIds.includes(es.subject.classId)) continue;
        await prisma.dateSheetEntry.create({
          data: {
            examId,
            examSubjectId: es.id,
            classId: es.subject.classId,
            sectionId: null,
            paperDate,
            startTime: '09:00',
            endTime: es.maxMarks >= 60 ? '12:00' : '11:00',
            durationMinutes: es.maxMarks >= 60 ? 180 : 120,
            roomId: rooms[dayIndex % rooms.length]?.id ?? null,
            instructions:
              'Candidates must be seated 15 minutes before the paper begins. Mobile phones are strictly prohibited.',
          },
        });
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  async function enterMarks(
    examId: string,
    examIndex: number,
    specials: { studentName: string; subjectCode: string; status: string }[] = [],
  ) {
    const examSubjects = await prisma.examSubject.findMany({
      where: { examId },
      include: { subject: true },
    });
    const exam = await prisma.exam.findUniqueOrThrow({
      where: { id: examId },
      include: { examClasses: true },
    });
    const classIds = exam.examClasses.map((c) => c.classId);

    const enrollments = await prisma.enrollment.findMany({
      where: { sessionId: exam.sessionId, classId: { in: classIds } },
      include: { student: true },
      orderBy: { student: { admissionNumber: 'asc' } },
    });

    const specialLookup = new Map(
      specials.map((s) => [`${s.studentName}|${s.subjectCode}`, s.status]),
    );

    // Saad and Umaima are given identical papers so tied positions appear.
    const tiedSource = new Map<string, { theory: number | null; practical: number | null; obtained: number }>();

    const rows: {
      examId: string;
      examSubjectId: string;
      studentId: string;
      theoryMarks: number | null;
      practicalMarks: number | null;
      obtainedMarks: number | null;
      specialStatus: string;
      isFinalized: boolean;
    }[] = [];

    for (const enrollment of enrollments) {
      const seedRow = SEED_STUDENTS.find((s) => s.name === enrollment.student.fullName);
      const ability = seedRow?.ability ?? 0.6;
      const drift = seedRow?.drift ?? 0;

      for (const es of examSubjects) {
        if (es.subject.classId !== enrollment.classId) continue;

        const special = specialLookup.get(`${enrollment.student.fullName}|${es.subject.code}`);
        if (special) {
          rows.push({
            examId,
            examSubjectId: es.id,
            studentId: enrollment.studentId,
            theoryMarks: null,
            practicalMarks: null,
            obtainedMarks: null,
            specialStatus: special,
            isFinalized: true,
          });
          continue;
        }

        let theory: number | null;
        let practical: number | null;
        let obtained: number;

        const tieKey = `${es.id}`;
        if (enrollment.student.fullName === 'Umaima Noor' && tiedSource.has(tieKey)) {
          const source = tiedSource.get(tieKey)!;
          theory = source.theory;
          practical = source.practical;
          obtained = source.obtained;
        } else {
          const ratio = markFor(ability, drift, es.subject.code, examIndex);
          obtained = Math.round(es.maxMarks * ratio);
          if (es.practicalMarks > 0) {
            practical = Math.min(
              es.practicalMarks,
              Math.max(0, Math.round(es.practicalMarks * Math.min(1, ratio + 0.12))),
            );
            theory = Math.max(0, Math.min(es.theoryMarks, obtained - practical));
            obtained = theory + practical;
          } else {
            theory = obtained;
            practical = null;
          }

          if (enrollment.student.fullName === 'Saad Bin Tariq') {
            tiedSource.set(tieKey, { theory, practical, obtained });
          }
        }

        rows.push({
          examId,
          examSubjectId: es.id,
          studentId: enrollment.studentId,
          theoryMarks: theory,
          practicalMarks: practical,
          obtainedMarks: obtained,
          specialStatus: 'NONE',
          isFinalized: true,
        });
      }
    }

    for (let i = 0; i < rows.length; i += 400) {
      await prisma.mark.createMany({ data: rows.slice(i, i + 400) });
    }
    return rows.length;
  }

  async function markAttendance(examId: string) {
    const entries = await prisma.dateSheetEntry.findMany({ where: { examId } });
    const marks = await prisma.mark.findMany({ where: { examId } });
    const absentBySubject = new Map<string, Set<string>>();
    for (const mark of marks) {
      if (mark.specialStatus === 'ABS' || mark.specialStatus === 'MED') {
        const set = absentBySubject.get(mark.examSubjectId) ?? new Set<string>();
        set.add(mark.studentId);
        absentBySubject.set(mark.examSubjectId, set);
      }
    }

    const exam = await prisma.exam.findUniqueOrThrow({
      where: { id: examId },
      include: { examClasses: true },
    });
    const enrollments = await prisma.enrollment.findMany({
      where: {
        sessionId: exam.sessionId,
        classId: { in: exam.examClasses.map((c) => c.classId) },
      },
    });

    const rows: {
      examId: string;
      dateSheetEntryId: string;
      studentId: string;
      status: string;
      markedByName: string;
    }[] = [];

    for (const entry of entries) {
      const absentees = absentBySubject.get(entry.examSubjectId) ?? new Set<string>();
      for (const enrollment of enrollments.filter((e) => e.classId === entry.classId)) {
        rows.push({
          examId,
          dateSheetEntryId: entry.id,
          studentId: enrollment.studentId,
          status: absentees.has(enrollment.studentId) ? 'ABSENT' : 'PRESENT',
          markedByName: 'Imran Haider (Examination Controller)',
        });
      }
    }

    for (let i = 0; i < rows.length; i += 400) {
      await prisma.examAttendance.createMany({ data: rows.slice(i, i + 400) });
    }
    return rows.length;
  }

  async function assignInvigilators(examId: string) {
    const entries = await prisma.dateSheetEntry.findMany({
      where: { examId },
      orderBy: { paperDate: 'asc' },
    });
    const rooms = await prisma.examRoom.findMany({ orderBy: { roomNumber: 'asc' } });
    const teacherIds = [...teacherIdByCode.values()];

    let cursor = 0;
    const seen = new Set<string>();
    for (const entry of entries) {
      for (const room of rooms.slice(0, 2)) {
        const teacherId = teacherIds[cursor % teacherIds.length]!;
        cursor += 1;
        const key = `${entry.id}|${room.id}|${teacherId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        await prisma.invigilationDuty.create({
          data: {
            examId,
            dateSheetEntryId: entry.id,
            roomId: room.id,
            teacherId,
            dutyRole: cursor % 5 === 0 ? 'SUPERINTENDENT' : 'INVIGILATOR',
          },
        });
      }
    }
  }

  /* -------------------------------------------- previous-session examination */

  const prevClassIds = [previousClasses.get('Grade 8')!.id, previousClasses.get('Grade 9')!.id];
  const prevSectionIds = [
    previousClasses.get('Grade 8')!.sections.get('A')!,
    previousClasses.get('Grade 9')!.sections.get('A')!,
  ];

  const annualPrev = await createExam({
    name: 'Annual Examination 2026',
    type: 'ANNUAL',
    sessionId: previousSession.id,
    classIds: prevClassIds,
    sectionIds: prevSectionIds,
    start: '2026-05-04',
    end: '2026-05-20',
    publishDate: '2026-06-05',
    maxScale: 1,
    policyId: policy.id,
    rollPrefix: 'AN26-',
    instructions:
      'Annual examination of the 2025-2026 session conducted under the supervision of the Examination Controller.',
    status: 'PUBLISHED',
  });
  await buildDateSheet(annualPrev.id, '2026-05-04', prevClassIds);
  await generateRollNumbers(annualPrev.id);
  await enterMarks(annualPrev.id, 0);
  await markAttendance(annualPrev.id);
  await processExamResults(annualPrev.id);
  await prisma.result.updateMany({ where: { examId: annualPrev.id }, data: { isPublished: true } });
  await prisma.exam.update({
    where: { id: annualPrev.id },
    data: {
      status: 'PUBLISHED',
      resultLocked: true,
      approvedAt: date('2026-06-03'),
      approvedByName: 'Prof. Muhammad Arif Sajjad',
      publishedAt: date('2026-06-05'),
      lockedAt: date('2026-06-05'),
    },
  });
  log('Examination', 'Annual Examination 2026 (2025-2026) — published & locked');

  /* --------------------------------------------- current-session examinations */

  const curClassIds = [currentClasses.get('Grade 9')!.id, currentClasses.get('Grade 10')!.id];
  const curSectionIds = [
    currentClasses.get('Grade 9')!.sections.get('A')!,
    currentClasses.get('Grade 9')!.sections.get('B')!,
    currentClasses.get('Grade 10')!.sections.get('A')!,
  ];

  // 1) Monthly test — published
  const monthly = await createExam({
    name: 'Monthly Test — September 2026',
    type: 'MONTHLY_TEST',
    sessionId: currentSession.id,
    classIds: curClassIds,
    sectionIds: curSectionIds,
    start: '2026-09-21',
    end: '2026-09-25',
    publishDate: '2026-09-30',
    maxScale: 1 / 3,
    policyId: testPolicy.id,
    rollPrefix: 'MT09-',
    instructions:
      'Monthly assessment covering the syllabus taught during September 2026. Duration: two hours per paper.',
    status: 'PUBLISHED',
  });
  await buildDateSheet(monthly.id, '2026-09-21', curClassIds);
  await generateRollNumbers(monthly.id);
  await enterMarks(monthly.id, 0, [
    { studentName: 'Hassan Mehmood', subjectCode: 'CHE', status: 'ABS' },
  ]);
  await markAttendance(monthly.id);
  await processExamResults(monthly.id);
  await prisma.result.updateMany({ where: { examId: monthly.id }, data: { isPublished: true } });
  await prisma.exam.update({
    where: { id: monthly.id },
    data: {
      status: 'PUBLISHED',
      approvedAt: date('2026-09-29'),
      approvedByName: 'Prof. Muhammad Arif Sajjad',
      publishedAt: date('2026-09-30'),
    },
  });
  log('Examination', 'Monthly Test — September 2026 — published');

  // 2) First term — published, locked, with seating, invigilation, certificates
  const firstTerm = await createExam({
    name: 'First Term Examination 2026',
    type: 'FIRST_TERM',
    sessionId: currentSession.id,
    classIds: curClassIds,
    sectionIds: curSectionIds,
    start: '2026-11-16',
    end: '2026-11-28',
    publishDate: '2026-12-08',
    maxScale: 1,
    policyId: policy.id,
    rollPrefix: 'FT26-',
    instructions:
      'First term examination of the 2026-2027 session. Candidates must bring their roll number slip and report to the allotted room 15 minutes before the paper.',
    status: 'PUBLISHED',
  });
  await buildDateSheet(firstTerm.id, '2026-11-16', curClassIds);
  await generateRollNumbers(firstTerm.id);
  await saveSeatingPlan(firstTerm.id, {
    roomIds,
    strategy: 'ALTERNATE',
    mixBy: 'CLASS',
  });
  await assignInvigilators(firstTerm.id);
  await enterMarks(firstTerm.id, 1, [
    { studentName: 'Rimsha Younas', subjectCode: 'PST', status: 'ABS' },
    { studentName: 'Usman Javed', subjectCode: 'BIO', status: 'MED' },
  ]);
  await markAttendance(firstTerm.id);
  const summary = await processExamResults(firstTerm.id);
  await prisma.result.updateMany({ where: { examId: firstTerm.id }, data: { isPublished: true } });
  await prisma.exam.update({
    where: { id: firstTerm.id },
    data: {
      status: 'PUBLISHED',
      resultLocked: true,
      approvedAt: date('2026-12-06'),
      approvedByName: 'Prof. Muhammad Arif Sajjad',
      publishedAt: date('2026-12-08'),
      lockedAt: date('2026-12-08'),
    },
  });

  for (const event of [
    { action: 'PROCESS', from: 'MARKS_ENTRY', to: 'RESULT_PROCESSING', reason: 'Marks entry completed for all classes.' },
    { action: 'VERIFY', from: 'RESULT_PROCESSING', to: 'RESULT_PROCESSING', reason: 'Verification run: no critical issues found.' },
    { action: 'SUBMIT_APPROVAL', from: 'RESULT_PROCESSING', to: 'AWAITING_APPROVAL', reason: 'Submitted to the Principal for approval.' },
    { action: 'APPROVE', from: 'AWAITING_APPROVAL', to: 'AWAITING_APPROVAL', reason: 'Approved by the Principal / Director.' },
    { action: 'PUBLISH', from: 'AWAITING_APPROVAL', to: 'PUBLISHED', reason: 'Results published to students and parents.' },
    { action: 'LOCK', from: 'PUBLISHED', to: 'LOCKED', reason: 'Locked after publication; marks can no longer be edited.' },
  ]) {
    await prisma.resultWorkflowEvent.create({
      data: {
        examId: firstTerm.id,
        action: event.action,
        fromStatus: event.from,
        toStatus: event.to,
        reason: event.reason,
        userName: 'Prof. Muhammad Arif Sajjad',
      },
    });
  }
  log(
    'Examination',
    `First Term Examination 2026 — ${summary.studentsProcessed} results, ${summary.passed} pass, avg ${summary.averagePercentage}%`,
  );

  // 3) Mid term — scheduled, date sheet and roll numbers ready, no marks yet
  const midTerm = await createExam({
    name: 'Mid Term Examination 2027',
    type: 'MID_TERM',
    sessionId: currentSession.id,
    classIds: curClassIds,
    sectionIds: curSectionIds,
    start: '2027-02-15',
    end: '2027-02-26',
    publishDate: '2027-03-08',
    maxScale: 1,
    policyId: policy.id,
    rollPrefix: 'MID27-',
    instructions:
      'Mid term examination of the 2026-2027 session. Roll number slips are available for download from the student portal.',
    status: 'SCHEDULED',
  });
  await buildDateSheet(midTerm.id, '2027-02-15', curClassIds);
  await generateRollNumbers(midTerm.id);
  await assignInvigilators(midTerm.id);
  log('Examination', 'Mid Term Examination 2027 — scheduled (date sheet + roll numbers ready)');

  /* ----------------------------------------------------------- certificates */

  const toppers = await prisma.result.findMany({
    where: { examId: firstTerm.id, classPosition: { in: [1, 2, 3] } },
    include: { student: true, enrollment: { include: { schoolClass: true } } },
    orderBy: { percentage: 'desc' },
  });

  const certificateTitle: Record<number, { type: string; title: string }> = {
    1: { type: 'FIRST_POSITION', title: 'Certificate of First Position' },
    2: { type: 'SECOND_POSITION', title: 'Certificate of Second Position' },
    3: { type: 'THIRD_POSITION', title: 'Certificate of Third Position' },
  };

  for (const result of toppers) {
    const meta = certificateTitle[result.classPosition!];
    if (!meta) continue;
    await prisma.certificate.create({
      data: {
        studentId: result.studentId,
        examId: firstTerm.id,
        type: meta.type,
        title: meta.title,
        description: `Awarded for securing position ${result.classPosition} in ${result.enrollment.schoolClass.name} with ${result.percentage.toFixed(2)}% in the First Term Examination 2026.`,
        className: result.enrollment.schoolClass.name,
        sessionName: currentSession.name,
        issuedDate: date('2026-12-12'),
        verificationCode: verificationCode('CT'),
        issuedById: superAdmin.id,
      },
    });
  }
  log('Certificates', `${toppers.length} position certificates issued`);

  /* --------------------------------------------------------- notifications */

  const allUsers = await prisma.user.findMany({ select: { id: true } });

  const notifications = [
    {
      title: 'First Term Examination 2026 results published',
      message:
        'Results of the First Term Examination 2026 are now available. Report cards can be downloaded from the Results section and by students from the portal.',
      type: 'RESULT_PUBLISHED',
      link: '/results',
    },
    {
      title: 'Mid Term Examination 2027 date sheet issued',
      message:
        'The date sheet for the Mid Term Examination 2027 (15–26 February 2027) has been published. Papers begin at 09:00 AM.',
      type: 'DATESHEET_PUBLISHED',
      link: '/exams/date-sheets',
    },
    {
      title: 'Roll number slips available',
      message:
        'Roll number slips for the Mid Term Examination 2027 are ready for printing. Candidates must carry the slip to every paper.',
      type: 'ROLL_SLIP_AVAILABLE',
      link: '/exams/roll-slips',
    },
  ];

  for (const notification of notifications) {
    const created = await prisma.notification.create({
      data: {
        title: notification.title,
        message: notification.message,
        type: notification.type,
        channels: 'IN_APP',
        audience: 'ALL',
        link: notification.link,
        createdByName: 'Imran Haider (Examination Controller)',
      },
    });
    await prisma.notificationRecipient.createMany({
      data: allUsers.map((user) => ({
        notificationId: created.id,
        userId: user.id,
        deliveryStatus: 'DELIVERED',
      })),
    });
  }
  log('Notifications', `${notifications.length} announcements delivered`);

  /* ------------------------------------------------------------ audit log */

  const auditSeed = [
    { action: AUDIT_ACTIONS.SETTINGS_UPDATED, description: 'Academy profile configured for The Hope Science Academy.' },
    { action: AUDIT_ACTIONS.SESSION_CREATED, description: 'Academic session 2026-2027 created and set as current.' },
    { action: AUDIT_ACTIONS.EXAM_CREATED, description: 'First Term Examination 2026 created.' },
    { action: AUDIT_ACTIONS.ROLL_NUMBERS_GENERATED, description: 'Roll numbers generated class-wise for the First Term Examination 2026.' },
    { action: AUDIT_ACTIONS.SEATING_GENERATED, description: 'Alternate seating plan generated across 4 examination rooms.' },
    { action: AUDIT_ACTIONS.MARKS_ENTERED, description: 'Marks entered for all subjects of the First Term Examination 2026.' },
    { action: AUDIT_ACTIONS.RESULT_GENERATED, description: 'Results processed for the First Term Examination 2026.' },
    { action: AUDIT_ACTIONS.RESULT_APPROVED, description: 'First Term Examination 2026 results approved by the Principal.' },
    { action: AUDIT_ACTIONS.RESULT_PUBLISHED, description: 'First Term Examination 2026 results published.' },
    { action: AUDIT_ACTIONS.RESULT_LOCKED, description: 'First Term Examination 2026 results locked.' },
  ];

  for (const [index, entry] of auditSeed.entries()) {
    await prisma.auditLog.create({
      data: {
        userId: superAdmin.id,
        userName: 'Muhammad Arif Sajjad',
        userRole: ROLE.SUPER_ADMIN,
        action: entry.action,
        description: entry.description,
        severity: entry.action.includes('LOCK') || entry.action.includes('PUBLISH') ? 'WARNING' : 'INFO',
        createdAt: new Date(Date.UTC(2026, 11, 8, 9, index * 7)),
      },
    });
  }
  log('Audit log', `${auditSeed.length} historical entries`);

  /* ------------------------------------------------------------- summary */

  const counts = {
    students: await prisma.student.count(),
    exams: await prisma.exam.count(),
    marks: await prisma.mark.count(),
    results: await prisma.result.count(),
    subjects: await prisma.subject.count(),
  };

  console.log('\n───────────────────────────────────────────────────────────');
  console.log('  Seed complete');
  console.log('───────────────────────────────────────────────────────────');
  console.log(`  Students ....... ${counts.students}`);
  console.log(`  Subjects ....... ${counts.subjects}`);
  console.log(`  Examinations ... ${counts.exams}`);
  console.log(`  Marks .......... ${counts.marks}`);
  console.log(`  Results ........ ${counts.results}`);
  console.log('\n  Sign-in accounts');
  console.log('  ─────────────────────────────────────────────────────────');
  console.log('  Super Admin ............ admin       / Hope@Admin2026');
  console.log('                           (you will be asked to set a new password)');
  console.log('  Principal / Director ... principal   / Hope@Principal2026');
  console.log('  Examination Controller . controller  / Hope@Exams2026');
  console.log('  Teacher ................ raza        / Hope@Teacher2026');
  console.log('  Teacher ................ kanwal      / Hope@Teacher2026');
  console.log('  Teacher ................ haider      / Hope@Teacher2026');
  console.log('  Student / Parent ....... hsa-2026-0001 / Hope@Student2026');
  console.log('  Student / Parent ....... hsa-2026-0002 / Hope@Student2026');
  console.log('\n  Change these passwords from Users & Roles before going live.\n');
}

main()
  .catch((error) => {
    console.error('\n✗ Seed failed:\n', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
