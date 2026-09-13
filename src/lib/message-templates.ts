/**
 * Message templates for parent communication.
 *
 * A template is plain text with `{placeholder}` tokens. The tokens are
 * substituted per recipient at the moment a campaign is built, so the stored
 * message for each family is exactly what was sent to them.
 */

export type TemplateKey =
  | 'RESULT_PUBLISHED'
  | 'REPORT_CARD_READY'
  | 'DATESHEET_PUBLISHED'
  | 'ROLL_SLIP_AVAILABLE'
  | 'EXAM_ANNOUNCEMENT'
  | 'ABSENCE'
  | 'CONGRATULATIONS'
  | 'ATTENTION_NEEDED'
  | 'CUSTOM';

export type PlaceholderMeta = {
  token: string;
  label: string;
  /** Needs an examination to be selected before it can be filled. */
  needsExam?: boolean;
  /** Needs a processed result for that examination. */
  needsResult?: boolean;
};

export const PLACEHOLDERS: PlaceholderMeta[] = [
  { token: '{academy}', label: 'Academy name' },
  { token: '{academy_short}', label: 'Academy short name' },
  { token: '{academy_phone}', label: 'Academy contact numbers' },
  { token: '{academy_address}', label: 'Academy address' },
  { token: '{student}', label: 'Student name' },
  { token: '{father}', label: 'Father name' },
  { token: '{admission_no}', label: 'Admission number' },
  { token: '{class}', label: 'Class' },
  { token: '{section}', label: 'Section' },
  { token: '{class_roll}', label: 'Class roll number' },
  { token: '{session}', label: 'Academic session' },
  { token: '{exam}', label: 'Examination name', needsExam: true },
  { token: '{exam_roll}', label: 'Examination roll number', needsExam: true },
  { token: '{exam_dates}', label: 'Examination dates', needsExam: true },
  { token: '{percentage}', label: 'Percentage', needsExam: true, needsResult: true },
  { token: '{grade}', label: 'Grade', needsExam: true, needsResult: true },
  { token: '{result}', label: 'Result status', needsExam: true, needsResult: true },
  { token: '{obtained_marks}', label: 'Obtained marks', needsExam: true, needsResult: true },
  { token: '{total_marks}', label: 'Total marks', needsExam: true, needsResult: true },
  { token: '{class_position}', label: 'Class position', needsExam: true, needsResult: true },
  { token: '{result_url}', label: 'Public result portal link' },
];

export type TemplateDefinition = {
  key: TemplateKey;
  label: string;
  description: string;
  /** Whether the template's placeholders require an examination. */
  requiresExam: boolean;
  requiresResult: boolean;
  title: string;
  body: string;
};

/**
 * Written in the plain, respectful register a Lahore academy would use with
 * parents. Every template opens with the family's name and closes with the
 * academy's own name so the recipient always knows who is writing.
 */
export const TEMPLATES: TemplateDefinition[] = [
  {
    key: 'RESULT_PUBLISHED',
    label: 'Result published',
    description: 'Announces a published result with the student’s own marks.',
    requiresExam: true,
    requiresResult: true,
    title: 'Result published',
    body: `Assalam-o-Alaikum {father},

The result of {exam} has been announced.

Student: {student}
Class: {class} — {section}
Roll No: {exam_roll}
Marks: {obtained_marks} / {total_marks}
Percentage: {percentage}
Grade: {grade}
Result: {result}
Class Position: {class_position}

The report card can be collected from the academy office. You may also view the result online at {result_url}

{academy}
{academy_phone}`,
  },
  {
    key: 'REPORT_CARD_READY',
    label: 'Report card ready for collection',
    description: 'Asks the parent to collect the printed report card.',
    requiresExam: true,
    requiresResult: false,
    title: 'Report card ready',
    body: `Assalam-o-Alaikum {father},

The report card of {student} ({class} — {section}) for {exam} is ready and may be collected from the academy office during working hours.

Kindly bring this message or the student's admission number ({admission_no}) with you.

{academy}
{academy_address}
{academy_phone}`,
  },
  {
    key: 'DATESHEET_PUBLISHED',
    label: 'Date sheet published',
    description: 'Tells parents the examination schedule is out.',
    requiresExam: true,
    requiresResult: false,
    title: 'Date sheet published',
    body: `Assalam-o-Alaikum {father},

The date sheet for {exam} has been issued. The examination will be held from {exam_dates}.

Student: {student}
Class: {class} — {section}

Kindly ensure {student} prepares according to the schedule and reaches the academy 15 minutes before each paper.

{academy}
{academy_phone}`,
  },
  {
    key: 'ROLL_SLIP_AVAILABLE',
    label: 'Roll number slip available',
    description: 'Gives the parent the examination roll number.',
    requiresExam: true,
    requiresResult: false,
    title: 'Roll number slip available',
    body: `Assalam-o-Alaikum {father},

The roll number slip of {student} for {exam} is ready.

Roll No: {exam_roll}
Class: {class} — {section}

The slip must be brought to every paper; candidates without it will not be allowed to sit the examination. Kindly collect it from the academy office.

{academy}
{academy_phone}`,
  },
  {
    key: 'EXAM_ANNOUNCEMENT',
    label: 'Examination announcement',
    description: 'A general announcement that an examination is approaching.',
    requiresExam: true,
    requiresResult: false,
    title: 'Examination announcement',
    body: `Assalam-o-Alaikum {father},

{exam} will be held from {exam_dates} at {academy}.

Kindly ensure that {student} of {class} — {section} attends regularly and completes the revision work assigned by the teachers.

{academy}
{academy_phone}`,
  },
  {
    key: 'ABSENCE',
    label: 'Absence notice',
    description: 'Informs the parent that the student was absent.',
    requiresExam: false,
    requiresResult: false,
    title: 'Absence notice',
    body: `Assalam-o-Alaikum {father},

This is to inform you that {student} of {class} — {section} was absent from the academy today.

If the absence is due to illness or any other reason, kindly inform the office so the record may be updated.

{academy}
{academy_phone}`,
  },
  {
    key: 'CONGRATULATIONS',
    label: 'Congratulations on performance',
    description: 'Congratulates a family on an excellent result.',
    requiresExam: true,
    requiresResult: true,
    title: 'Congratulations',
    body: `Assalam-o-Alaikum {father},

Congratulations! {student} has performed excellently in {exam}, securing {percentage} with grade {grade} and position {class_position} in {class}.

The entire faculty is proud of this achievement. We wish {student} continued success.

{academy}
{academy_phone}`,
  },
  {
    key: 'ATTENTION_NEEDED',
    label: 'Performance needs attention',
    description: 'Asks a parent to meet the class teacher about performance.',
    requiresExam: true,
    requiresResult: true,
    title: 'Performance needs attention',
    body: `Assalam-o-Alaikum {father},

In {exam}, {student} of {class} — {section} obtained {obtained_marks} out of {total_marks} ({percentage}), with the result recorded as {result}.

We request you to kindly visit the academy and meet the class teacher so that a plan of improvement can be discussed together.

{academy}
{academy_address}
{academy_phone}`,
  },
  {
    key: 'CUSTOM',
    label: 'Write my own message',
    description: 'A blank message you compose yourself, with placeholders available.',
    requiresExam: false,
    requiresResult: false,
    title: 'Message from the academy',
    body: `Assalam-o-Alaikum {father},



{academy}
{academy_phone}`,
  },
];

/**
 * Short SMS wordings for the same templates.
 *
 * An SMS costs money per 160-character segment, so these are written tight and
 * in plain ASCII: no em dashes, curly quotes or accents, all of which would
 * force UCS-2 encoding and cut each segment to 70 characters.
 */
export const SMS_BODIES: Partial<Record<TemplateKey, string>> = {
  RESULT_PUBLISHED: `{academy_short}: Result of {exam} is announced. {student} ({class}-{section}, Roll {exam_roll}) obtained {obtained_marks}/{total_marks}, {percentage}, Grade {grade}, Result {result}, Position {class_position}. Report card available at the office. Ph {academy_phone}`,

  REPORT_CARD_READY: `{academy_short}: The report card of {student} ({class}-{section}) for {exam} is ready. Please collect it from the academy office during working hours. Ph {academy_phone}`,

  DATESHEET_PUBLISHED: `{academy_short}: Date sheet for {exam} is issued. Papers from {exam_dates}. {student} of {class}-{section} must reach 15 minutes before each paper. Ph {academy_phone}`,

  ROLL_SLIP_AVAILABLE: `{academy_short}: Roll number of {student} ({class}-{section}) for {exam} is {exam_roll}. The roll number slip is compulsory for every paper. Collect it from the office. Ph {academy_phone}`,

  EXAM_ANNOUNCEMENT: `{academy_short}: {exam} will be held from {exam_dates}. Please ensure {student} of {class}-{section} attends regularly and completes the revision work. Ph {academy_phone}`,

  ABSENCE: `{academy_short}: {student} of {class}-{section} was absent from the academy today. Please inform the office if the absence is due to illness. Ph {academy_phone}`,

  CONGRATULATIONS: `{academy_short}: Congratulations! {student} secured {percentage} with Grade {grade} and position {class_position} in {class} in {exam}. Well done. Ph {academy_phone}`,

  ATTENTION_NEEDED: `{academy_short}: In {exam}, {student} of {class}-{section} obtained {obtained_marks}/{total_marks} ({percentage}), result {result}. Please visit the academy to meet the class teacher. Ph {academy_phone}`,

  CUSTOM: `{academy_short}: `,
};

export function templateByKey(key: string): TemplateDefinition {
  return TEMPLATES.find((t) => t.key === key) ?? TEMPLATES[TEMPLATES.length - 1]!;
}

/** The wording to start from for a template on a given channel. */
export function templateBody(key: string, channel: 'WHATSAPP' | 'SMS'): string {
  const template = templateByKey(key);
  if (channel === 'SMS') return SMS_BODIES[template.key] ?? template.body;
  return template.body;
}

/** The values available to a template for one recipient. */
export type TemplateContext = Record<string, string>;

/**
 * Substitutes every `{token}` present in `context`. Tokens with no value —
 * because no examination or result was selected — are replaced with an em dash
 * rather than being left as raw braces in a parent's message.
 */
export function renderTemplate(body: string, context: TemplateContext): string {
  return body.replace(/\{([a-z_]+)\}/gi, (match, token: string) => {
    const value = context[token.toLowerCase()];
    if (value === undefined) return match;
    return value.trim() === '' ? '—' : value;
  });
}

/** Tokens used by a body that the current context cannot fill. */
export function missingTokens(body: string, context: TemplateContext): string[] {
  const used = [...body.matchAll(/\{([a-z_]+)\}/gi)].map((m) => m[1]!.toLowerCase());
  const known = new Set(PLACEHOLDERS.map((p) => p.token.slice(1, -1)));
  return [...new Set(used)].filter((token) => known.has(token) && context[token] === undefined);
}
