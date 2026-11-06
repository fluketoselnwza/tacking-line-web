import { describe,it,expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseWorkbook,calendarDate,weight,HEADERS,toCSV } from '../src/lib/excel';
function book(sheets:Record<string,unknown[][]>,date1904=false){const wb=XLSX.utils.book_new();wb.Workbook={WBProps:{date1904}};for(const [name,rows]of Object.entries(sheets))XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),name);return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});}
const row=(date:unknown='2026-07-01',no=1,kg:unknown=1200,tons:unknown=1.2,mass:unknown=null)=>[date,no,'P01','R01','NEW-LINE',mass,kg,tons,'FG','EX99'];
describe('Excel parsing',()=>{
 it.each(['', '-'])('accepts missing values in every column (%s)',value=>{
   const r=parseWorkbook(book({usage:[HEADERS,[value,value,'P01',value,value,value,value,value,value,value],[value,value,'P02',value,value,value,value,value,value,value]]}));
   expect(r.errors).toEqual([]);expect(r.rows).toHaveLength(2);
   expect(r.rows[0]).toMatchObject({usageDate:null,recordNo:null,eachKg:null,eachTons:null,sumMassKg:null,recipeCode:'',remark:''});
 });
 it('accepts REMIX and tons without KG',()=>{
   const cells=row();cells[6]='-';cells[7]=0.94;cells[8]='REMIX';
   const r=parseWorkbook(book({usage:[HEADERS,cells]}));expect(r.errors).toEqual([]);expect(r.rows[0]).toMatchObject({eachKg:null,eachTons:'0.94',remark:'REMIX'});
 });

 it('imports usage sheets across months; ignores pivot summaries',()=>{const r=parseWorkbook(book({'ยอดใช้ JUL':[HEADERS,row()],'ยอดใช้ Aug':[HEADERS,row('2026-08-02')],'PIVOT JUL':[['total',999999]]}));expect(r.rows).toHaveLength(2);expect(r.ignoredSheets).toEqual(['PIVOT JUL']);expect(r.errors).toEqual([]);});
 it('preserves missing SUM MASS and canonical KG -> Tons',()=>{const r=parseWorkbook(book({'ยอดใช้ JUL':[HEADERS,row('2026-07-01',1,'1234.567890123','1.234567890123')]}));expect(r.rows[0].sumMassKg).toBeNull();expect(r.rows[0].eachKg).toBe('1234.567890123');expect(r.rows[0].eachTons).toBe('1.234567890123');});
 it('rejects mismatched tons without silently correcting source',()=>{expect(parseWorkbook(book({usage:[HEADERS,row('2026-07-01',1,1200,1.3)]})).errors[0].fieldName).toBe('EACH(Tons)');});
 it.each([[6188,6.19,'6.188'],[6188,6.188,'6.188'],[6184,6.18,'6.184'],[6185,6.19,'6.185'],[9995,10,'9.995']])('accepts rounded tons for %s KG and preserves both values',(kg,tons,canonical)=>{const r=parseWorkbook(book({usage:[HEADERS,row('2026-07-01',1,kg,tons)]}));expect(r.errors).toEqual([]);expect(r.rows[0].eachTons).toBe(canonical);expect(r.rows[0].sourceEachTons).toBe(String(tons));});
 it.each([6.18,6.3,6.189])('rejects incorrect rounding to %s tons',tons=>{const r=parseWorkbook(book({usage:[HEADERS,row('2026-07-01',1,6188,tons)]}));expect(r.errors[0].fieldName).toBe('EACH(Tons)');expect(r.rows).toEqual([]);});
 it('calculates tons when source tons is empty',()=>{const r=parseWorkbook(book({usage:[HEADERS,row('2026-07-01',1,1200,null)]}));expect(r.rows[0].eachTons).toBe('1.2');expect(r.rows[0].sourceEachTons).toBeNull();});
 it.each([0.94,0.9388600000000001])('accepts 938.86 KG with numeric tons %s',tons=>{
   const r=parseWorkbook(book({usage:[HEADERS,row('2026-07-01',1,938.8600000000001,tons,0.30000000000000004)]}));
   expect(r.errors).toEqual([]);
   expect(r.rows[0].eachKg).toBe('938.86');
   expect(r.rows[0].eachTons).toBe('0.93886');
   expect(r.rows[0].sumMassKg).toBe('0.3');
 });
 it('keeps strict decimal validation for text cells',()=>{
   const r=parseWorkbook(book({usage:[HEADERS,row('2026-07-01',1,'0.1234567890123456',null)]}));
   expect(r.errors[0].fieldName).toBe('EACH(KG)');
   expect(r.rows).toEqual([]);
 });
 it('flags duplicate day + No. across sheets as ambiguous',()=>{const r=parseWorkbook(book({usage:[HEADERS,row()],usage2:[HEADERS,row()]}));expect(r.ambiguous).toBe(true);expect(r.validRows).toBe(0);});
 it('allows repeated recipes/products with distinct date or No.',()=>{expect(parseWorkbook(book({usage:[HEADERS,row(),row('2026-07-01',2),row('2026-07-02')]})).validRows).toBe(3);});
 it('checks required headers',()=>{const r=parseWorkbook(book({usage:[HEADERS.slice(0,9),row()]}));expect(r.errors[0].fieldName).toBe('headers');});
 it('rejects invalid numerical/date values',()=>{const r=parseWorkbook(book({usage:[HEADERS,row('31/02/2026',1,'oops',null)]}));expect(r.rows).toHaveLength(0);expect(r.errors.map(e=>e.fieldName)).toEqual(['Date','EACH(KG)']);});
 it('preserves unmerged missing dates',()=>{const r=parseWorkbook(book({usage:[HEADERS,row(),row(null,2)]}));expect(r.errors).toEqual([]);expect(r.rows[1].usageDate).toBeNull();});
 it('supports binary .xls workbooks',()=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([HEADERS,row()]),'usage');expect(parseWorkbook(XLSX.write(wb,{type:'buffer',bookType:'biff8'})).validRows).toBe(1);});
});
describe('calendar dates and decimal precision',()=>{
 it.each([['2026-07-01','2026-07-01'],['01/07/2569','2026-07-01'],['1-Jul-2026','2026-07-01'],[46204,'2026-07-01']])('parses %s without shifting timezone',(v,expected)=>{expect(calendarDate(v)).toBe(expected);});
 it('supports Excel 1904 epoch',()=>expect(calendarDate(0,true)).toBe('1904-01-01'));
 it('rejects impossible dates and Excel fictitious leap day',()=>{expect(()=>calendarDate('2025-02-29')).toThrow();expect(()=>calendarDate(60)).toThrow();});
 it('preserves decimals without binary addition',()=>{expect(weight('1,234.000000001')).toBe('1234.000000001');expect(weight(null,true)).toBeNull();expect(()=>weight('12,34')).toThrow();expect(()=>weight(-1)).toThrow();});
 it('escapes CSV formula injection',()=>expect(toCSV([{recipe:'=CMD()'}])).toContain("'=CMD()"));
});
