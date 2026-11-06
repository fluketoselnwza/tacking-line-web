import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import { AppError } from './errors';
Decimal.set({ precision: 50 });
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_ROWS = 50000;
export type UsageRow = {
  usageDate: string; recordNo: string; productCode: string; recipeCode: string; lineCode: string;
  sumMassKg: string | null; eachKg: string; eachTons: string; sourceEachTons: string | null;
  remark: string; kibbleCode: string; sourceSheet: string; sourceRow: number;
};
export type RowError = { sheetName: string; rowNumber: number; fieldName: string; errorMessage: string };
export const HEADERS = ['Date', 'No.', 'Products', 'RECIPE', 'LINE', 'SUM MASS(KG)', 'EACH(KG)', 'EACH(Tons)', 'REMARK', 'Usage of kibble'];
const normalize = (v: unknown) => String(v ?? '').replace(/[\s.()_]/g, '').toUpperCase();
export function calendarDate(value: unknown, date1904 = false): string {
  let y: number, m: number, d: number;
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value, { date1904 });
    if (!parsed || (!date1904 && Math.floor(value) === 60)) throw new Error('Invalid Excel date');
    ({ y, m, d } = parsed);
  } else if (value instanceof Date) {
    y = value.getUTCFullYear(); m = value.getUTCMonth() + 1; d = value.getUTCDate();
  } else {
    const str = String(value ?? '').trim();
    const iso = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    const local = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    const named = str.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})$/);
    if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
    else if (local) { y = +local[3]; m = +local[2]; d = +local[1]; }
    else if (named) { y = +named[3]; m = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(named[2].slice(0,3).toLowerCase())+1; d = +named[1]; }
    else throw new Error('วันที่ต้องเป็น Excel date, YYYY-MM-DD หรือ DD/MM/YYYY');
  }
  if (y > 2400) y -= 543;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (y < 1900 || y > 2200 || check.getUTCFullYear() !== y || check.getUTCMonth() + 1 !== m || check.getUTCDate() !== d) throw new Error('วันที่ไม่ถูกต้อง');
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
export function weight(value: unknown, optional = false): string | null {
  if (value === '' || value === null || value === undefined) {
    if (optional) return null;
    throw new Error('ต้องระบุน้ำหนัก');
  }
  const str = String(value).trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(str)) throw new Error('น้ำหนักต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
  const n = new Decimal(str.replace(/,/g, ''));
  if (!n.isFinite() || n.isNegative() || n.gte('1e20') || n.decimalPlaces() > 15) throw new Error('น้ำหนักเกินขอบเขตหรือมีทศนิยมเกิน 15 ตำแหน่ง');
  return n.toFixed();
}
export function parseWorkbook(buffer: Buffer) {
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(buffer, { type:'buffer', cellDates:false, cellNF:true, sheetRows: MAX_ROWS + 101 }); }
  catch { throw new AppError(422, 'ไม่สามารถอ่านไฟล์ Excel ได้'); }
  const rows: UsageRow[] = [], errors: RowError[] = [], sheets: string[] = [], ignoredSheets: string[] = [];
  let totalRows = 0;
  for (const sheetName of workbook.SheetNames) {
    if (/pivot/i.test(sheetName)) { ignoredSheets.push(sheetName); continue; }
    const sheet = workbook.Sheets[sheetName];
    if (sheet['!fullref'] && XLSX.utils.decode_range(sheet['!fullref']).e.r > MAX_ROWS + 100) throw new AppError(413, 'จำนวนแถวเกิน 50,000');
    const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header:1, raw:true, defval:null, blankrows:true });
    const headerIndex = data.slice(0, 50).findIndex(row => normalize(row[0]) === 'DATE' && normalize(row[1]) === 'NO');
    if (headerIndex < 0) {
      if (/ยอดใช้|usage/i.test(sheetName)) errors.push({sheetName,rowNumber:1,fieldName:'headers',errorMessage:'ไม่พบหัวตาราง Date, No. ใน 50 แถวแรก'});
      else ignoredSheets.push(sheetName);
      continue;
    }
    sheets.push(sheetName);
    const missing = HEADERS.filter((h, i) => normalize(data[headerIndex][i]) !== normalize(h));
    if (missing.length) { errors.push({sheetName,rowNumber:headerIndex+1,fieldName:'headers',errorMessage:`หัวตารางไม่ตรง: ${missing.join(', ')}`}); continue; }
    let carriedDate: unknown = null;
    for (let i = headerIndex + 1; i < data.length; i++) {
      const cells = data[i];
      if (cells.every(v=>v === null || v === '')) continue;
      if (normalize(cells[0]) === 'DATE' || /^(grand\s*total|total|รวม)/i.test(String(cells[0] ?? '').trim())) continue;
      // Dates may be merged vertically in source workbooks. Only carry into actual merged A cells.
      const merge = sheet['!merges']?.find(r=>r.s.c === 0 && r.e.c === 0 && r.s.r <= i && r.e.r >= i);
      const rawDate = cells[0] ?? (merge ? carriedDate : null);
      if (cells[0] !== null) carriedDate = cells[0];
      totalRows++;
      if (totalRows > MAX_ROWS) throw new AppError(413, 'จำนวนแถวเกิน 50,000');
      const issues: RowError[] = [];
      const read = <T>(fieldName: string, fn:()=>T, fallback:T):T => { try { return fn(); } catch(e) { issues.push({sheetName,rowNumber:i+1,fieldName,errorMessage:(e as Error).message}); return fallback; } };
      const required = (idx:number) => { const v = String(cells[idx] ?? '').trim(); if (!v || v.length > 120) throw new Error('จำเป็นต้องระบุค่าไม่เกิน 120 ตัวอักษร'); return v; };
      const usageDate = read('Date',()=>calendarDate(rawDate, !!workbook.Workbook?.WBProps?.date1904),'');
      const recordNo = read('No.',()=>required(1),'');
      const productCode = read('Products',()=>required(2),'');
      const recipeCode = read('RECIPE',()=>required(3),'');
      const lineCode = read('LINE',()=>required(4),'');
      const sumMassKg = read('SUM MASS(KG)',()=>weight(cells[5],true),null);
      const eachKg = read('EACH(KG)',()=>weight(cells[6])!,'0');
      const sourceEachTons = read('EACH(Tons)',()=>weight(cells[7],true),null);
      const eachTons = new Decimal(eachKg).div(1000).toFixed();
      if (sourceEachTons !== null) {
        const sourceTons = new Decimal(sourceEachTons);
        // Accept source values rounded half-up; always store the exact KG-derived value.
        const roundedTons = new Decimal(eachTons).toDecimalPlaces(sourceTons.decimalPlaces(), Decimal.ROUND_HALF_UP);
        if (!sourceTons.eq(roundedTons)) issues.push({sheetName,rowNumber:i+1,fieldName:'EACH(Tons)',errorMessage:`ไม่ตรงกับ EACH(KG)/1000 (${eachTons}) แม้ปัดเศษตามทศนิยมของค่าในไฟล์ กรุณาแก้ไขไฟล์`});
      }
      const remark = read('REMARK',()=>{ const v=required(8).toUpperCase(); if (!['FG','WIP'].includes(v)) throw new Error('ต้องเป็น FG หรือ WIP'); return v; },'');
      const kibbleCode = read('Usage of kibble',()=>required(9),'');
      errors.push(...issues);
      if (!issues.length) rows.push({usageDate,recordNo,productCode,recipeCode,lineCode,sumMassKg,eachKg,eachTons,sourceEachTons,remark,kibbleCode,sourceSheet:sheetName,sourceRow:i+1});
    }
  }
  const seen = new Map<string, UsageRow>();
  const duplicateKeys = new Set<string>();
  for (const r of rows) { const key=`${r.usageDate}|${r.recordNo}`; if (seen.has(key)) { const first=seen.get(key)!; if (!duplicateKeys.has(key)) errors.push({sheetName:first.sourceSheet,rowNumber:first.sourceRow,fieldName:'No.',errorMessage:'วันที่ + No. ซ้ำในไฟล์ ต้องตรวจสอบขอบเขตชุดข้อมูล'}); duplicateKeys.add(key); errors.push({sheetName:r.sourceSheet,rowNumber:r.sourceRow,fieldName:'No.',errorMessage:`วันที่ + No. ซ้ำกับ ${first.sourceSheet} แถว ${first.sourceRow}; ต้องตรวจสอบขอบเขตชุดข้อมูล`}); } else seen.set(key,r); }
  if (!sheets.length && !errors.length) throw new AppError(422,'ไม่พบ Sheet ข้อมูลการใช้งาน');
  const validRows = rows.filter(r=>!duplicateKeys.has(`${r.usageDate}|${r.recordNo}`));
  const badRows = new Set(errors.map(e=>`${e.sheetName}:${e.rowNumber}`));
  return { rows:validRows, errors, sheets, ignoredSheets, totalRows, validRows:validRows.length, errorRows:badRows.size, ambiguous:duplicateKeys.size > 0 };
}
export function toExcel(rows: Record<string, unknown>[], sheetName='Report') {
  const workbook = XLSX.utils.book_new();
  const sheet=XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = Object.keys(rows[0] ?? {}).map(()=>({wch:22}));
  XLSX.utils.book_append_sheet(workbook,sheet,sheetName);
  return XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}) as Buffer;
}
export function toCSV(rows: Record<string,unknown>[]) {
  if (!rows.length) return '\uFEFF';
  const escape=(v:unknown)=>`"${String(v ?? '').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')}"`;
  const keys=Object.keys(rows[0]);
  return '\uFEFF'+[keys.map(escape).join(','),...rows.map(r=>keys.map(k=>escape(r[k])).join(','))].join('\r\n');
}
