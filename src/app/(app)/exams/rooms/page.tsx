import type { Metadata } from 'next';
import { DoorOpen } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/layout/page-header';
import { Card, EmptyState, Badge } from '@/components/ui/primitives';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { StatCard } from '@/components/ui/stat-card';
import { RoomDialog, DeleteRoomButton } from './room-clients';

export const metadata: Metadata = { title: 'Examination Rooms' };
export const dynamic = 'force-dynamic';

export default async function RoomsPage() {
  const user = await requirePermission('exams.view');
  const canManage = userCan(user, 'rooms.manage');

  const rooms = await prisma.examRoom.findMany({
    include: { _count: { select: { seats: true, dateSheets: true, invigilations: true } } },
    orderBy: [{ isActive: 'desc' }, { roomNumber: 'asc' }],
  });

  const activeRooms = rooms.filter((r) => r.isActive);
  const totalCapacity = activeRooms.reduce(
    (sum, room) => sum + Math.min(room.capacity, room.rowCount * room.colCount),
    0,
  );

  return (
    <>
      <PageHeader
        title="Examination Rooms"
        description="Halls and rooms used for examinations. The seat grid drives the automatic seating plan."
        breadcrumbs={[{ label: 'Examinations', href: '/exams' }, { label: 'Rooms' }]}
        actions={canManage && <RoomDialog />}
      />

      <section className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatCard label="Total Rooms" value={rooms.length} tone="navy" />
        <StatCard label="Available" value={activeRooms.length} tone="emerald" />
        <StatCard label="Total Seats" value={totalCapacity} tone="royal" hint="across available rooms" />
        <StatCard
          label="Largest Room"
          value={activeRooms.length ? Math.max(...activeRooms.map((r) => r.capacity)) : 0}
          tone="gold"
          hint="seats"
        />
      </section>

      <Card>
        {rooms.length === 0 ? (
          <EmptyState
            icon={<DoorOpen className="h-6 w-6" />}
            title="No examination rooms"
            description="Add the halls and rooms used for examinations so seating plans and duty rosters can be generated."
            action={canManage && <RoomDialog />}
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Room</Th>
                  <Th>Number</Th>
                  <Th>Building</Th>
                  <Th align="center">Grid</Th>
                  <Th align="center">Grid Seats</Th>
                  <Th align="center">Capacity</Th>
                  <Th align="center">Seated Now</Th>
                  <Th align="center">Duties</Th>
                  <Th>Status</Th>
                  {canManage && <Th align="right">Actions</Th>}
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => {
                  const gridSeats = room.rowCount * room.colCount;
                  return (
                    <tr key={room.id} className={room.isActive ? undefined : 'opacity-60'}>
                      <Td className="font-bold text-navy-900">{room.name}</Td>
                      <Td className="whitespace-nowrap tabular text-slate-700">{room.roomNumber}</Td>
                      <Td className="text-slate-600">{room.building ?? '—'}</Td>
                      <Td align="center" className="tabular text-slate-600">
                        {room.rowCount} × {room.colCount}
                      </Td>
                      <Td align="center" className="tabular text-slate-600">
                        {gridSeats}
                      </Td>
                      <Td align="center" className="font-semibold tabular">
                        {room.capacity}
                        {room.capacity > gridSeats && (
                          <span className="ml-1 text-[10.5px] text-amber-600">exceeds grid</span>
                        )}
                      </Td>
                      <Td align="center" className="tabular text-slate-600">
                        {room._count.seats}
                      </Td>
                      <Td align="center" className="tabular text-slate-600">
                        {room._count.invigilations}
                      </Td>
                      <Td>
                        {room.isActive ? (
                          <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">Available</Badge>
                        ) : (
                          <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">Unavailable</Badge>
                        )}
                      </Td>
                      {canManage && (
                        <Td align="right">
                          <div className="flex items-center justify-end gap-0.5">
                            <RoomDialog
                              room={{
                                id: room.id,
                                name: room.name,
                                roomNumber: room.roomNumber,
                                building: room.building ?? '',
                                capacity: room.capacity,
                                rowCount: room.rowCount,
                                colCount: room.colCount,
                                isActive: room.isActive,
                              }}
                            />
                            {room._count.seats === 0 &&
                              room._count.dateSheets === 0 &&
                              room._count.invigilations === 0 && (
                                <DeleteRoomButton id={room.id} name={room.name} />
                              )}
                          </div>
                        </Td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
