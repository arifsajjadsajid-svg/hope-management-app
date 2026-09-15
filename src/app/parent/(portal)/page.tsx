import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, TrendingUp, TrendingDown, Minus, Users, BookOpen } from 'lucide-react';
import { requireParent, childrenForPhone } from '@/lib/parent-auth';
import { prisma } from '@/lib/prisma';
import { getAcademySettings } from '@/lib/settings';
import { GradeBadge, ResultStatusBadge, StudentAvatar } from '@/components/ui/status-badge';
import { formatPercent, ordinal, round } from '@/lib/utils';

export const metadata: Metadata = { title: 'Parent Portal' };
export const dynamic = 'force-dynamic';

export default async function ParentHomePage() {
  const parent = await requireParent();
  const [academy, children] = await Promise.all([
    getAcademySettings(),
    childrenForPhone(parent.phone),
  ]);

  // Published results only — never marks still being entered or checked.
  const results = children.length
    ? await prisma.result.findMany({
        where: { studentId: { in: children.map((c) => c.id) }, isPublished: true },
        select: {
          studentId: true,
          percentage: true,
          grade: true,
          status: true,
          classPosition: true,
          exam: { select: { name: true, startDate: true } },
        },
        orderBy: { exam: { startDate: 'desc' } },
      })
    : [];

  const byChild = new Map<string, typeof results>();
  for (const result of results) {
    const list = byChild.get(result.studentId) ?? [];
    list.push(result);
    byChild.set(result.studentId, list);
  }

  const firstName = parent.displayName.split(' ')[0];

  return (
    <>
      <section className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-navy-900">
          Assalam-o-Alaikum{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="mt-1 text-[14px] text-slate-600">
          {children.length === 0
            ? 'No students are linked to your number yet.'
            : children.length === 1
              ? 'Here is how your child is doing.'
              : `Here is how your ${children.length} children are doing.`}
        </p>
      </section>

      {children.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <Users className="mx-auto h-8 w-8 text-amber-600" />
          <p className="mt-3 text-[15px] font-semibold text-amber-900">
            We could not find a student with your mobile number
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-amber-800">
            Your child’s record may have a different number, or they may no longer be enrolled. Please
            call the academy on <span className="tabular">{academy.contactLine}</span> so we can update it.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {children.map((child) => {
            const childResults = byChild.get(child.id) ?? [];
            const latest = childResults[0];
            const previous = childResults[1];
            const change = latest && previous ? latest.percentage - previous.percentage : null;
            const TrendIcon = change === null ? Minus : change > 0 ? TrendingUp : TrendingDown;
            const trendClass =
              change === null || change === 0
                ? 'text-slate-500'
                : change > 0
                  ? 'text-emerald-600'
                  : 'text-rose-600';

            return (
              <Link
                key={child.id}
                href={`/parent/child/${child.id}`}
                className="group block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-royal-300 hover:shadow-md"
              >
                <div className="flex items-center gap-3.5 p-4 sm:p-5">
                  <StudentAvatar name={child.fullName} photoPath={child.photoPath} size={56} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-bold text-navy-900">{child.fullName}</p>
                    <p className="truncate text-[12.5px] text-slate-500">
                      {child.className
                        ? `${child.className}${child.sectionName ? ` · Section ${child.sectionName}` : ''}`
                        : child.admissionNumber}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-royal-600" />
                </div>

                {latest ? (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3.5 sm:px-5">
                    <p className="truncate text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
                      {latest.exam.name}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                      <span className="text-[26px] font-bold leading-none tabular text-navy-900">
                        {formatPercent(latest.percentage)}
                      </span>
                      <GradeBadge grade={latest.grade} />
                      <ResultStatusBadge status={latest.status} />
                      {latest.classPosition && (
                        <span className="text-[13px] font-semibold text-slate-700">
                          {ordinal(latest.classPosition)} in class
                        </span>
                      )}
                    </div>
                    <p className={`mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold ${trendClass}`}>
                      <TrendIcon className="h-3.5 w-3.5" />
                      {change === null
                        ? 'First published result'
                        : change === 0
                          ? 'Same as the previous exam'
                          : `${change > 0 ? '+' : ''}${round(change, 2)}% since ${previous!.exam.name}`}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-4 text-[13px] text-slate-500 sm:px-5">
                    <BookOpen className="h-4 w-4 text-slate-400" />
                    No results published yet
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
