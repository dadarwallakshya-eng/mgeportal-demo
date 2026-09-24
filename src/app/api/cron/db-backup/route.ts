import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { r2Client, R2_BUCKET_NAME } from '@/lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import AdmZip from 'adm-zip';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Verify Authorization (Cron or Admin Session) ───────────────────────
    const userRole = request.headers.get('x-user-role');
    const userId = request.headers.get('x-user-id');
    const authHeader = request.headers.get('authorization');
    const secret = process.env.CRON_SECRET;
    
    const isCron = secret && authHeader === `Bearer ${secret}`;
    const isAdmin = userRole === 'DIRECTOR';

    if (!isCron && !isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized. Access is restricted to administrators or automated cron triggers.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const downloadRequested = request.nextUrl.searchParams.get('download') === 'true';

    // ── Retrieve All Database Tables ───────────────────────────────────────
    const [
      units,
      users,
      whitelists,
      settings,
      students,
      feeStructures,
      feeComponents,
      concessions,
      allocations,
      feePayments,
      feePaymentDetails,
      staffList,
      salarySlips,
      ledgerAccounts,
      journalEntries,
      transactionLegs,
      budgets,
      buses,
      busStations,
      hostelRooms,
      hostelAllocations,
      transactions,
      hostelResidents,
      hostelStaffList,
      admissionCounters,
      discountLogs,
      staffCounters,
      notifications,
      editLogs,
    ] = await Promise.all([
      prisma.unit.findMany(),
      prisma.user.findMany(),
      prisma.googleWhitelist.findMany(),
      prisma.systemSetting.findMany(),
      prisma.student.findMany(),
      prisma.feeStructure.findMany(),
      prisma.feeComponent.findMany(),
      prisma.studentConcession.findMany(),
      prisma.feeAllocation.findMany(),
      prisma.feePayment.findMany(),
      prisma.feePaymentDetail.findMany(),
      prisma.staff.findMany(),
      prisma.salarySlip.findMany(),
      prisma.ledgerAccount.findMany(),
      prisma.journalEntry.findMany(),
      prisma.transactionLeg.findMany(),
      prisma.budget.findMany(),
      prisma.bus.findMany(),
      prisma.busStation.findMany(),
      prisma.hostelRoom.findMany(),
      prisma.hostelAllocation.findMany(),
      prisma.transaction.findMany(),
      prisma.hostelResident.findMany(),
      prisma.hostelStaff.findMany(),
      prisma.admissionCounter.findMany(),
      prisma.studentDiscountLog.findMany(),
      prisma.staffCounter.findMany(),
      prisma.notification.findMany(),
      prisma.transactionEditLog.findMany(),
    ]);

    // ── Generate JSON Files & Compile ZIP Archive ──────────────────────────
    const zip = new AdmZip();

    const addJsonToZip = (fileName: string, data: any) => {
      zip.addFile(fileName, Buffer.from(JSON.stringify(data, null, 2), 'utf-8'));
    };

    addJsonToZip('units.json', units);
    addJsonToZip('users.json', users);
    addJsonToZip('google_whitelists.json', whitelists);
    addJsonToZip('system_settings.json', settings);
    addJsonToZip('students.json', students);
    addJsonToZip('fee_structures.json', feeStructures);
    addJsonToZip('fee_components.json', feeComponents);
    addJsonToZip('student_concessions.json', concessions);
    addJsonToZip('fee_allocations.json', allocations);
    addJsonToZip('fee_payments.json', feePayments);
    addJsonToZip('fee_payment_details.json', feePaymentDetails);
    addJsonToZip('staff.json', staffList);
    addJsonToZip('salary_slips.json', salarySlips);
    addJsonToZip('ledger_accounts.json', ledgerAccounts);
    addJsonToZip('journal_entries.json', journalEntries);
    addJsonToZip('transaction_legs.json', transactionLegs);
    addJsonToZip('budgets.json', budgets);
    addJsonToZip('buses.json', buses);
    addJsonToZip('bus_stations.json', busStations);
    addJsonToZip('hostel_rooms.json', hostelRooms);
    addJsonToZip('hostel_allocations.json', hostelAllocations);
    addJsonToZip('transactions.json', transactions);
    addJsonToZip('hostel_residents.json', hostelResidents);
    addJsonToZip('hostel_staff.json', hostelStaffList);
    addJsonToZip('admission_counters.json', admissionCounters);
    addJsonToZip('student_discount_logs.json', discountLogs);
    addJsonToZip('staff_counters.json', staffCounters);
    addJsonToZip('notifications.json', notifications);
    addJsonToZip('transaction_edit_logs.json', editLogs);

    const zipBuffer = zip.toBuffer();
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `mge_backup_${dateStr}.zip`;
    const r2Key = `backups/${fileName}`;

    // ── Upload ZIP Backup to Cloudflare R2 ─────────────────────────────────
    if (R2_BUCKET_NAME) {
      try {
        await r2Client.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: r2Key,
            Body: zipBuffer,
            ContentType: 'application/zip',
          })
        );
        console.log(`[BACKUP_CRON] Database backup successfully uploaded to Cloudflare R2: ${r2Key}`);
      } catch (r2Err) {
        console.error('[BACKUP_CRON] Cloudflare R2 upload failed:', r2Err);
      }
    }

    // ── Audit Log ──────────────────────────────────────────────────────────
    const actorId = userId || '00000000-0000-0000-0000-000000000000';
    await logAuditEvent(actorId, 'CREATE', 'DatabaseBackup', actorId, {
      fileName,
      sizeBytes: zipBuffer.length,
      triggeredBy: isCron ? 'SYSTEM_CRON' : 'ADMIN_DIRECTOR',
    });

    // ── Return Response ────────────────────────────────────────────────────
    if (downloadRequested) {
      return new NextResponse(zipBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename=${fileName}`,
          'Content-Length': zipBuffer.length.toString(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: 'System database backup generated successfully and stored in Cloudflare R2.',
      fileName,
      sizeBytes: zipBuffer.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[BACKUP_CRON] System backup generation failed:', error);
    return NextResponse.json(
      { error: error.message || 'System backup generation failed.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
