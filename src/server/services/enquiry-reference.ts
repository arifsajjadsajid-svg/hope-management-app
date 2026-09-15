import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/** "ENQ-2026-0042", unique and easy to read out over the phone. */
export async function nextEnquiryReference(
  db: typeof prisma | Prisma.TransactionClient = prisma,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `ENQ-${year}-`;

  const latest = await db.admissionEnquiry.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: 'desc' },
    select: { reference: true },
  });

  const nextNumber = latest ? Number(latest.reference.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(nextNumber).padStart(4, '0')}`;
}
