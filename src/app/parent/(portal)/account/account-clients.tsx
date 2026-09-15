'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { parentSignOutOtherDevicesAction } from '@/server/actions/parent-auth';

export function SignOutOtherDevicesButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    const result = await parentSignOutOtherDevicesAction();
    setPending(false);
    if (result.ok) toast.success(result.message ?? 'Done.');
    else toast.error('Could not sign out other devices', result.error);
    router.refresh();
  };

  return (
    <Button variant="outline" size="sm" onClick={run} loading={pending} disabled={disabled}>
      <LogOut className="h-4 w-4" />
      Sign out all other devices
    </Button>
  );
}
