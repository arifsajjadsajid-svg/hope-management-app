# The Hope Science Academy — Academic & Examination Management System

**247/E-1, Johar Town, Lahore · 0322-4157001 | 0300-8194789**

A production-grade, database-driven system that runs the academy's entire examination
cycle — from student registration through to published results, report cards, merit
lists and academic history.

---

Built with Next.js 15, React 19, TypeScript, Prisma and PostgreSQL.

---

## Running it locally

You need Node.js 20+ and a PostgreSQL database. A free
[Neon](https://neon.tech) database works and needs nothing installed.

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL and DIRECT_URL
npm run setup               # apply migrations and load demonstration data
npm run dev                 # http://localhost:3000
```

`npm run setup` prints the demonstration sign-in accounts when it finishes.

### Demonstration accounts

These exist only in the demonstration data loaded by `npm run db:seed`. They are
practice logins against invented students — **never create them on a live system.**

| Role | Username | Password |
| --- | --- | --- |
| Super Admin | `admin` | `Hope@Admin2026` — you are asked to set a new one at first sign-in |
| Principal / Director | `principal` | `Hope@Principal2026` |
| Examination Controller | `controller` | `Hope@Exams2026` |
| Teacher | `raza`, `kanwal`, `haider` | `Hope@Teacher2026` |
| Student / Parent | `hsa-2026-0001`, `hsa-2026-0002` | `Hope@Student2026` |

A live installation is prepared with `npm run db:bootstrap` instead, which creates no
students and exactly one administrator, from environment variables you choose. If
nobody can sign in, run `npm run reset-admin -- "NewPassword123"`.

---

## What is included

### Student records
Full admission record — admission and registration numbers, parents and guardian,
date of birth, B-Form/CNIC, photograph, contact numbers, address, previous school,
emergency contact and notes. Search, class/section/session filters, Excel and print
export, a validated Excel/CSV import wizard, and archive/restore that never deletes
academic history.

### Academic structure
Academic sessions, classes (free-form names — *Grade 9*, *10th*, *First Year*, *FSc*,
*O-Level*), sections with class teacher and enforced maximum strength, subjects with
theory/practical marks distribution and subject type, and teaching staff with
subject-and-section assignments.

### Examinations
Ten examination types, a nine-stage status workflow, per-examination marks overrides,
a date sheet builder with auto-generation and clash detection, five roll-number
allocation methods with a mandatory preview, examination rooms, automatic seating
plans (sequential or alternate), invigilation duty rosters, and per-paper attendance.

### Marks & results
Spreadsheet-style marks entry with keyboard navigation, live validation, unsaved-change
warnings and the special codes **ABS / EX / MED / WH**. A verification screen lists
every missing mark, mark above maximum, negative value and absent-with-marks conflict —
critical issues block publication. The server-side result engine computes subject
totals, percentages, grades, GPA, pass/fail, compartment, promotion status, and class,
section and subject positions.

### Ranking and grading
Ties are handled properly and configurably:

- **Competition ranking** — 1, 1, 3
- **Dense ranking** — 1, 1, 2

Grading schemes (percentage bands → grade, GPA, remark) and result policies (overall
pass, subject pass, practical pass, grace marks, compartment, absent handling,
promotion percentage, ranking method) are both fully editable.

### Official documents
Every document carries the academy crest, name, address and both contact numbers, and
is laid out in millimetres on A4 so print output matches the screen exactly:

Report cards · roll number slips (1, 2 or 4 per page) · date sheets · merit lists ·
position-holder posters · certificates (landscape) · attendance sheets · seating plans ·
door lists · seat labels · invigilation rosters · student lists · roll number lists ·
consolidated result sheets.

Report cards, certificates and roll slips carry a QR code linking to a public
verification page.

### Messaging parents on WhatsApp or SMS
Compose once from a template — result published, report card ready, date sheet
issued, roll slip available, absence notice, congratulations, performance
concern — and the system personalises it for every family using the contact
numbers on the student records. Placeholders such as `{student}`, `{exam}`,
`{percentage}`, `{grade}`, `{class_position}` and `{exam_roll}` are filled from
the live database.

You then get a **send list**: one row per family with the parent's name, their
number normalised to international form, and an *Open WhatsApp* button that
launches the chat with the message already typed. Pressing it also records the
send, so the office can work down the list without losing its place. Progress,
who sent what, and when, are all kept.

This uses **WhatsApp click-to-chat** — no WhatsApp Business account, no Meta
approval, no per-message charge. Families with a missing or malformed mobile
number are set aside rather than silently skipped, so nobody is quietly missed.

#### Sending by SMS instead

Pick **SMS** in the composer's channel selector and everything works the same
way, with three differences that matter in practice:

* **The wording is shorter.** Each template has an SMS variant written to fit a
  text message, so switching channel rewrites the body for you.
* **Cost is shown while you type.** SMS is billed per 160 characters (GSM-7
  alphabet), or per **70** if a single non-GSM character appears — a curly
  apostrophe `’`, a long dash `—` or a smart quote `“` silently doubles or
  triples the operator's bill. The composer measures the message live, names
  the offending characters, and offers a one-press **Replace them with plain
  equivalents** fix.
* **The send list opens the device's messaging app** (`sms:` link) rather than
  WhatsApp. That needs a SIM, so on a desktop PC the page says so and gives you
  the alternative below. (A PC paired to an Android phone with Windows Phone
  Link will work.)

Two practical ways to run an SMS campaign:

1. **From a phone or tablet** — sign in at `/messages` on the academy's own
   handset and work down the list, pressing *Open SMS app* → send → next.
2. **Bulk upload** — press **Export CSV** on the send list. The file is a plain
   `Number,Message` list (UTF-8 with BOM, one row per family, each message
   already personalised) which every Pakistani bulk-SMS portal accepts, so an
   entire class goes out in one upload. An XLSX version with student, class,
   number, message and SMS part count is available at
   `/api/export/message-list?campaignId=…&format=xlsx` for the academy's records.

The stored data is channel-agnostic (`MessageCampaign` / `MessageRecipient`),
so a WhatsApp Business Cloud API, an SMS gateway with a delivery-receipt
callback, or an SMTP sender can be added later without changing the model or
losing this history.

### Public admission enquiries
A page at `/admission` that anyone can use without an account. A parent enters the
child's details and gets a reference number; the enquiry lands in **Admissions** for the
office to review, telephone the family, and record what happened.

Pressing **Admit** creates the student record from the enquiry — name, parent, date of
birth, contact numbers and address are carried across, the enquiry is linked to the
student it produced, and the admission is written to the audit log. Nothing a stranger
submits becomes a student until a member of staff does this.

Because the page is open to the internet it is written defensively: every field is
length-bounded and validated, mobile numbers must be real Pakistani mobiles, submissions
are capped per address per hour, the same child sent twice in a day returns the original
reference instead of a duplicate, and a hidden honeypot field files bot submissions as
spam without telling the sender.

### Parent portal
Parents sign in at `/parent/login` with **their mobile number — there is no password** —
and see every child whose parent or WhatsApp number matches theirs, so brothers and sisters
appear together, and a sibling admitted later shows up without anyone linking them. For each
child: the latest result subject by subject, class and section position, progress over time,
the strongest subject and the one needing attention, the upcoming date sheet with roll number,
certificates, the messages the academy has sent about them, and the official report card to
print or save as PDF.

**Keep me signed in** remembers the phone for 90 days after the last visit, renewed each
time. Untick it on a shared computer and the session ends when the browser closes.

The office controls who can sign in under **Students → Parent Accounts**. A number only
works once it has been given access there. The page lists every family on the student records
without access, with a per-family *Give access* button and a **Give all access** button for
the whole school at once, plus a WhatsApp button that sends the family the portal link. Access
can be switched off at any time — which also signs that parent out of every device — for
example when a number changes hands or a family leaves.

What a parent can and cannot reach:

* **Only their own children.** Any other student — or any other student's report card — is a
  plain 404, so the portal never even confirms that a given ID exists.
* **Only published results.** Marks still being entered or checked are never shown.
* **Nothing in the staff system.** Parent accounts are not user accounts: separate table,
  separate cookie, separate guard. A parent's session cannot satisfy any staff permission,
  so no role misconfiguration can grant one access to marks entry or other families' records.
* **Not withdrawn or transferred students**, even on a matching number. Mobile numbers are
  recycled, and one that belonged to a family who left may now belong to a stranger.

Because the number is the only thing needed, **anyone who has a parent's number can see that
family's children's results**. Sign-in attempts with numbers that have no access are
rate-limited per address, which slows anyone trying number after number, and every sign-in is
written to the audit log.

### Result approval & locking
Marks completed → verification → processing → controller review → principal approval →
publication → lock. After locking, teachers and the Examination Controller can no
longer change marks; only a Super Admin can unlock, and only with a written reason and
password confirmation. Every step is recorded in the workflow trail and the audit log.

### Analytics
Academy-wide dashboard, class and section analysis, subject analysis, individual student
progress against the class average, and side-by-side examination comparison.

### Security
bcrypt password hashing (12 rounds) · database-backed sessions with httpOnly cookies ·
idle auto-logout · per-username and per-IP sign-in rate limiting with account lockout ·
role-based permissions on every action · Zod validation on every input · Prisma
parameterised queries · magic-number-validated image uploads served through an
authenticated route, never as executable files · HTTPS enforced in production · security
headers · database transactions on every multi-step write · a comprehensive audit log.

---

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on port 3000 |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | TypeScript check across the whole project |
| `npm run db:bootstrap` | Prepare an **empty** database for live use: roles, grading, one admin |
| `npm run db:seed` | Load demonstration data (**replaces existing data**) |
| `npm run db:deploy` | Apply pending migrations to a live database |
| `npm run db:migrate` | Create and apply a migration after a schema change |
| `npm run backup` | Write a full JSON backup into `storage/backups` |
| `npm run reset-admin -- "NewPassword123"` | Emergency Super Admin password reset |

### Scheduling automatic backups

Windows Task Scheduler — create a daily task running:

```
cmd /c "cd /d C:\Users\Arif Sajjad\Students Result Software && npm run backup"
```

The machine that runs this does not have to be the machine the system runs on: point
`DATABASE_URL` at the live database and an office PC can keep the academy's own copies
of a cloud-hosted installation. Backups older than 30 days are pruned automatically; set
`BACKUP_KEEP_DAYS` to change that. **Copy `storage/backups` to external storage
regularly** — a backup on the same disk does not protect against disk failure.

Staff can also take one from **Administration → Backup & Restore**, which downloads the
whole database as a single JSON file and can put it back again.

---

## Configuration

`.env`, created from `.env.example`:

```ini
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require&pgbouncer=true"
DIRECT_URL="postgresql://user:pass@host/db?sslmode=require"
NEXT_PUBLIC_APP_URL="https://your-site.vercel.app"
SESSION_LIFETIME_MINUTES=720
SESSION_IDLE_TIMEOUT_MINUTES=60
```

`DATABASE_URL` is the pooled connection the application uses; `DIRECT_URL` is the
unpooled one migrations need, because a connection pooler cannot run schema changes.
Neon and Supabase both give you the pair.

`NEXT_PUBLIC_APP_URL` is embedded in every QR code printed on report cards and
certificates, so it must be the address parents actually visit. On Vercel it falls back
to the project's own production domain if unset, but set it explicitly once you have a
custom domain — otherwise documents printed today verify against yesterday's address.

There is deliberately no signing secret to configure. Sessions are not signed
cookies: each sign-in generates 32 random bytes, and only their SHA-256 hash is
stored, so a stolen database yields no usable session and there is no key that
could leak or need rotating.

---

## Deploying to Vercel

### 1. Create the database

In the Vercel dashboard: **Storage → Create Database → Neon**. Vercel adds
`DATABASE_URL` and `DIRECT_URL` to the project automatically.

### 2. Add the remaining environment variables

**Settings → Environment Variables**, for Production, Preview and Development:

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | `https://<your-project>.vercel.app`, or your own domain |

### 3. Deploy

Import the GitHub repository. Vercel runs `npm run vercel-build`, which generates the
Prisma client and builds the site. No build settings need changing.

Migrations are deliberately **not** run during the build. A build container cannot always
reach the database, and two deployments building at once would race each other. Apply them
yourself instead, from a machine whose `.env` points at the live database:

```bash
npm run db:deploy
```

### 4. Create the first administrator

Migrations create the tables but no accounts. From your own machine, with `.env`
pointing at the same database:

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD='choose a long one' ADMIN_NAME='Your Name' npm run db:bootstrap
```

That writes the permission catalogue, the five roles, the grading scheme, the result
policies, the academy settings and one Super Admin — and nothing else. Sign in and
create the academic session, classes, sections and subjects.

To put the demonstration data on a **practice** deployment instead, run
`npm run db:seed`. Never run it against a database holding real student records: it
clears existing data and creates accounts whose passwords are published in this file.

### What is different about running on Vercel

Serverless hosting gives every request a fresh, read-only filesystem, so two things
work differently from a server in the academy:

* **Uploaded images** (crest, stamp, signatures, student photographs) are stored in the
  database rather than on disk, and served through `/api/files/…`. One backup therefore
  captures the records and the pictures together.
* **Backups** are a JSON export downloaded to whoever presses the button, and restored by
  uploading that file — there is no server-side backup folder. `npm run backup` does the
  same thing from the command line and can be scheduled on an office PC.

### Cost

Vercel's Hobby plan and Neon's free tier both cost nothing and are sized for a school of
this size. Hobby is licensed for non-commercial use; a fee-charging academy running this
as its administrative system should be on a Pro plan.

---

## Project layout

```
prisma/
  schema.prisma          42 tables with keys, indexes and unique constraints
  bootstrap.ts           first-run setup for a live (empty) database
  seed.ts, seed-data.ts  demonstration data
scripts/                 backup and admin-reset CLI tools
src/
  app/
    (app)/               staff application (dashboard, students, academics,
                         exams, marks, results, analytics, certificates,
                         reports, administration)
    (public)/            public result portal and QR verification
    portal/              student / parent portal
    print/               A4 print-ready official documents
    api/                 search, Excel exports, file serving
  components/            UI kit, layout, branding, charts
  lib/                   auth, permissions, result engine, grading, ranking,
                         schemas, utilities
  server/
    actions/             server actions (all mutations)
    queries/             read models
    services/            result processing, roll numbers, seating, Excel,
                         uploads, backup
```

### Where the important logic lives

| Concern | File |
| --- | --- |
| Result calculation | `src/lib/result-engine.ts` |
| Tie-aware ranking | `src/lib/ranking.ts` |
| Percentage → grade | `src/lib/grading.ts` |
| Processing & positions | `src/server/services/result-processing.ts` |
| Roll number allocation | `src/server/services/roll-numbers.ts` |
| Parent messaging | `src/server/services/messaging.ts` |
| Message templates | `src/lib/message-templates.ts` |
| Phone normalisation | `src/lib/phone.ts` |
| Seating plans | `src/server/services/seating.ts` |
| Permission catalogue | `src/lib/permissions.ts` |
| Sessions & rate limiting | `src/lib/auth.ts` |

All calculation is server-side. The browser never computes a mark, percentage, grade
or position.

---

## Suggested first-run walkthrough

1. Sign in as `controller` / `Hope@Exams2026`.
2. **Dashboard** — live figures from the seeded academy.
3. **Examinations → Mid Term Examination 2027** — the workflow strip shows what is done.
4. **Roll Numbers** — preview, then generate; **Roll Number Slips** — print two per page.
5. **Marks → Enter Marks** — type marks, or `ABS`, and save.
6. **Marks → Verification** — every data problem, listed.
7. **Results → Process Results**, then **Publish Results** for the approval trail.
8. **Results → Position Holders** — note Saad Bin Tariq and Umaima Noor sharing first
   place, with the next student at third (competition ranking).
9. **Report Cards** — print one; scan its QR code to reach the verification page.
10. **Messages → New Message** — pick the class, preview, and build the WhatsApp send list.
11. Sign out and open **/result** to look a result up as a parent would.

---

## Designed to extend

The examination system is deliberately self-contained. General attendance, fees,
timetable, homework, LMS, library, staff management, payroll, admissions, online tests
and parent/student apps can each be added as separate modules without touching the
examination tables.

---

*Built for The Hope Science Academy, 247/E-1, Johar Town, Lahore.*
