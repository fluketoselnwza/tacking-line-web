import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { AppError } from './errors';
import { parseWorkbook, MAX_FILE_SIZE, type UsageRow } from './excel';
import { iso, utc } from './filters';
import type { Actor } from './auth';
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
// A transaction-scoped global import lock serializes imports, edits and rollback.
// This prevents overlapping previews from bypassing duplicate handling.
export async function writeTransaction<T>(fn:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
  return db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(71392841)`;
    return fn(tx);
  },{timeout:60000,maxWait:10000});
}
export function recordData(row:UsageRow,batchId:string,dataset:string){return {...row,usageDate:utc(row.usageDate),importBatchId:batchId,dataset};}
export async function previewImport(file:File,dataset:string,actor:Actor){
  if (!/\.(xlsx|xls)$/i.test(file.name) || file.size>MAX_FILE_SIZE || file.size===0) throw new AppError(400,'ต้องเป็นไฟล์ .xlsx หรือ .xls ขนาดไม่เกิน 10 MB');
  const allowed=['','application/octet-stream','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
  if (!allowed.includes(file.type))throw new AppError(400,'ชนิดไฟล์ไม่ถูกต้อง');
  const buffer=Buffer.from(await file.arrayBuffer());
  const signature=buffer.subarray(0,8).toString('hex');
  if (!(signature.startsWith('504b0304')||signature==='d0cf11e0a1b11ae1'))throw new AppError(400,'เนื้อหาไฟล์ไม่ใช่ Excel');
  const parsed=parseWorkbook(buffer),fileHash=createHash('sha256').update(buffer).digest('hex');
  const dates=[...new Set(parsed.rows.map(r=>r.usageDate))].sort();
  const [existing,fileMatches]=await Promise.all([
    dates.length ? db.materialUsage.findMany({where:{dataset,usageDate:{in:dates.map(utc)}},select:{usageDate:true,recordNo:true,sourceSheet:true,sourceRow:true}}):[],
    db.importBatch.findMany({where:{dataset,fileHash,status:'IMPORTED'},select:{id:true,fileName:true,uploadedAt:true}}),
  ]);
  const payload={...parsed,conflicts:existing.map(r=>({...r,usageDate:iso(r.usageDate)})),fileMatches};
  const batch=await db.importBatch.create({data:{dataset,fileName:file.name,fileHash,uploadedBy:actor.id,totalRows:parsed.totalRows,errorRows:parsed.errorRows,dateFrom:dates[0]?utc(dates[0]):null,dateTo:dates.length?utc(dates.at(-1)!):null,expiresAt:new Date(Date.now()+3600000),previewData:json(payload),errors:{create:parsed.errors}}});
  return {batchId:batch.id,expiresAt:batch.expiresAt,...payload};
}
export async function confirmImport(batchId:string,mode:'skip'|'replace'|'cancel',actor:Actor){
  return writeTransaction(async tx=>{
    const batch=await tx.importBatch.findUnique({where:{id:batchId}});
    if(!batch)throw new AppError(404,'ไม่พบ Batch');
    if(batch.uploadedBy!==actor.id)throw new AppError(403,'ผู้ยืนยันต้องเป็นผู้อัปโหลด');
    if(batch.status!=='PREVIEW')throw new AppError(409,'Batch นี้ดำเนินการแล้ว');
    if(mode==='cancel')return tx.importBatch.update({where:{id:batchId},data:{status:'CANCELLED',previewData:{}}});
    if(batch.expiresAt<new Date())throw new AppError(410,'Preview หมดอายุ กรุณาอัปโหลดใหม่');
    const preview=batch.previewData as unknown as ReturnType<typeof parseWorkbook>;
    // All-or-nothing import: no silent omission of invalid rows.
    if(preview.errors.length || preview.ambiguous || !preview.rows.length)throw new AppError(422,'ต้องแก้ไขข้อผิดพลาดทั้งหมดก่อนนำเข้า');
    const dates=[...new Set(preview.rows.map(r=>r.usageDate))].map(utc);
    const existing=await tx.materialUsage.findMany({where:{dataset:batch.dataset,usageDate:{in:dates}}});
    const existingDates=new Set(existing.map(r=>iso(r.usageDate)));
    const matches=await tx.importBatch.count({where:{dataset:batch.dataset,fileHash:batch.fileHash,status:'IMPORTED'}});
    if(matches && mode==='skip') {
      return tx.importBatch.update({where:{id:batchId},data:{status:'IMPORTED',successRows:0,skippedRows:preview.rows.length,committedAt:new Date(),previewData:{}}});
    }
    const incoming=mode==='skip'?preview.rows.filter(r=>!existingDates.has(r.usageDate)):preview.rows;
    // Replace scope is whole calendar dates present in preview, within selected dataset.
    if(mode==='replace'&&existing.length)await tx.materialUsage.deleteMany({where:{id:{in:existing.map(r=>r.id)}}});
    if(incoming.length)await tx.materialUsage.createMany({data:incoming.map(r=>recordData(r,batchId,batch.dataset))});
    await tx.auditLog.create({data:{userId:actor.id,action:mode==='replace'?'IMPORT_REPLACE':'IMPORT',entityType:'ImportBatch',entityId:batchId,beforeData:json(mode==='replace'?existing:[]),afterData:json({count:incoming.length,dates:dates.map(iso),dataset:batch.dataset})}});
    return tx.importBatch.update({where:{id:batchId},data:{status:'IMPORTED',successRows:incoming.length,skippedRows:preview.rows.length-incoming.length,replacedData:json(mode==='replace'?existing:[]),committedAt:new Date(),previewData:{}}});
  });
}
export async function rollbackBatch(batchId:string,actor:Actor){
  return writeTransaction(async tx=>{
    const batch=await tx.importBatch.findUnique({where:{id:batchId}});
    if(!batch||batch.status!=='IMPORTED')throw new AppError(409,'Batch นี้ไม่สามารถย้อนกลับได้');
    const imported=await tx.materialUsage.findMany({where:{importBatchId:batchId}});
    // Edits/deletions/newer replacements must never be lost during rollback.
    const edits=await tx.auditLog.count({where:{entityType:'MaterialUsage',entityId:{in:imported.map(r=>r.id)},action:{in:['UPDATE','DELETE']}}});
    const deleted=await tx.auditLog.count({where:{entityType:'MaterialUsage',action:'DELETE',beforeData:{path:['importBatchId'],equals:batchId}}});
    if(edits||deleted||imported.length!==batch.successRows)throw new AppError(409,'มีการแก้ไข ลบ หรือแทนที่ข้อมูลหลัง Import ต้องตรวจสอบความสัมพันธ์ก่อนย้อนกลับ');
    const replaced=(batch.replacedData??[]) as unknown as Record<string,unknown>[];
    const affectedDates=[...new Set([...imported.map(r=>iso(r.usageDate)),...replaced.map(r=>String(r.usageDate).slice(0,10))])];
    if(affectedDates.length){
      const newer=await tx.importBatch.count({where:{dataset:batch.dataset,status:'IMPORTED',committedAt:{gt:batch.committedAt!},records:{some:{usageDate:{in:affectedDates.map(utc)}}}}});
      if(newer)throw new AppError(409,'มี Batch ใหม่ในช่วงวันที่เดียวกัน กรุณาย้อนกลับ Batch ล่าสุดก่อน');
    }
    await tx.materialUsage.deleteMany({where:{importBatchId:batchId}});
    for(const original of replaced){
      const data={...original,usageDate:new Date(String(original.usageDate)),createdAt:new Date(String(original.createdAt)),updatedAt:new Date(String(original.updatedAt))};
      await tx.materialUsage.create({data:data as Prisma.MaterialUsageUncheckedCreateInput});
    }
    await tx.auditLog.create({data:{userId:actor.id,action:'ROLLBACK',entityType:'ImportBatch',entityId:batchId,beforeData:json(imported),afterData:json({restored:replaced.length})}});
    return tx.importBatch.update({where:{id:batchId},data:{status:'ROLLED_BACK'}});
  });
}
