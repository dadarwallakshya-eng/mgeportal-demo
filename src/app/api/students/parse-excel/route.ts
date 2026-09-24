import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

export const maxDuration = 60; // Allow sufficient parsing time for large sheets

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded', code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return NextResponse.json(
        { error: 'Uploaded workbook does not contain any sheets.', code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    const rows: string[][] = [];
    let headerRow: string[] = [];

    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const cellValues: string[] = [];
      
      // Use cell values as formatted text or direct values
      for (let c = 1; c <= worksheet.columnCount; c++) {
        const cell = row.getCell(c);
        let val = cell.value;

        // Handle rich text
        if (val && typeof val === 'object' && 'richText' in val) {
          val = val.richText.map((t: any) => t.text).join('');
        }

        // Handle formula values
        if (val && typeof val === 'object' && 'result' in val) {
          val = val.result;
        }

        // Handle Date objects
        if (val instanceof Date) {
          cellValues.push(val.toISOString().split('T')[0]);
        } else if (val === null || val === undefined) {
          cellValues.push('');
        } else {
          cellValues.push(String(val).trim());
        }
      }

      if (rowNumber === 1) {
        headerRow = cellValues;
      } else {
        // Only keep rows that are not entirely blank
        if (cellValues.some(v => v !== '')) {
          rows.push(cellValues);
        }
      }
    });

    return NextResponse.json({
      headers: headerRow,
      rows: rows
    });
  } catch (err: any) {
    console.error('[PARSE_EXCEL] Failed to parse Excel sheet:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to parse Excel workbook.' },
      { status: 500 }
    );
  }
}
