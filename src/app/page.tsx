import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { ROLE } from '@/lib/constants';

export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.roleCode === ROLE.STUDENT) redirect('/portal');
  redirect('/dashboard');
}
