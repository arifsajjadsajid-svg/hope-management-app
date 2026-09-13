import { redirect } from 'next/navigation';
import { getCurrentUser, userCanAny } from '@/lib/auth';
import { getAcademySettings } from '@/lib/settings';
import { prisma } from '@/lib/prisma';
import { ROLE } from '@/lib/constants';
import { NAVIGATION } from '@/components/layout/nav-config';
import { AppShell } from '@/components/layout/app-shell';
import type { VisibleNavGroup } from '@/components/layout/sidebar';
import { ForcedPasswordChange } from './forced-password-change';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.roleCode === ROLE.STUDENT) redirect('/portal');

  const academy = await getAcademySettings();

  // Build the sidebar from the permissions this role actually holds.
  const navigation: VisibleNavGroup[] = NAVIGATION.flatMap((group) => {
    const children = (group.children ?? []).filter(
      (link) => !link.permissions || userCanAny(user, link.permissions),
    );

    const groupVisible = !group.permissions || userCanAny(user, group.permissions);
    if (!groupVisible) return [];
    if (group.children && children.length === 0) return [];

    return [
      {
        label: group.label,
        icon: group.icon,
        href: group.href,
        children: group.children
          ? children.map((c) => ({ label: c.label, href: c.href, exact: c.exact }))
          : undefined,
      },
    ];
  });

  const unreadCount = await prisma.notificationRecipient.count({
    where: { userId: user.id, readAt: null },
  });

  if (user.mustChangePassword) {
    return (
      <ForcedPasswordChange
        academyName={academy.name}
        academyAddress={academy.address}
        contactLine={academy.contactLine}
        shortName={academy.shortName}
        fullName={user.fullName}
      />
    );
  }

  return (
    <AppShell
      navigation={navigation}
      user={{
        fullName: user.fullName,
        roleName: user.roleName,
        roleCode: user.roleCode,
        username: user.username,
      }}
      academyName={academy.name}
      academyShortName={academy.shortName}
      academyAddress={academy.address}
      logoPath={academy.logoPath}
      unreadCount={unreadCount}
      canSearch={userCanAny(user, ['search.global', 'students.view'])}
    >
      {children}
    </AppShell>
  );
}
