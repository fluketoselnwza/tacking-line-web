import { z } from 'zod';
import { db } from './db';
import { whereFilters, utc, type Filters } from './filters';
import { calendarDate, weight, missing, optionalText } from './excel';
import Decimal from 'decimal.js';
import { AppError } from './errors';
import { writeTransaction } from './imports';
import type { Actor } from './auth';
import { Prisma } from '@prisma/client';
const code=z.string().nullable().transform(optionalText).pipe(z.string().max(120));
export const editSchema=z.object({usageDate:z.string().nullable().transform(v=>missing(v)?null:v).refine(v=>{try{return v === null || calendarDate(v)===v;}catch{return false;}},'วันที่ต้องเป็น YYYY-MM-DD ที่ถูกต้อง'),recordNo:code.transform(v=>v || null),productCode:code,recipeCode:code,lineCode:code,sumMassKg:z.string().nullable(),eachKg:z.string().nullable(),remark:z.string().nullable().transform(v=>optionalText(v).toUpperCase()).pipe(z.enum(['','FG','WIP','REMIX'])),kibbleCode:code}).strict();
export async function records(f:Filters){
  const where=whereFilters(f);
  const [items,total]=await db.$transaction([db.materialUsage.findMany({where,skip:(f.page-1)*f.pageSize,take:f.pageSize,orderBy:[{[f.sort]:f.order},{id:'asc'}]}),db.materialUsage.count({where})],{isolationLevel:'RepeatableRead'});
  return {items,total,page:f.page,pageSize:f.pageSize,pages:Math.ceil(total/f.pageSize)};
}
export async function modifyRecord(id:string,input:unknown,actor:Actor,remove=false){
  const parsed=remove?null:editSchema.parse(input);
  let values;
  try { values=parsed?{...parsed,usageDate:parsed.usageDate ? utc(parsed.usageDate) : null,sumMassKg:weight(parsed.sumMassKg,true),eachKg:weight(parsed.eachKg,true),eachTons:weight(parsed.eachKg,true) === null ? null : new Decimal(weight(parsed.eachKg,true)!).div(1000).toFixed()}:null; } catch { throw new AppError(400,'น้ำหนักต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไปและมีทศนิยมไม่เกิน 15 ตำแหน่ง'); }
  return writeTransaction(async tx=>{
    const before=await tx.materialUsage.findUnique({where:{id}});
    if(!before)throw new AppError(404,'ไม่พบรายการ');
    // Keep source-only tons when editing a record that still has no KG.
    if(values && values.eachKg === null && before.eachKg === null) values.eachTons = before.eachTons?.toFixed() ?? null;
    const after=remove?await tx.materialUsage.delete({where:{id}}):await tx.materialUsage.update({where:{id},data:values!});
    await tx.auditLog.create({data:{userId:actor.id,action:remove?'DELETE':'UPDATE',entityType:'MaterialUsage',entityId:id,beforeData:JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue,...(!remove?{afterData:JSON.parse(JSON.stringify(after)) as Prisma.InputJsonValue}:{})}});
    return after;
  });
}
