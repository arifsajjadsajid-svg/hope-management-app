import type { Metadata } from 'next';
import Link from 'next/link';
import { Settings, Scale, Gavel } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/layout/page-header';
import { Card, EmptyState, Alert, Badge } from '@/components/ui/primitives';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { PolicyDialog, DeletePolicyButton } from './policy-clients';
import { RANKING_METHOD_LABELS } from '@/lib/constants';
import { formatPercent } from '@/lib/utils';

export const metadata: Metadata = { title: 'Result Policies' };
export const dynamic = 'force-dynamic';

export default async function ResultPoliciesPage() {
  await requirePermission('grading.manage');

  const policies = await prisma.resultPolicy.findMany({
    include: { _count: { select: { exams: true } } },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });

  return (
    <>
      <PageHeader
        title="Result Policies"
        description="The pass/fail rule engine: overall and subject pass marks, practical requirements, grace marks, compartment handling, absent treatment and how ties are ranked."
        breadcrumbs={[
          { label: 'Administration' },
          { label: 'Academy Settings', href: '/admin/settings' },
          { label: 'Result Policies' },
        ]}
        actions={<PolicyDialog />}
      />

      <div className="mb-5 grid gap-3.5 sm:grid-cols-3">
        {[
          { href: '/admin/settings', icon: Settings, label: 'Academy Profile', description: 'Name, address, contact and signatories' },
          { href: '/admin/settings/grading', icon: Scale, label: 'Grading Schemes', description: 'Percentage bands, grades and GPA' },
          { href: '/admin/settings/policies', icon: Gavel, label: 'Result Policies', description: 'Pass rules, grace marks and ranking', active: true },
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
        Tie handling: <strong>Competition ranking</strong> gives 1, 1, 3 — two students sharing first
        place push the next student to third. <strong>Dense ranking</strong> gives 1, 1, 2. Choose
        whichever the academy announces on its merit lists.
      </Alert>

      <Card>
        {policies.length === 0 ? (
          <EmptyState
            icon={<Gavel className="h-6 w-6" />}
            title="No result policies"
            description="Create a policy so the engine knows how to decide pass, fail, compartment and promotion."
            action={<PolicyDialog />}
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Policy</Th>
                  <Th align="center">Overall Pass</Th>
                  <Th align="center">Subject Pass</Th>
                  <Th align="center">Practical Pass</Th>
                  <Th align="center">Grace</Th>
                  <Th align="center">Compartment</Th>
                  <Th align="center">Absent</Th>
                  <Th>Ranking</Th>
                  <Th align="center">Promotion</Th>
                  <Th align="center">Exams</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {policies.map((policy) => (
                  <tr key={policy.id}>
                    <Td>
                      <span className="font-bold text-navy-900">{policy.name}</span>
                      {policy.isDefault && (
                        <Badge className="ml-2" tone="bg-navy-900 text-gold-300 ring-navy-800">
                          Default
                        </Badge>
                      )}
                      {policy.description && (
                        <span className="mt-0.5 block max-w-md text-[11.5px] leading-relaxed text-slate-500">
                          {policy.description}
                        </span>
                      )}
                    </Td>
                    <Td align="center" className="font-semibold tabular">
                      {formatPercent(policy.overallPassPercent, 0)}
                    </Td>
                    <Td align="center">{policy.requireSubjectPass ? 'Required' : 'Not required'}</Td>
                    <Td align="center">
                      {policy.requirePracticalPass ? 'Required' : 'Not required'}
                    </Td>
                    <Td align="center" className="tabular">
                      {policy.graceMarksMax > 0
                        ? `${policy.graceMarksMax} / ${policy.graceMaxSubjects} subj.`
                        : 'None'}
                    </Td>
                    <Td align="center" className="tabular">
                      {policy.compartmentEnabled
                        ? `Up to ${policy.compartmentMaxSubjects}`
                        : 'Disabled'}
                    </Td>
                    <Td align="center" className="text-[12px]">
                      {policy.absentCountsAsZero ? 'Counts as zero' : 'Excluded'}
                      {policy.absentFailsResult && (
                        <span className="block text-[11px] text-rose-600">Fails result</span>
                      )}
                    </Td>
                    <Td className="text-[12.5px]">
                      {RANKING_METHOD_LABELS[policy.rankingMethod] ?? policy.rankingMethod}
                    </Td>
                    <Td align="center" className="tabular">
                      {formatPercent(policy.promotionPercent, 0)}
                    </Td>
                    <Td align="center" className="tabular">{policy._count.exams}</Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-0.5">
                        <PolicyDialog
                          policy={{
                            id: policy.id,
                            name: policy.name,
                            description: policy.description ?? '',
                            overallPassPercent: policy.overallPassPercent,
                            requireSubjectPass: policy.requireSubjectPass,
                            requirePracticalPass: policy.requirePracticalPass,
                            compulsoryMustPass: policy.compulsoryMustPass,
                            graceMarksMax: policy.graceMarksMax,
                            graceMaxSubjects: policy.graceMaxSubjects,
                            compartmentEnabled: policy.compartmentEnabled,
                            compartmentMaxSubjects: policy.compartmentMaxSubjects,
                            absentCountsAsZero: policy.absentCountsAsZero,
                            absentFailsResult: policy.absentFailsResult,
                            rankingMethod: policy.rankingMethod,
                            promotionPercent: policy.promotionPercent,
                            includeOptionalInTotal: policy.includeOptionalInTotal,
                            isDefault: policy.isDefault,
                          }}
                        />
                        {policy._count.exams === 0 && !policy.isDefault && (
                          <DeletePolicyButton id={policy.id} name={policy.name} />
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
