import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const STATIONS_DATA = [
  { stationNo: 1, name: 'Aacharyo ka mohalla', perYear: 5500 },
  { stationNo: 2, name: 'Medi ka bas', perYear: 5500 },
  { stationNo: 3, name: 'Manadhniya ka bhwan', perYear: 5500 },
  { stationNo: 4, name: 'Nala bazaar', perYear: 5500 },
  { stationNo: 5, name: 'Jawahar school', perYear: 5500 },
  { stationNo: 6, name: 'Bala ji Nagar', perYear: 5500 },
  { stationNo: 7, name: 'Barla ka Bas', perYear: 5500 },
  { stationNo: 8, name: 'Kuchaman college', perYear: 5500 },
  { stationNo: 9, name: 'Kuchaman velly', perYear: 7500 },
  { stationNo: 10, name: 'Trisngiya', perYear: 7500 },
  { stationNo: 11, name: 'Sitapur (palra pyau)', perYear: 8000 },
  { stationNo: 12, name: 'Palara', perYear: 8500 },
  { stationNo: 13, name: 'Narayanpura', perYear: 8500 },
  { stationNo: 14, name: 'Mithri', perYear: 9500 },
  { stationNo: 15, name: 'Kotwaliyo ki Dhani', perYear: 9800 },
  { stationNo: 16, name: 'Torda', perYear: 7000 },
  { stationNo: 17, name: 'Suredarnagar', perYear: 5500 },
  { stationNo: 18, name: 'Mirdha Nagar', perYear: 5500 },
  { stationNo: 19, name: 'Jhalra Kuwa', perYear: 5500 },
  { stationNo: 20, name: 'Netwalo ki Dhani', perYear: 5800 },
  { stationNo: 21, name: 'Chejaro ki Kothi', perYear: 5500 },
  { stationNo: 22, name: 'Sharawanpura', perYear: 5700 },
  { stationNo: 23, name: 'Khandali kothi', perYear: 5500 },
  { stationNo: 24, name: 'Kala bhata ki dhani', perYear: 7300 },
  { stationNo: 25, name: 'Bala ji College', perYear: 7500 },
  { stationNo: 26, name: 'Bala ji College Extended', perYear: 8500 },
  { stationNo: 27, name: 'Ranasar', perYear: 7000 },
  { stationNo: 28, name: 'Aanadpura', perYear: 8500 },
  { stationNo: 29, name: 'Aasanpura', perYear: 7800 },
  { stationNo: 30, name: 'Rewara ki kothi', perYear: 7300 },
  { stationNo: 31, name: 'Baba ki dhani', perYear: 8500 },
  { stationNo: 32, name: 'Nimod', perYear: 9000 },
  { stationNo: 33, name: 'Motiram ji ki kothi', perYear: 5500 },
  { stationNo: 34, name: 'Shivmandir khariya road', perYear: 5500 },
  { stationNo: 35, name: 'Bhata ka bas', perYear: 5500 },
  { stationNo: 36, name: 'Bhopa ka bas', perYear: 5500 },
  { stationNo: 37, name: 'Pandaya ji ki kothi', perYear: 5500 },
  { stationNo: 38, name: 'Khariya', perYear: 6800 },
  { stationNo: 39, name: 'Ramnagar', perYear: 7000 },
  { stationNo: 40, name: 'Hirani moad', perYear: 7500 },
  { stationNo: 41, name: 'Shreenagar', perYear: 8500 },
  { stationNo: 42, name: 'Sindhpura', perYear: 8000 },
  { stationNo: 43, name: 'Bhanwata', perYear: 9000 },
  { stationNo: 44, name: 'Shekhawato ki dhani', perYear: 8500 },
  { stationNo: 45, name: 'Hirani', perYear: 7500 },
  { stationNo: 46, name: 'Lakh ji ka bas', perYear: 7000 },
  { stationNo: 47, name: 'Haritnagar', perYear: 6500 },
  { stationNo: 48, name: 'Sanjodh', perYear: 7000 },
  { stationNo: 49, name: 'Dhan ji ka bag', perYear: 5500 },
  { stationNo: 50, name: 'Amarnagar', perYear: 5500 },
  { stationNo: 51, name: 'Premraj ji ka Bansra', perYear: 4500 },
  { stationNo: 52, name: 'Swami wali kothi', perYear: 5800 },
  { stationNo: 53, name: 'Jodpura', perYear: 6500 },
  { stationNo: 54, name: 'Maliyon Ki Dhani', perYear: 7000 },
  { stationNo: 55, name: 'Jaswantpura', perYear: 7500 },
  { stationNo: 56, name: 'Aaspura', perYear: 5500 },
  { stationNo: 57, name: 'Tarnau farm', perYear: 6000 },
  { stationNo: 58, name: 'Simariya sagar', perYear: 5500 },
  { stationNo: 59, name: 'Deeppura', perYear: 7800 },
  { stationNo: 60, name: 'Jiliya', perYear: 7500 },
  { stationNo: 61, name: 'Charanwas', perYear: 8500 },
  { stationNo: 62, name: 'Panchwa', perYear: 8500 },
  { stationNo: 63, name: 'Aatya kuwa', perYear: 7500 },
  { stationNo: 64, name: 'Kerpura', perYear: 9000 },
  { stationNo: 65, name: 'Sabalpura', perYear: 9500 }
];

const ENGLISH_TUITION: Record<string, number> = {
  'Nursery': 8500,
  'LKG': 10500,
  'UKG': 13500,
  '1': 15000,
  '2': 17000,
  '3': 18000,
  '4': 19000,
  '5': 20000,
  '6': 21000,
  '7': 22000,
  '8': 23500,
  '9': 25000,
  '10': 26500,
  '11 (Science)': 38000,
  '12 (Science)': 40000
};

const HINDI_TUITION: Record<string, number> = {
  'LKG': 8000,
  'UKG': 8500,
  '1': 11500,
  '2': 12500,
  '3': 13500,
  '4': 14000,
  '5': 15000,
  '6': 16000,
  '7': 17000,
  '8': 18000,
  '9': 22500,
  '10': 26000,
  '11 (Arts)': 26000,
  '11 (Science)': 36500,
  '11 (Sci. Ag.)': 31000,
  '12 (Arts)': 28000,
  '12 (Science)': 38500,
  '12 (Sci. Ag.)': 35000
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    console.log('[MIGRATION] Starting fee structures & bus fares updates...');

    // 1. Rename units in case they were reset
    await prisma.unit.update({ where: { id: 'hindi' }, data: { name: 'New Modern Sr. Sec. School' } });
    await prisma.unit.update({ where: { id: 'english' }, data: { name: 'Modern English School' } });
    await prisma.unit.update({ where: { id: 'college' }, data: { name: 'Modern Mahila Mahavidhyalaya' } });
    await prisma.unit.update({ where: { id: 'hostel' }, data: { name: 'Modern Hostel' } });

    // 2. Upsert the 65 Bus Stations
    let stationsUpdated = 0;
    for (const st of STATIONS_DATA) {
      await prisma.busStation.upsert({
        where: { stationNo: st.stationNo },
        update: { name: st.name, perYear: st.perYear, perMonth: 0 },
        create: { stationNo: st.stationNo, name: st.name, perYear: st.perYear, perMonth: 0 }
      });
      stationsUpdated++;
    }
    console.log(`[MIGRATION] Upserted ${stationsUpdated} bus stations.`);

    // Delete any extra bus stations not in the new 65 list (e.g. Sujanpura)
    const deletedExtraStations = await prisma.busStation.deleteMany({
      where: {
        stationNo: { notIn: STATIONS_DATA.map(s => s.stationNo) }
      }
    });
    console.log(`[MIGRATION] Deleted ${deletedExtraStations.count} extra bus stations.`);

    // 3. Remove "Admission Fee" components and clean allocations
    const admissionComponents = await prisma.feeComponent.findMany({
      where: { name: 'Admission Fee' }
    });
    const admissionComponentIds = admissionComponents.map(c => c.id);

    // Delete unpaid Admission Fee allocations
    const deletedAdmissionAllocations = await prisma.feeAllocation.deleteMany({
      where: {
        feeComponentId: { in: admissionComponentIds },
        amountPaid: 0
      }
    });

    // Cap paid Admission Fee allocations to amountPaid so they are fully settled
    const paidAdmissionAllocations = await prisma.feeAllocation.findMany({
      where: {
        feeComponentId: { in: admissionComponentIds },
        amountPaid: { gt: 0 }
      }
    });

    let cappedAdmissionAllocationsCount = 0;
    for (const alloc of paidAdmissionAllocations) {
      await prisma.feeAllocation.update({
        where: { id: alloc.id },
        data: {
          amountDue: alloc.amountPaid,
          status: 'PAID'
        }
      });
      cappedAdmissionAllocationsCount++;
    }

    // Set the Admission Fee component amount to 0 (cannot delete due to foreign key constraints on paid allocations)
    await prisma.feeComponent.updateMany({
      where: { id: { in: admissionComponentIds } },
      data: { amount: 0 }
    });

    // 4. Update / Sync Class Fee Structures and Components for 2026-27
    const currentSession = '2026-27';
    let tuitionComponentsUpdated = 0;

    // English structures
    for (const [classKey, newTuition] of Object.entries(ENGLISH_TUITION)) {
      let struct = await prisma.feeStructure.findFirst({
        where: { unitId: 'english', className: classKey, academicYear: currentSession }
      });
      if (!struct) {
        struct = await prisma.feeStructure.create({
          data: {
            name: `Fee Structure — Class ${classKey} (${currentSession})`,
            unitId: 'english',
            className: classKey,
            academicYear: currentSession
          }
        });
      }
      // Upsert Tuition Fee component
      await prisma.feeComponent.upsert({
        where: {
          // Since there is no unique constraint on (feeStructureId, name), we query first
          id: (await prisma.feeComponent.findFirst({
            where: { feeStructureId: struct.id, name: 'Tuition Fee' }
          }))?.id || '00000000-0000-0000-0000-000000000000'
        },
        update: { amount: newTuition },
        create: {
          feeStructureId: struct.id,
          name: 'Tuition Fee',
          amount: newTuition
        }
      });
      tuitionComponentsUpdated++;
    }

    // Hindi structures
    for (const [classKey, newTuition] of Object.entries(HINDI_TUITION)) {
      let struct = await prisma.feeStructure.findFirst({
        where: { unitId: 'hindi', className: classKey, academicYear: currentSession }
      });
      if (!struct) {
        struct = await prisma.feeStructure.create({
          data: {
            name: `Fee Structure — Class ${classKey} (${currentSession})`,
            unitId: 'hindi',
            className: classKey,
            academicYear: currentSession
          }
        });
      }
      // Upsert Tuition Fee component
      await prisma.feeComponent.upsert({
        where: {
          id: (await prisma.feeComponent.findFirst({
            where: { feeStructureId: struct.id, name: 'Tuition Fee' }
          }))?.id || '00000000-0000-0000-0000-000000000000'
        },
        update: { amount: newTuition },
        create: {
          feeStructureId: struct.id,
          name: 'Tuition Fee',
          amount: newTuition
        }
      });
      tuitionComponentsUpdated++;
    }

    // 5. Update/Sync registered student allocations
    const students = await prisma.student.findMany({
      where: {
        unitId: { in: ['english', 'hindi'] }
      }
    });

    let studentTuitionUpdated = 0;
    let studentTransportUpdated = 0;

    for (const student of students) {
      const tuitionMap = student.unitId === 'english' ? ENGLISH_TUITION : HINDI_TUITION;
      const targetTuition = tuitionMap[student.className];

      if (targetTuition !== undefined) {
        // Find student's Tuition Fee allocation
        const tuitionAllocation = await prisma.feeAllocation.findFirst({
          where: {
            studentId: student.id,
            feeComponent: { name: 'Tuition Fee' }
          }
        });

        if (tuitionAllocation) {
          const paid = Number(tuitionAllocation.amountPaid);
          const status = paid >= targetTuition ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';

          await prisma.feeAllocation.update({
            where: { id: tuitionAllocation.id },
            data: {
              amountDue: targetTuition,
              status
            }
          });
          studentTuitionUpdated++;
        } else {
          // Create allocation if missing
          const struct = await prisma.feeStructure.findFirst({
            where: { unitId: student.unitId, className: student.className, academicYear: currentSession },
            include: { components: true }
          });
          const tuitionComp = struct?.components.find(c => c.name === 'Tuition Fee');
          if (tuitionComp) {
            await prisma.feeAllocation.create({
              data: {
                studentId: student.id,
                feeComponentId: tuitionComp.id,
                amountDue: targetTuition,
                amountPaid: 0,
                dueDate: student.admissionDate || new Date(),
                status: 'UNPAID'
              }
            });
            studentTuitionUpdated++;
          }
        }
      }

      // Sync active bus service student allocations
      if (student.transportMode === 'BUS_SERVICE' && student.busStationId) {
        const station = await prisma.busStation.findUnique({
          where: { id: student.busStationId }
        });

        if (station) {
          const targetBusFare = Number(station.perYear);
          const transportAllocation = await prisma.feeAllocation.findFirst({
            where: {
              studentId: student.id,
              feeComponent: { name: 'Transport Fee' }
            }
          });

          if (transportAllocation) {
            const paid = Number(transportAllocation.amountPaid);
            const status = paid >= targetBusFare ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';

            await prisma.feeAllocation.update({
              where: { id: transportAllocation.id },
              data: {
                amountDue: targetBusFare,
                status
              }
            });
            studentTransportUpdated++;
          } else {
            // Find or create Transport Fee Component to associate
            let structure = await prisma.feeStructure.findFirst({
              where: { unitId: student.unitId, className: student.className, academicYear: currentSession }
            });
            if (!structure) {
              structure = await prisma.feeStructure.create({
                data: {
                  name: `Fee Structure — Class ${student.className} (${currentSession})`,
                  unitId: student.unitId,
                  className: student.className,
                  academicYear: currentSession
                }
              });
            }
            let component = await prisma.feeComponent.findFirst({
              where: { feeStructureId: structure.id, name: 'Transport Fee' }
            });
            if (!component) {
              component = await prisma.feeComponent.create({
                data: { feeStructureId: structure.id, name: 'Transport Fee', amount: 0 }
              });
            }

            await prisma.feeAllocation.create({
              data: {
                studentId: student.id,
                feeComponentId: component.id,
                amountDue: targetBusFare,
                amountPaid: 0,
                dueDate: student.admissionDate || new Date(),
                status: 'UNPAID'
              }
            });
            studentTransportUpdated++;
          }
        }
      }
    }

    // 6. Verify active bus riders allocations
    const activeRiders = await prisma.student.findMany({
      where: {
        transportMode: 'BUS_SERVICE',
        busStationId: { not: null }
      },
      include: {
        busStation: true,
        feeAllocations: {
          where: {
            feeComponent: { name: 'Transport Fee' }
          }
        }
      }
    });

    const verificationDetails = activeRiders.map(student => {
      const station = student.busStation;
      const allocation = student.feeAllocations[0];
      const targetFare = station ? Number(station.perYear) : 0;
      const allocatedFare = allocation ? Number(allocation.amountDue) : 0;
      const isCorrect = allocatedFare === targetFare && targetFare > 0;
      return {
        studentName: student.name,
        className: student.className,
        stationName: station?.name || 'N/A',
        targetFare,
        allocatedFare,
        isCorrect
      };
    });

    const correctCount = verificationDetails.filter(v => v.isCorrect).length;

    return NextResponse.json({
      message: 'Successfully migrated all fee structures, removed Admission Fee, and updated student ledgers.',
      report: {
        busStationsUpserted: stationsUpdated,
        deletedAdmissionAllocationsCount: deletedAdmissionAllocations.count,
        cappedAdmissionAllocationsCount,
        tuitionStructuresSynced: tuitionComponentsUpdated,
        studentTuitionAllocationsUpdated: studentTuitionUpdated,
        studentTransportAllocationsUpdated: studentTransportUpdated
      },
      verification: {
        totalActiveRiders: activeRiders.length,
        correctlyAllocatedCount: correctCount,
        mismatchedCount: activeRiders.length - correctCount,
        ridersList: verificationDetails
      }
    });
  } catch (err: any) {
    console.error('[MIGRATION] Failed to execute updates:', err);
    return NextResponse.json(
      { error: err.message || 'Database transaction failed.' },
      { status: 500 }
    );
  }
}
