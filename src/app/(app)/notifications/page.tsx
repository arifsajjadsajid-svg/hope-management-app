import type { Metadata } from 'next';
import Link from 'next/link';
import { Bell, Mail, MessageSquare, Smartphone, Monitor } from 'lucide-react';
import { requireUser, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader, EmptyState, Badge, Alert } from '@/components/ui/primitives';
import { StatCard } from '@/components/ui/stat-card';
import { SendNotificationDialog, MarkAllReadButton } from './notification-clients';
import {
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_CHANNEL_LABELS,
  ROLE_LABELS,
} from '@/lib/constants';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  IN_APP: Monitor,
  EMAIL: Mail,
  SMS: MessageSquare,
  WHATSAPP: Smartphone,
};

const TYPE_TONE: Record<string, string> = {
  RESULT_PUBLISHED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  RESULT_UPDATED: 'bg-amber-50 text-amber-700 ring-amber-200',
  DATESHEET_PUBLISHED: 'bg-royal-50 text-royal-700 ring-royal-200',
  ROLL_SLIP_AVAILABLE: 'bg-teal-50 text-teal-700 ring-teal-200',
  EXAM_ANNOUNCEMENT: 'bg-purple-50 text-purple-700 ring-purple-200',
  STUDENT_ABSENCE: 'bg-rose-50 text-rose-700 ring-rose-200',
  GENERAL: 'bg-slate-100 text-slate-700 ring-slate-200',
};

export default async function NotificationsPage() {
  const user = await requireUser();
  const canSend = userCan(user, 'notifications.send');
  const session = await getCurrentSession();

  const [received, unreadCount, roles, classes, sections, students] = await Promise.all([
    prisma.notificationRecipient.findMany({
      where: { userId: user.id },
      include: { notification: true },
      orderBy: { notification: { createdAt: 'desc' } },
      take: 100,
    }),
    prisma.notificationRecipient.count({ where: { userId: user.id, readAt: null } }),
    canSend ? prisma.role.findMany({ orderBy: { name: 'asc' } }) : Promise.resolve([]),
    canSend
      ? prisma.schoolClass.findMany({
          where: session ? { sessionId: session.id } : {},
          orderBy: { displayOrder: 'asc' },
        })
      : Promise.resolve([]),
    canSend
      ? prisma.section.findMany({
          where: session ? { schoolClass: { sessionId: session.id } } : {},
          include: { schoolClass: { select: { name: true } } },
          orderBy: [{ schoolClass: { displayOrder: 'asc' } }, { name: 'asc' }],
        })
      : Promise.resolve([]),
    canSend
      ? prisma.student.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true, fullName: true, admissionNumber: true },
          orderBy: { fullName: 'asc' },
          take: 600,
        })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Announcements delivered inside the system. Email, SMS and WhatsApp Business channels are queued and ready for a gateway."
        breadcrumbs={[{ label: 'Notifications' }]}
        actions={
          <>
            <MarkAllReadButton unread={unreadCount} />
            {canSend && (
              <SendNotificationDialog
                roles={roles.map((r) => ({
                  value: r.id,
                  label: ROLE_LABELS[r.code] ?? r.name,
                }))}
                classes={classes.map((c) => ({ value: c.id, label: c.name }))}
                sections={sections.map((s) => ({
                  value: s.id,
                  label: `${s.schoolClass.name} — ${s.name}`,
                }))}
                students={students.map((s) => ({
                  value: s.id,
                  label: `${s.fullName} (${s.admissionNumber})`,
                }))}
              />
            )}
          </>
        }
      />

      <section className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-3">
        <StatCard label="Total Received" value={received.length} tone="navy" />
        <StatCard
          label="Unread"
          value={unreadCount}
          tone={unreadCount ? 'rose' : 'slate'}
          icon={<Bell className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Read"
          value={received.length - unreadCount}
          tone="emerald"
        />
      </section>

      {canSend && (
        <Alert tone="info" className="mb-5">
          Publishing a result automatically announces it to every account, so most notifications are
          sent for you. Use this page for anything extra — an examination announcement, a change of
          date sheet, or a message to one class.
        </Alert>
      )}

      <Card>
        <CardHeader title="Your notifications" description="Newest first" />
        {received.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-6 w-6" />}
            title="No notifications"
            description="Announcements about examinations, date sheets, roll number slips and results will appear here."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {received.map((row) => {
              const channels = row.notification.channels.split(',').filter(Boolean);
              const unread = !row.readAt;

              return (
                <li
                  key={row.id}
                  className={`px-5 py-4 ${unread ? 'bg-royal-50/40' : ''}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {unread && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-royal-600" aria-label="Unread" />
                        )}
                        <p className="text-[14px] font-bold text-navy-900">
                          {row.notification.title}
                        </p>
                        <Badge
                          tone={TYPE_TONE[row.notification.type] ?? TYPE_TONE.GENERAL}
                        >
                          {NOTIFICATION_TYPE_LABELS[row.notification.type] ?? row.notification.type}
                        </Badge>
                      </div>

                      <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-slate-700">
                        {row.notification.message}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11.5px] text-slate-500">
                        <span className="tabular">
                          {formatDateTime(row.notification.createdAt)}
                        </span>
                        {row.notification.createdByName && (
                          <span>by {row.notification.createdByName}</span>
                        )}
                        <span className="flex items-center gap-1.5">
                          {channels.map((channel) => {
                            const Icon = CHANNEL_ICONS[channel] ?? Monitor;
                            return (
                              <span
                                key={channel}
                                className="inline-flex items-center gap-0.5"
                                title={NOTIFICATION_CHANNEL_LABELS[channel] ?? channel}
                              >
                                <Icon className="h-3 w-3" />
                                {NOTIFICATION_CHANNEL_LABELS[channel] ?? channel}
                              </span>
                            );
                          })}
                        </span>
                        {row.deliveryStatus === 'PENDING' && (
                          <Badge tone="bg-amber-50 text-amber-700 ring-amber-200">
                            Queued — gateway not configured
                          </Badge>
                        )}
                      </div>
                    </div>

                    {row.notification.link && (
                      <Link
                        href={row.notification.link}
                        className="shrink-0 text-[12.5px] font-semibold text-royal-700 hover:underline"
                      >
                        Open
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
