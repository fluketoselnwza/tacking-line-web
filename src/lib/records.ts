import { z } from 'zod';
import { db } from './db';
import { whereFilters, utc, type Filters } from './filters';
import { calendarDate, weight } from './excel';
import Decimal from 'decimal.js';
import { AppError } from './errors';
import { writeTransaction } from './imports';
import type { Actor } from './auth';
import { Prisma } from '@prisma/client';
const code=z.string().trim().min(1).max(120);
export const editSchema=z.object({usageDate:z.string().refine(v=>{try{return calendarDate(v)===v;}catch{return false;}},'วันที่ต้องเป็น YYYY-MM-DD ที่ถูกต้อง'),recordNo:code,productCode:code,recipeCode:code,lineCode:code,sumMassKg:z.string().nullable(),eachKg:z.string(),remark:z.enum(['FG','WIP']),kibbleCode:code}).strict();
export async function records(f:Filters){
  const where=whereFilters(f);
  const [items,total]=await db.$transaction([db.materialUsage.findMany({where,skip:(f.page-1)*f.pageSize,take:f.pageSize,orderBy:[{[f.sort]:f.order},{id:'asc'}]}),db.materialUsage.count({where})],{isolationLevel:'RepeatableRead'});
  return {items,total,page:f.page,pageSize:f.pageSize,pages:Math.ceil(total/f.pageSize)};
}
export async function modifyRecord(id:string,input:unknown,actor:Actor,remove=false){
  const parsed=remove?null:editSchema.parse(input);
  let values;
  try { values=parsed?{...parsed,usageDate:utc(parsed.usageDate),sumMassKg:weight(parsed.sumMassKg,true),eachKg:weight(parsed.eachKg)!,eachTons:new Decimal(weight(parsed.eachKg)!).div(1000).toFixed()}:null; } catch { throw new AppError(400,'น้ำหนักต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไปและมีทศนิยมไม่เกิน 15 ตำแหน่ง'); }
  return writeTransaction(async tx=>{
    const before=await tx.materialUsage.findUnique({where:{id}});
    if(!before)throw new AppError(404,'ไม่พบรายการ');
    const after=remove?await tx.materialUsage.delete({where:{id}}):await tx.materialUsage.update({where:{id},data:values!});
    await tx.auditLog.create({data:{userId:actor.id,action:remove?'DELETE':'UPDATE',entityType:'MaterialUsage',entityId:id,beforeData:JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue,...(!remove?{afterData:JSON.parse(JSON.stringify(after)) as Prisma.InputJsonValue}:{})}});
    return after;
  });
}
