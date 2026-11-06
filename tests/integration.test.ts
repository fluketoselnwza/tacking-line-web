import { config } from '../src/lib/config';
import { describe,it,expect,beforeAll,afterAll } from 'vitest';
import * as XLSX from 'xlsx';
// Integration tests require a dedicated migrated database. No truncate/delete-all.
const enabled=config.runDbTests;
import { db } from '../src/lib/db';
import { previewImport,confirmImport,rollbackBatch,writeTransaction } from '../src/lib/imports';
import { modifyRecord } from '../src/lib/records';
import { dashboard } from '../src/lib/analytics';
import { parseFilters } from '../src/lib/filters';
import { HEADERS } from '../src/lib/excel';
import { assertRole,type Actor } from '../src/lib/auth';
const dataset=`TEST_${Date.now()}`;
let actor:Actor;
const file=(kg=1000,date='2026-07-01',no=1)=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([HEADERS,[date,no,'P','R','L',null,kg,kg/1000,'FG','EX1']]),'ยอดใช้ JUL');const buffer=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});return new File([buffer],'test.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});};
describe.skipIf(!enabled)('PostgreSQL integration: import transactions and audit',()=>{
 beforeAll(async()=>{const u=await db.user.create({data:{email:`${dataset}@test.local`,name:'Integration test',passwordHash:'unused',role:'ADMIN'}});actor=u;});
 afterAll(async()=>{if(actor){await db.materialUsage.deleteMany({where:{dataset}});await db.auditLog.deleteMany({where:{userId:actor.id}});await db.importBatch.deleteMany({where:{dataset}});await db.user.delete({where:{id:actor.id}});}await db.$disconnect();});
 it('imports, deduplicates file, replaces atomically, restores previous records',async()=>{
  const p=await previewImport(file(),dataset,actor);await confirmImport(p.batchId,'skip',actor);
  expect((await db.materialUsage.findMany({where:{dataset}}))[0].sumMassKg).toBeNull();
  const duplicate=await previewImport(file(),dataset,actor);expect(duplicate.fileMatches).toHaveLength(1);expect((await confirmImport(duplicate.batchId,'skip',actor)).skippedRows).toBe(1);
  const replacement=await previewImport(file(2500),dataset,actor);await confirmImport(replacement.batchId,'replace',actor);
  expect((await db.materialUsage.findMany({where:{dataset}}))[0].eachKg!.toFixed()).toBe('2500');
  await rollbackBatch(replacement.batchId,actor);
  expect((await db.materialUsage.findMany({where:{dataset}}))[0].eachKg!.toFixed()).toBe('1000');
  const report=await dashboard(parseFilters(new URLSearchParams({dataset,from:'2026-07-01',to:'2026-07-01'})));
  expect(report.metrics.totalTons).toBe('1');expect(report.metrics.totalSumMassKg).toBe('0');expect(report.metrics.totalRecords).toBe(1);
 });
 it('rolls back a database mutation when a later statement fails',async()=>{
  const before=await db.materialUsage.count({where:{dataset}});
  await expect(writeTransaction(async tx=>{await tx.materialUsage.deleteMany({where:{dataset}});throw new Error('deliberate failure');})).rejects.toThrow('deliberate failure');
  expect(await db.materialUsage.count({where:{dataset}})).toBe(before);
 });
 it('blocks confirmation of invalid data without changing existing records',async()=>{
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([HEADERS,['2026-07-01',1,'P','R','L',null,1000,999,'FG','EX1']]),'usage');
  const p=await previewImport(new File([XLSX.write(wb,{type:'buffer',bookType:'xlsx'})],'bad.xlsx'),dataset,actor);
  await expect(confirmImport(p.batchId,'replace',actor)).rejects.toThrow();
  expect((await db.materialUsage.findMany({where:{dataset}}))[0].eachKg!.toFixed()).toBe('1000');
 });
 it('filters database records by date and dimension consistently',async()=>{
  const p=await previewImport(file(750,'2026-07-02'),dataset,actor);await confirmImport(p.batchId,'skip',actor);
  const report=await dashboard(parseFilters(new URLSearchParams({dataset,from:'2026-07-02',to:'2026-07-02',lineCode:'L',recipeCode:'R'})));
  expect(report.metrics.totalKg).toBe('750');expect(report.previousMetrics.totalKg).toBe('1000');expect(report.changes.totalTons).toBe('-25.00');
 });
 it('protects later manual edits during rollback',async()=>{
  const p=await previewImport(file(500,'2026-07-03'),dataset,actor);await confirmImport(p.batchId,'skip',actor);
  const r=(await db.materialUsage.findMany({where:{importBatchId:p.batchId}}))[0];
  await modifyRecord(r.id,{usageDate:'2026-07-03',recordNo:'1',productCode:'P',recipeCode:'R',lineCode:'L',sumMassKg:null,eachKg:'501',remark:'FG',kibbleCode:'EX1'},actor);
  await expect(rollbackBatch(p.batchId,actor)).rejects.toThrow('แก้ไข');
  expect((await db.materialUsage.findUniqueOrThrow({where:{id:r.id}})).eachKg!.toFixed()).toBe('501');
 });
 it('imports multiple rows without dates or numbers, edits and rolls back missing values',async()=>{
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([HEADERS,
   ['-','-','OPTIONAL',null,null,'-','-','-',null,null],
   [null,null,'OPTIONAL2',null,null,null,null,0.94,'REMIX',null],
  ]),'usage');
  const upload=new File([XLSX.write(wb,{type:'buffer',bookType:'xlsx'})],'optional.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const p=await previewImport(upload,dataset,actor);expect(p.errors).toEqual([]);
  await confirmImport(p.batchId,'skip',actor);
  const imported=await db.materialUsage.findMany({where:{importBatchId:p.batchId},orderBy:{sourceRow:'asc'}});
  expect(imported).toHaveLength(2);expect(imported[0]).toMatchObject({usageDate:null,recordNo:null,eachKg:null,eachTons:null});
  expect(imported[1].eachTons!.toFixed()).toBe('0.94');
  await rollbackBatch(p.batchId,actor);expect(await db.materialUsage.count({where:{importBatchId:p.batchId}})).toBe(0);
  const edit=await previewImport(file(222,'2026-07-05'),dataset,actor);await confirmImport(edit.batchId,'skip',actor);
  const record=await db.materialUsage.findFirstOrThrow({where:{importBatchId:edit.batchId}});
  await modifyRecord(record.id,{usageDate:'-',recordNo:'-',productCode:'',recipeCode:'-',lineCode:'',sumMassKg:'-',eachKg:'-',remark:'-',kibbleCode:''},actor);
  expect(await db.materialUsage.findUniqueOrThrow({where:{id:record.id}})).toMatchObject({usageDate:null,recordNo:null,eachKg:null,eachTons:null,remark:''});
 });
 it('rejects a viewer for admin operations',()=>{expect(()=>assertRole({role:'VIEWER'},true)).toThrow();expect(()=>assertRole({role:'VIEWER'},false)).not.toThrow();});
 it('only one concurrent confirmation of a preview can succeed',async()=>{
  const p=await previewImport(file(100,'2026-07-04'),dataset,actor);
  const result=await Promise.allSettled([confirmImport(p.batchId,'skip',actor),confirmImport(p.batchId,'skip',actor)]);
  expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(await db.materialUsage.count({where:{dataset,usageDate:new Date('2026-07-04T00:00:00Z')}})).toBe(1);
 });
});
