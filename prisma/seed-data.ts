/**
 * Demonstration data for The Hope Science Academy.
 *
 * Kept separate from seed.ts so the roster is easy to review and replace with
 * the academy's real students without touching the seeding logic.
 */

export type SeedStudent = {
  name: string;
  father: string;
  mother: string;
  gender: 'MALE' | 'FEMALE';
  /** Current-session placement. */
  className: 'Grade 9' | 'Grade 10';
  sectionName: 'A' | 'B';
  /** Relative academic ability, 0–1, used to generate coherent marks. */
  ability: number;
  /** Improvement drift between examinations. */
  drift: number;
};

export const SEED_TEACHERS = [
  { code: 'HSA-T-001', name: 'Muhammad Asif Raza', gender: 'MALE', designation: 'Senior Instructor', qualification: 'M.Sc Mathematics', phone: '0300-4411201', subject: 'MTH' },
  { code: 'HSA-T-002', name: 'Sadia Kanwal', gender: 'FEMALE', designation: 'Instructor', qualification: 'M.Sc Physics', phone: '0300-4411202', subject: 'PHY' },
  { code: 'HSA-T-003', name: 'Imran Haider', gender: 'MALE', designation: 'Senior Instructor', qualification: 'M.Sc Chemistry', phone: '0300-4411203', subject: 'CHE' },
  { code: 'HSA-T-004', name: 'Ayesha Siddiqui', gender: 'FEMALE', designation: 'Instructor', qualification: 'M.Sc Zoology', phone: '0300-4411204', subject: 'BIO' },
  { code: 'HSA-T-005', name: 'Bilal Ahmed Khan', gender: 'MALE', designation: 'Instructor', qualification: 'BS Computer Science', phone: '0300-4411205', subject: 'CSC' },
  { code: 'HSA-T-006', name: 'Nadia Parveen', gender: 'FEMALE', designation: 'Senior Instructor', qualification: 'M.A English', phone: '0300-4411206', subject: 'ENG' },
  { code: 'HSA-T-007', name: 'Muhammad Usman Ghani', gender: 'MALE', designation: 'Instructor', qualification: 'M.A Urdu', phone: '0300-4411207', subject: 'URD' },
  { code: 'HSA-T-008', name: 'Tahir Mehmood', gender: 'MALE', designation: 'Instructor', qualification: 'M.A Islamic Studies', phone: '0300-4411208', subject: 'ISL' },
  { code: 'HSA-T-009', name: 'Faiza Rehman', gender: 'FEMALE', designation: 'Instructor', qualification: 'M.A Pakistan Studies', phone: '0300-4411209', subject: 'PST' },
] as const;

/**
 * Subject template applied to Grade 9 and Grade 10 (science group), using the
 * marks distribution used by Punjab boards for the Matric science stream.
 */
export const SEED_SUBJECTS = [
  { code: 'ENG', name: 'English', type: 'COMPULSORY', max: 75, pass: 25, theory: 75, practical: 0, practicalPass: 0, order: 1, teacher: 'HSA-T-006' },
  { code: 'URD', name: 'Urdu', type: 'COMPULSORY', max: 75, pass: 25, theory: 75, practical: 0, practicalPass: 0, order: 2, teacher: 'HSA-T-007' },
  { code: 'ISL', name: 'Islamiyat', type: 'COMPULSORY', max: 50, pass: 17, theory: 50, practical: 0, practicalPass: 0, order: 3, teacher: 'HSA-T-008' },
  { code: 'PST', name: 'Pakistan Studies', type: 'COMPULSORY', max: 50, pass: 17, theory: 50, practical: 0, practicalPass: 0, order: 4, teacher: 'HSA-T-009' },
  { code: 'MTH', name: 'Mathematics', type: 'COMPULSORY', max: 75, pass: 25, theory: 75, practical: 0, practicalPass: 0, order: 5, teacher: 'HSA-T-001' },
  { code: 'PHY', name: 'Physics', type: 'PRACTICAL', max: 75, pass: 25, theory: 65, practical: 10, practicalPass: 4, order: 6, teacher: 'HSA-T-002' },
  { code: 'CHE', name: 'Chemistry', type: 'PRACTICAL', max: 75, pass: 25, theory: 65, practical: 10, practicalPass: 4, order: 7, teacher: 'HSA-T-003' },
  { code: 'BIO', name: 'Biology', type: 'PRACTICAL', max: 75, pass: 25, theory: 65, practical: 10, practicalPass: 4, order: 8, teacher: 'HSA-T-004' },
  { code: 'CSC', name: 'Computer Science', type: 'ELECTIVE', max: 75, pass: 25, theory: 65, practical: 10, practicalPass: 4, order: 9, teacher: 'HSA-T-005' },
] as const;

export const SEED_ROOMS = [
  { name: 'Examination Hall A', number: 'HALL-A', building: 'Main Block', capacity: 36, rows: 6, cols: 6 },
  { name: 'Examination Hall B', number: 'HALL-B', building: 'Main Block', capacity: 30, rows: 6, cols: 5 },
  { name: 'Science Room 101', number: 'R-101', building: 'Science Block', capacity: 24, rows: 6, cols: 4 },
  { name: 'Science Room 102', number: 'R-102', building: 'Science Block', capacity: 24, rows: 6, cols: 4 },
];

/**
 * 26 students across Grade 9 (Sections A & B) and Grade 10 (Section A).
 * Saad Bin Tariq and Umaima Noor are deliberately tuned to the same ability so
 * the tie-handling in position calculation is visible in the demo data.
 */
export const SEED_STUDENTS: SeedStudent[] = [
  // ---------------------------------------------------------- Grade 9 — A
  { name: 'Saad Bin Tariq', father: 'Tariq Mehmood', mother: 'Rukhsana Tariq', gender: 'MALE', className: 'Grade 9', sectionName: 'A', ability: 0.95, drift: 0.01 },
  { name: 'Umaima Noor', father: 'Noor ul Hassan', mother: 'Shazia Noor', gender: 'FEMALE', className: 'Grade 9', sectionName: 'A', ability: 0.95, drift: 0.01 },
  { name: 'Hamza Ali Sheikh', father: 'Ali Akbar Sheikh', mother: 'Farzana Ali', gender: 'MALE', className: 'Grade 9', sectionName: 'A', ability: 0.88, drift: 0.03 },
  { name: 'Fatima Zahra', father: 'Ghulam Abbas', mother: 'Kaneez Fatima', gender: 'FEMALE', className: 'Grade 9', sectionName: 'A', ability: 0.86, drift: 0.05 },
  { name: 'Abdul Rehman Malik', father: 'Shahid Malik', mother: 'Nasreen Shahid', gender: 'MALE', className: 'Grade 9', sectionName: 'A', ability: 0.74, drift: 0.09 },
  { name: 'Ayesha Iqbal', father: 'Muhammad Iqbal', mother: 'Samina Iqbal', gender: 'FEMALE', className: 'Grade 9', sectionName: 'A', ability: 0.71, drift: 0.02 },
  { name: 'Muhammad Talha', father: 'Zafar Iqbal', mother: 'Robina Zafar', gender: 'MALE', className: 'Grade 9', sectionName: 'A', ability: 0.63, drift: 0.06 },
  { name: 'Hira Batool', father: 'Sajjad Hussain', mother: 'Zahida Sajjad', gender: 'FEMALE', className: 'Grade 9', sectionName: 'A', ability: 0.58, drift: -0.03 },
  { name: 'Usman Javed', father: 'Javed Akhtar', mother: 'Rabia Javed', gender: 'MALE', className: 'Grade 9', sectionName: 'A', ability: 0.47, drift: 0.08 },
  { name: 'Zainab Riaz', father: 'Riaz Ahmed', mother: 'Shabana Riaz', gender: 'FEMALE', className: 'Grade 9', sectionName: 'A', ability: 0.34, drift: 0.04 },

  // ---------------------------------------------------------- Grade 9 — B
  { name: 'Ali Hassan Qureshi', father: 'Hassan Qureshi', mother: 'Uzma Hassan', gender: 'MALE', className: 'Grade 9', sectionName: 'B', ability: 0.91, drift: 0.02 },
  { name: 'Maryam Shahzad', father: 'Shahzad Anwar', mother: 'Naila Shahzad', gender: 'FEMALE', className: 'Grade 9', sectionName: 'B', ability: 0.84, drift: 0.06 },
  { name: 'Bilal Ahmad', father: 'Ahmad Nawaz', mother: 'Yasmin Ahmad', gender: 'MALE', className: 'Grade 9', sectionName: 'B', ability: 0.77, drift: -0.02 },
  { name: 'Iqra Nadeem', father: 'Nadeem Ashraf', mother: 'Saima Nadeem', gender: 'FEMALE', className: 'Grade 9', sectionName: 'B', ability: 0.69, drift: 0.11 },
  { name: 'Ahsan Raza', father: 'Raza Muhammad', mother: 'Tahira Raza', gender: 'MALE', className: 'Grade 9', sectionName: 'B', ability: 0.6, drift: 0.03 },
  { name: 'Noor Fatima', father: 'Muhammad Aslam', mother: 'Bushra Aslam', gender: 'FEMALE', className: 'Grade 9', sectionName: 'B', ability: 0.52, drift: 0.07 },
  { name: 'Hassan Mehmood', father: 'Mehmood Ahmed', mother: 'Shaheen Mehmood', gender: 'MALE', className: 'Grade 9', sectionName: 'B', ability: 0.41, drift: -0.05 },
  { name: 'Sana Tariq', father: 'Tariq Jameel', mother: 'Nighat Tariq', gender: 'FEMALE', className: 'Grade 9', sectionName: 'B', ability: 0.29, drift: 0.06 },

  // --------------------------------------------------------- Grade 10 — A
  { name: 'Ibrahim Khalid', father: 'Khalid Mahmood', mother: 'Asma Khalid', gender: 'MALE', className: 'Grade 10', sectionName: 'A', ability: 0.93, drift: 0.02 },
  { name: 'Areeba Anwar', father: 'Anwar ul Haq', mother: 'Rehana Anwar', gender: 'FEMALE', className: 'Grade 10', sectionName: 'A', ability: 0.9, drift: 0.04 },
  { name: 'Danish Iqbal', father: 'Iqbal Hussain', mother: 'Fauzia Iqbal', gender: 'MALE', className: 'Grade 10', sectionName: 'A', ability: 0.82, drift: 0.01 },
  { name: 'Khadija Amin', father: 'Amin Ullah', mother: 'Sumaira Amin', gender: 'FEMALE', className: 'Grade 10', sectionName: 'A', ability: 0.79, drift: 0.09 },
  { name: 'Shahzaib Akram', father: 'Akram Pervaiz', mother: 'Nusrat Akram', gender: 'MALE', className: 'Grade 10', sectionName: 'A', ability: 0.66, drift: 0.05 },
  { name: 'Rimsha Younas', father: 'Younas Ali', mother: 'Parveen Younas', gender: 'FEMALE', className: 'Grade 10', sectionName: 'A', ability: 0.57, drift: -0.04 },
  { name: 'Zeeshan Haider', father: 'Haider Ali', mother: 'Shagufta Haider', gender: 'MALE', className: 'Grade 10', sectionName: 'A', ability: 0.45, drift: 0.1 },
  { name: 'Amna Siddique', father: 'Siddique Ahmed', mother: 'Razia Siddique', gender: 'FEMALE', className: 'Grade 10', sectionName: 'A', ability: 0.31, drift: 0.03 },
];

export const LAHORE_AREAS = [
  'Johar Town, Lahore',
  'Wapda Town, Lahore',
  'Model Town, Lahore',
  'Faisal Town, Lahore',
  'Iqbal Town, Lahore',
  'Township, Lahore',
  'Garden Town, Lahore',
  'Muslim Town, Lahore',
];

export const PREVIOUS_SCHOOLS = [
  'Al-Noor Public School, Lahore',
  'City Grammar School, Lahore',
  'Punjab Model School, Lahore',
  'Crescent Public School, Lahore',
  'Beaconhouse School System, Lahore',
  '—',
];
