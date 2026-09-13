import ExcelJS from 'exceljs';
import type { AcademyProfile } from '@/lib/settings';

export type SheetColumn = {
  header: string;
  key: string;
  width?: number;
  /** Right-aligned numeric column. */
  numeric?: boolean;
};

/**
 * Builds a branded workbook: an academy title block, a styled header row and
 * frozen panes, so exported files look like academy documents rather than raw
 * database dumps.
 */
export async function buildWorkbook(options: {
  academy: AcademyProfile;
  sheetName: string;
  documentTitle: string;
  subtitle?: string;
  columns: SheetColumn[];
  rows: Record<string, unknown>[];
  /** Extra label/value pairs printed under the subtitle. */
  meta?: [string, string][];
}): Promise<Buffer> {
  const { academy, sheetName, documentTitle, subtitle, columns, rows, meta } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = academy.name;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName.slice(0, 31), {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  const lastColumn = columns.length;
  const merge = (row: number) => sheet.mergeCells(row, 1, row, Math.max(1, lastColumn));

  // ---- title block
  sheet.getCell('A1').value = academy.name.toUpperCase();
  merge(1);
  Object.assign(sheet.getCell('A1'), {
    font: { size: 16, bold: true, color: { argb: 'FF0F2547' } },
    alignment: { horizontal: 'center' },
  });

  sheet.getCell('A2').value = `${academy.address}  |  ${academy.contactLine}`;
  merge(2);
  Object.assign(sheet.getCell('A2'), {
    font: { size: 10, color: { argb: 'FF3A4A60' } },
    alignment: { horizontal: 'center' },
  });

  sheet.getCell('A3').value = documentTitle;
  merge(3);
  Object.assign(sheet.getCell('A3'), {
    font: { size: 12, bold: true, color: { argb: 'FFFFFFFF' } },
    alignment: { horizontal: 'center' },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2547' } },
  });

  let cursor = 4;
  if (subtitle) {
    sheet.getCell(`A${cursor}`).value = subtitle;
    merge(cursor);
    Object.assign(sheet.getCell(`A${cursor}`), {
      font: { size: 10, italic: true, color: { argb: 'FF3A4A60' } },
      alignment: { horizontal: 'center' },
    });
    cursor += 1;
  }

  if (meta?.length) {
    sheet.getCell(`A${cursor}`).value = meta.map(([k, v]) => `${k}: ${v}`).join('     ');
    merge(cursor);
    Object.assign(sheet.getCell(`A${cursor}`), {
      font: { size: 9, color: { argb: 'FF3A4A60' } },
      alignment: { horizontal: 'center' },
    });
    cursor += 1;
  }

  cursor += 1; // spacer row

  // ---- header row
  const headerRow = sheet.getRow(cursor);
  columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E368A' } };
    cell.alignment = { horizontal: column.numeric ? 'center' : 'left', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF24384F' } },
      left: { style: 'thin', color: { argb: 'FF24384F' } },
      bottom: { style: 'thin', color: { argb: 'FF24384F' } },
      right: { style: 'thin', color: { argb: 'FF24384F' } },
    };
  });
  headerRow.height = 22;
  const headerRowNumber = cursor;

  // ---- data rows
  rows.forEach((row, rowIndex) => {
    const excelRow = sheet.getRow(headerRowNumber + 1 + rowIndex);
    columns.forEach((column, columnIndex) => {
      const cell = excelRow.getCell(columnIndex + 1);
      const value = row[column.key];
      cell.value = (value ?? '') as ExcelJS.CellValue;
      cell.font = { size: 10 };
      cell.alignment = { horizontal: column.numeric ? 'center' : 'left', vertical: 'middle' };
      cell.border = {
        top: { style: 'hair', color: { argb: 'FFCBD5E1' } },
        left: { style: 'hair', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'hair', color: { argb: 'FFCBD5E1' } },
        right: { style: 'hair', color: { argb: 'FFCBD5E1' } },
      };
      if (rowIndex % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6FA' } };
      }
    });
  });

  // ---- widths, filter and frozen panes
  columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column.width ?? Math.max(12, column.header.length + 4);
  });
  sheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber + rows.length, column: Math.max(1, lastColumn) },
  };
  sheet.views = [{ state: 'frozen', ySplit: headerRowNumber }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Standard download headers for a generated spreadsheet. */
export function spreadsheetHeaders(fileName: string): HeadersInit {
  return {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Cache-Control': 'no-store',
  };
}

/** Reads the first worksheet of an uploaded workbook or CSV into plain rows. */
export async function readWorkbookRows(
  buffer: Buffer,
  fileName: string,
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const workbook = new ExcelJS.Workbook();

  if (fileName.toLowerCase().endsWith('.csv')) {
    // ExcelJS's CSV reader needs a stream; parse simple CSV directly instead so
    // quoted commas and BOMs are handled predictably.
    return parseCsv(buffer.toString('utf8'));
  }

  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? '').trim();
  });

  const rows: Record<string, string>[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, index) => {
      if (!header) return;
      const cell = row.getCell(index + 1);
      let value = cell.value;
      if (value && typeof value === 'object' && 'text' in value) value = (value as { text: string }).text;
      if (value instanceof Date) value = value.toISOString().slice(0, 10);
      const text = value === null || value === undefined ? '' : String(value).trim();
      if (text) hasValue = true;
      record[header] = text;
    });
    if (hasValue) rows.push(record);
  });

  return { headers: headers.filter(Boolean), rows };
}

/** Minimal RFC-4180 CSV parser covering quoted fields and embedded newlines. */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const clean = text.replace(/^﻿/, '');
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const [headerRecord, ...dataRecords] = records;
  if (!headerRecord) return { headers: [], rows: [] };

  const headers = headerRecord.map((h) => h.trim());
  const rows = dataRecords
    .filter((r) => r.some((cell) => cell.trim() !== ''))
    .map((r) => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (header) record[header] = (r[index] ?? '').trim();
      });
      return record;
    });

  return { headers: headers.filter(Boolean), rows };
}
