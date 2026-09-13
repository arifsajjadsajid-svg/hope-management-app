import type { Metadata } from 'next';
import Link from 'next/link';
import { Settings, Scale, Gavel } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/layout/page-header';
import { Alert } from '@/components/ui/primitives';
import { GradingSchemeEditor, NewSchemeButton } from './grading-editor';

export const metadata: Metadata = { title: 'Grading Schemes' };
export const dynamic = 'force-dynamic';

export default async function GradingSchemesPage() {
  await requirePermission('grading.manage');

  const schemes = await prisma.gradingScheme.findMany({
    include: {
      bands: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { exams: true } },
    },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });

  return (
    <>
      <PageHeader
        title="Grading Schemes"
        description="Percentage bands that turn a mark into a grade, GPA and remark on every report card."
        breadcrumbs={[
          { label: 'Administration' },
          { label: 'Academy Settings', href: '/admin/settings' },
          { label: 'Grading Schemes' },
        ]}
        actions={<NewSchemeButton />}
      />

      <div className="mb-5 grid gap-3.5 sm:grid-cols-3">
        {[
          { href: '/admin/settings', icon: Settings, label: 'Academy Profile', description: 'Name, address, contact and signatories' },
          { href: '/admin/settings/grading', icon: Scale, label: 'Grading Schemes', description: 'Percentage bands, grades and GPA', active: true },
          { href: '/admin/settings/policies', icon: Gavel, label: 'Result Policies', description: 'Pass rules, grace marks and ranking' },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-xl border p-4 transition ${
                tab.active ? 'border-navy-900 bg-navy-50/60' : 'border-slate-200 bg-white hover:border-navy-300'
              }`}
            >
              <Icon className={`h-4 w-4 ${tab.active ? 'text-navy-900' : 'text-slate-400'}`} />
              <p className="mt-1.5 text-[13.5px] font-bold text-navy-900">{tab.label}</p>
              <p className="text-[11.5px] text-slate-500">{tab.description}</p>
            </Link>
          );
        })}
      </div>

      <Alert tone="info" className="mb-5">
        Editing a scheme does not change results that have already been processed. Reprocess an
        examination from <strong>Results → Process Results</strong> to apply new bands to it.
      </Alert>

      <div className="space-y-5">
        {schemes.map((scheme) => (
          <GradingSchemeEditor
            key={scheme.id}
            scheme={{
              id: scheme.id,
              name: scheme.name,
              description: scheme.description ?? '',
              useGpa: scheme.useGpa,
              isDefault: scheme.isDefault,
              examCount: scheme._count.exams,
              bands: scheme.bands.map((band) => ({
                grade: band.grade,
                minPercent: String(band.minPercent),
                maxPercent: String(band.maxPercent),
                gpa: String(band.gpa),
                remarks: band.remarks ?? '',
                isFail: band.isFail,
              })),
            }}
          />
        ))}
      </div>
    </>
  );
}
