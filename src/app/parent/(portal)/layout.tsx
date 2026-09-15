import { redirect } from 'next/navigation';
import { requireParent } from '@/lib/parent-auth';
import { getAcademySettings } from '@/lib/settings';
import { ParentShell } from '../parent-shell';

export const dynamic = 'force-dynamic';

export default async function ParentPortalLayout({ children }: { children: React.ReactNode }) {
  const parent = await requireParent();

  // A temporary password from the office is replaced before anything is shown.
  if (parent.mustChangePassword) redirect('/parent/change-password');

  const academy = await getAcademySettings();

  return (
    <ParentShell academy={academy} parentName={parent.displayName}>
      {children}
    </ParentShell>
  );
}
