'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { deleteCampaignAction } from '@/server/actions/messages';

export function DeleteCampaignButton({
  campaignId,
  title,
}: {
  campaignId: string;
  title: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    const result = await deleteCampaignAction(campaignId);
    setPending(false);
    setOpen(false);
    if (result.ok) {
      toast.success(result.message ?? 'Message deleted.');
      router.push('/messages');
      router.refresh();
    } else {
      toast.error('Could not delete', result.error);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={run}
        title="Delete message"
        confirmLabel="Delete Message"
        loading={pending}
        message={
          <>
            Delete <strong>{title}</strong> and its record of who was messaged? The messages already
            delivered on WhatsApp are unaffected — only this record is removed.
          </>
        }
      />
    </>
  );
}
