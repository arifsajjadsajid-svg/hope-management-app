import type { Metadata } from 'next';
import Link from 'next/link';
import { Settings, Scale, Gavel } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAcademySettings } from '@/lib/settings';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, Card, CardBody } from '@/components/ui/primitives';
import { AcademySettingsForm } from './settings-form';

export const metadata: Metadata = { title: 'Academy Settings' };
export const dynamic = 'force-dynamic';

export default async function AcademySettingsPage() {
  await requirePermission('settings.manage');

  const [academy, sessions, gradingSchemes, policies] = await Promise.all([
    getAcademySettings(),
    prisma.academicSession.findMany({ orderBy: { startDate: 'desc' } }),
    prisma.gradingScheme.findMany({ orderBy: { name: 'asc' } }),
    prisma.resultPolicy.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return (
    <>
      <PageHeader
        title="Academy Settings"
        description="The single source of truth for the academy's identity. Changing anything here updates every screen, report and printed document immediately."
        breadcrumbs={[{ label: 'Administration' }, { label: 'Academy Settings' }]}
      />

      <div className="mb-5 grid gap-3.5 sm:grid-cols-3">
        {[
          {
            href: '/admin/settings',
            icon: Settings,
            label: 'Academy Profile',
            description: 'Name, address, contact, logo and signatories',
            active: true,
          },
          {
            href: '/admin/settings/grading',
            icon: Scale,
            label: 'Grading Schemes',
            description: 'Percentage bands, grades, GPA and remarks',
          },
          {
            href: '/admin/settings/policies',
            icon: Gavel,
            label: 'Result Policies',
            description: 'Pass rules, grace marks, compartment and ranking',
          },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-xl border p-4 transition ${
                tab.active
                  ? 'border-navy-900 bg-navy-50/60'
                  : 'border-slate-200 bg-white hover:border-navy-300'
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
        These details are currently printed as{' '}
        <strong>
          {academy.name}, {academy.address}, {academy.contactLine}
        </strong>
        .
      </Alert>

      <AcademySettingsForm
        sessions={sessions.map((s) => ({ id: s.id, name: s.name }))}
        gradingSchemes={gradingSchemes.map((g) => ({ id: g.id, name: g.name }))}
        policies={policies.map((p) => ({ id: p.id, name: p.name }))}
        defaults={{
          name: academy.name,
          shortName: academy.shortName,
          tagline: academy.tagline,
          address: academy.address,
          phone1: academy.phone1,
          phone2: academy.phone2,
          email: academy.email ?? '',
          website: academy.website ?? '',
          directorName: academy.directorName ?? '',
          principalName: academy.principalName ?? '',
          examControllerName: academy.examControllerName ?? '',
          footerMessage: academy.footerMessage,
          currentSessionId: academy.currentSessionId ?? '',
          defaultGradingId: academy.defaultGradingId ?? '',
          defaultPolicyId: academy.defaultPolicyId ?? '',
          resultPortalEnabled: academy.resultPortalEnabled,
          logoPath: academy.logoPath,
          stampPath: academy.stampPath,
          principalSignPath: academy.principalSignPath,
          directorSignPath: academy.directorSignPath,
          examControllerSign: academy.examControllerSign,
        }}
      />
    </>
  );
}
