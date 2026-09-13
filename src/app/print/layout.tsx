import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

/**
 * Printable documents render outside the application shell so nothing but the
 * document itself reaches the printer. Access still requires a signed-in user.
 */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return <div className="min-h-screen bg-slate-100 pb-10">{children}</div>;
}
