import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { getAcademySettings } from '@/lib/settings';
import { buildWorkbook, spreadsheetHeaders } from '@/server/services/excel';
import { measureSms } from '@/lib/sms';
import { formatDate, slugify } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** One CSV field, escaped per RFC 4180. */
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Exports a prepared message list.
 *
 * `format=csv` produces the two-column number/message file that operator bulk
 * SMS portals accept, so a whole class can be sent in one upload.
 * `format=xlsx` produces a branded worksheet for the academy's own records.
 */
export async function GET(request: Request) {
  try {
    await requirePermission('notifications.send');
  } catch {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const campaignId = params.get('campaignId');
  const format = params.get('format') === 'xlsx' ? 'xlsx' : 'csv';
  const pendingOnly = params.get('pending') === '1';

  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
  }

  const [academy, campaign] = await Promise.all([
    getAcademySettings(),
    prisma.messageCampaign.findUnique({
      where: { id: campaignId },
      include: {
        exam: { select: { name: true } },
        recipients: {
          where: pendingOnly ? { status: 'PENDING' } : { status: { not: 'SKIPPED' } },
          include: {
            student: {
              select: {
                fullName: true,
                admissionNumber: true,
                enrollments: {
                  select: {
                    schoolClass: { select: { name: true } },
                    section: { select: { name: true } },
                  },
                  orderBy: { session: { startDate: 'desc' } },
                  take: 1,
                },
              },
            },
          },
          orderBy: { contactName: 'asc' },
        },
      },
    }),
  ]);

  if (!campaign) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

  const fileBase = `${slugify(academy.shortName)}-${slugify(campaign.title)}`;

  if (format === 'csv') {
    // Most Pakistani bulk-SMS portals accept a plain number,message pair.
    const lines = ['Number,Message'];
    for (const recipient of campaign.recipients) {
      lines.push(`${csvCell(recipient.dialNumber)},${csvCell(recipient.renderedBody)}`);
    }

    // A BOM keeps Excel from mangling the file when the office opens it.
    const body = `﻿${lines.join('\r\n')}\r\n`;

    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileBase}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const buffer = await buildWorkbook({
    academy,
    sheetName: 'Messages',
    documentTitle: `MESSAGE LIST — ${campaign.title.toUpperCase()}`,
    subtitle: `${campaign.channel === 'SMS' ? 'SMS' : 'WhatsApp'}${
      campaign.exam ? ` · ${campaign.exam.name}` : ''
    }`,
    meta: [
      ['Recipients', String(campaign.recipients.length)],
      ['Generated', formatDate(new Date())],
    ],
    columns: [
      { header: 'Sr.', key: 'sr', numeric: true, width: 6 },
      { header: 'Student', key: 'student', width: 26 },
      { header: 'Class', key: 'className', width: 16 },
      { header: 'Admission No.', key: 'admissionNumber', width: 16 },
      { header: 'Send To', key: 'contactName', width: 24 },
      { header: 'Number', key: 'dialNumber', width: 18 },
      { header: 'Message', key: 'message', width: 80 },
      { header: 'SMS Parts', key: 'segments', numeric: true, width: 11 },
      { header: 'Status', key: 'status', numeric: true, width: 12 },
    ],
    rows: campaign.recipients.map((recipient, index) => {
      const enrolment = recipient.student.enrollments[0];
      const metrics = measureSms(recipient.renderedBody);
      return {
        sr: index + 1,
        student: recipient.student.fullName,
        className: enrolment
          ? `${enrolment.schoolClass.name} — ${enrolment.section.name}`
          : '',
        admissionNumber: recipient.student.admissionNumber,
        contactName: recipient.contactName,
        dialNumber: recipient.dialNumber,
        message: recipient.renderedBody,
        segments: metrics.segments,
        status: recipient.status,
      };
    }),
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: spreadsheetHeaders(`${fileBase}.xlsx`),
  });
}
