import type { Metadata } from 'next';
import { GraduationCap, Phone, Clock } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getAcademySettings } from '@/lib/settings';
import { EnquiryForm } from './enquiry-form';

export const metadata: Metadata = {
  title: 'Admission Enquiry',
  description: 'Apply for admission to The Hope Science Academy, Johar Town, Lahore.',
};

export const dynamic = 'force-dynamic';

/**
 * Public admission enquiry page — reachable without an account.
 *
 * The only thing read from the database here is the list of class names, so a
 * parent picks a real class rather than typing one. No student, mark or result
 * data is touched.
 */
export default async function AdmissionPage() {
  const academy = await getAcademySettings();

  const classes = await prisma.schoolClass.findMany({
    where: { isActive: true },
    select: { name: true },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    distinct: ['name'],
  });

  const classOptions = classes.map((c) => c.name);

  return (
    <>
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="flex items-start gap-4">
          <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-navy-50 sm:flex">
            <GraduationCap className="h-6 w-6 text-navy-700" />
          </div>
          <div>
            <h1 className="doc-title text-xl font-bold uppercase tracking-wide text-navy-900">
              Admission Enquiry
            </h1>
            <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-slate-600">
              Fill in the form below and the academy will contact you to arrange an interview and
              explain the admission process. There is no account to create and nothing to pay at
              this stage.
            </p>

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-slate-400" />
                <span className="tabular">{academy.contactLine}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                Office hours: Monday to Saturday, 8:00 am – 2:00 pm
              </span>
            </div>
          </div>
        </div>
      </section>

      {classOptions.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-[13.5px] font-semibold text-amber-900">
            Admissions are not open online at the moment.
          </p>
          <p className="mt-1 text-[13px] text-amber-800">
            Please telephone the academy on <span className="tabular">{academy.contactLine}</span>.
          </p>
        </div>
      ) : (
        <EnquiryForm classOptions={classOptions} />
      )}
    </>
  );
}
