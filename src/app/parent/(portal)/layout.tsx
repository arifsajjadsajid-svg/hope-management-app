import { requireParent } from '@/lib/parent-auth';
import { getAcademySettings } from '@/lib/settings';
import { ParentShell } from '../parent-shell';

export const dynamic = 'force-dynamic';

export default async function ParentPortalLayout({ children }: { children: React.ReactNode }) {
  const parent = await requireParent();
  const academy = await getAcademySettings();

  return (
    <ParentShell academy={academy} parentName={parent.displayName}>
      {children}
    </ParentShell>
  );
}
