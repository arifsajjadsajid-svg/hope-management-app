import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { ChangePasswordForm } from './change-password-form';

export const metadata: Metadata = { title: 'Change Password' };
export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage() {
  await requireUser();

  return (
    <>
      <h1 className="mb-5 text-2xl font-bold tracking-tight text-navy-900">Change Password</h1>

      <Card>
        <CardHeader
          title="Set a new password"
          description="At least 8 characters, including a letter and a digit. All your other sessions are signed out."
        />
        <CardBody>
          <ChangePasswordForm />
        </CardBody>
      </Card>
    </>
  );
}
