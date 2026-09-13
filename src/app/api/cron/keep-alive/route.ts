import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Keeps the database from being paused for inactivity.
 *
 * Supabase pauses a free-plan project after roughly seven days without user
 * queries. For a school that is exactly what happens over the winter and summer
 * holidays: nobody opens the system, the database is paused, and the first
 * member of staff back in term time is met with a connection error until
 * somebody resumes it from the Supabase dashboard.
 *
 * A single cheap query a day prevents that. It is scheduled in vercel.json.
 *
 * Set CRON_SECRET in the project's environment variables and Vercel sends it as
 * a bearer token; the endpoint then refuses anything else. Without it the
 * endpoint stays open, which is tolerable because it only counts rows and
 * returns no academy data — but setting it is better.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = request.headers.get('authorization');
    if (provided !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
    }
  }

  try {
    // A real query against a real table is what counts as activity. Before the
    // first migration there are no tables, so fall back to something that
    // always works rather than failing the job.
    let students: number | null = null;
    try {
      students = await prisma.student.count();
    } catch {
      await prisma.$queryRaw`SELECT 1`;
    }

    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      students,
    });
  } catch (error) {
    console.error('[keep-alive] database unreachable', error);
    return NextResponse.json(
      { ok: false, error: 'The database did not respond.' },
      { status: 503 },
    );
  }
}
