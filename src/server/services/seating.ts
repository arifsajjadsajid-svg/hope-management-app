import { prisma } from '@/lib/prisma';

export type SeatingStrategy = 'SEQUENTIAL' | 'ALTERNATE';

export type SeatingCandidate = {
  studentId: string;
  studentName: string;
  fatherName: string;
  rollNumber: string;
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
};

export type SeatingOptions = {
  roomIds: string[];
  strategy: SeatingStrategy;
  /** Alternate between classes (true) or between sections (false). */
  mixBy: 'CLASS' | 'SECTION';
};

/**
 * Candidates are the students who hold a roll number for the examination —
 * seating can only be planned once roll numbers exist.
 */
export async function seatingCandidates(examId: string): Promise<SeatingCandidate[]> {
  const rolls = await prisma.rollNumberAllocation.findMany({
    where: { examId },
    include: {
      student: { select: { id: true, fullName: true, fatherName: true } },
      enrollment: {
        include: {
          schoolClass: { select: { id: true, name: true, displayOrder: true } },
          section: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ sequence: 'asc' }, { rollNumber: 'asc' }],
  });

  return rolls.map((roll) => ({
    studentId: roll.studentId,
    studentName: roll.student.fullName,
    fatherName: roll.student.fatherName,
    rollNumber: roll.rollNumber,
    classId: roll.enrollment.classId,
    className: roll.enrollment.schoolClass.name,
    sectionId: roll.enrollment.sectionId,
    sectionName: roll.enrollment.section.name,
  }));
}

/**
 * Interleaves the cohort so that no two neighbouring seats hold students from
 * the same class (or section), which is what "alternate seating" means in an
 * examination hall.
 */
function interleave(candidates: SeatingCandidate[], mixBy: 'CLASS' | 'SECTION'): SeatingCandidate[] {
  const groups = new Map<string, SeatingCandidate[]>();
  for (const candidate of candidates) {
    const key = mixBy === 'CLASS' ? candidate.classId : candidate.sectionId;
    const bucket = groups.get(key);
    if (bucket) bucket.push(candidate);
    else groups.set(key, [candidate]);
  }

  // Largest group first keeps the interleave even when group sizes differ.
  const queues = [...groups.values()].sort((a, b) => b.length - a.length);
  const out: SeatingCandidate[] = [];

  while (out.length < candidates.length) {
    let placedThisPass = false;
    for (const queue of queues) {
      const next = queue.shift();
      if (next) {
        out.push(next);
        placedThisPass = true;
      }
    }
    if (!placedThisPass) break;
    queues.sort((a, b) => b.length - a.length);
  }

  return out;
}

export type SeatingPreviewRoom = {
  roomId: string;
  roomName: string;
  roomNumber: string;
  rows: number;
  cols: number;
  capacity: number;
  seats: {
    seatNumber: string;
    rowNo: number;
    colNo: number;
    student: SeatingCandidate | null;
  }[];
};

/**
 * Lays the cohort out across the chosen rooms without writing to the database.
 */
export async function buildSeatingPlan(
  examId: string,
  options: SeatingOptions,
): Promise<{ rooms: SeatingPreviewRoom[]; unseated: SeatingCandidate[]; totalCapacity: number }> {
  const candidates = await seatingCandidates(examId);
  if (candidates.length === 0) {
    throw new Error('No roll numbers have been generated for this examination yet.');
  }

  const rooms = await prisma.examRoom.findMany({
    where: { id: { in: options.roomIds }, isActive: true },
    orderBy: { roomNumber: 'asc' },
  });
  if (rooms.length === 0) throw new Error('Select at least one active examination room.');

  const ordered =
    options.strategy === 'ALTERNATE' ? interleave(candidates, options.mixBy) : candidates;

  const totalCapacity = rooms.reduce((sum, room) => sum + Math.min(room.capacity, room.rowCount * room.colCount), 0);

  let cursor = 0;
  const planned: SeatingPreviewRoom[] = rooms.map((room) => {
    const usable = Math.min(room.capacity, room.rowCount * room.colCount);
    const seats: SeatingPreviewRoom['seats'] = [];

    let placedInRoom = 0;
    for (let row = 1; row <= room.rowCount; row++) {
      for (let col = 1; col <= room.colCount; col++) {
        if (placedInRoom >= usable) {
          seats.push({ seatNumber: `R${row}C${col}`, rowNo: row, colNo: col, student: null });
          continue;
        }
        const student = ordered[cursor] ?? null;
        if (student) cursor += 1;
        placedInRoom += 1;
        seats.push({ seatNumber: `R${row}C${col}`, rowNo: row, colNo: col, student });
      }
    }

    return {
      roomId: room.id,
      roomName: room.name,
      roomNumber: room.roomNumber,
      rows: room.rowCount,
      cols: room.colCount,
      capacity: usable,
      seats,
    };
  });

  return { rooms: planned, unseated: ordered.slice(cursor), totalCapacity };
}

/** Commits a seating plan, replacing any previous plan for the examination. */
export async function saveSeatingPlan(
  examId: string,
  options: SeatingOptions,
): Promise<{ seated: number; unseated: number; rooms: number }> {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw new Error('Examination not found.');

  const plan = await buildSeatingPlan(examId, options);

  if (plan.unseated.length > 0) {
    throw new Error(
      `Capacity is short by ${plan.unseated.length} seat(s). Add another room or increase room capacity before saving.`,
    );
  }

  const rows = plan.rooms.flatMap((room) =>
    room.seats
      .filter((seat) => seat.student !== null)
      .map((seat) => ({
        examId,
        roomId: room.roomId,
        studentId: seat.student!.studentId,
        seatNumber: seat.seatNumber,
        rowNo: seat.rowNo,
        colNo: seat.colNo,
      })),
  );

  await prisma.$transaction(
    async (tx) => {
      await tx.seatAssignment.deleteMany({ where: { examId } });
      for (let i = 0; i < rows.length; i += 400) {
        await tx.seatAssignment.createMany({ data: rows.slice(i, i + 400) });
      }
    },
    { timeout: 60_000 },
  );

  return { seated: rows.length, unseated: 0, rooms: plan.rooms.length };
}
