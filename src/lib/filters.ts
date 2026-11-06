import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { calendarDate } from './excel';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{try{return calendarDate(v)===v;}catch{return false;}},'Invalid calendar date');
export const filterSchema=z.object({
  from:date.optional(),to:date.optional(),month:z.coerce.number().int().min(1).max(12).optional(),year:z.coerce.number().int().min(1900).max(2200).optional(),
  dataset:z.string().min(1).max(80).default('BIN'),productCode:z.string().max(120).optional(),recipeCode:z.string().max(120).optional(),lineCode:z.string().max(120).optional(),remark:z.enum(['FG','WIP','REMIX']).optional(),kibbleCode:z.string().max(120).optional(),search:z.string().max(120).optional(),
  page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(20),sort:z.enum(['usageDate','recordNo','productCode','recipeCode','lineCode','eachKg','eachTons','sumMassKg','remark','kibbleCode']).default('usageDate'),order:z.enum(['asc','desc']).default('desc'),grain:z.enum(['daily','weekly','monthly']).default('daily'),
}).superRefine((v,ctx)=>{if(v.from && v.to && v.from>v.to)ctx.addIssue({code:'custom',message:'วันเริ่มต้องไม่เกินวันสิ้นสุด',path:['to']});if(v.month && !v.year)ctx.addIssue({code:'custom',message:'ต้องระบุปีเมื่อเลือกเดือน',path:['year']});});
export type Filters=z.infer<typeof filterSchema>;
export function parseFilters(params:URLSearchParams):Filters {return filterSchema.parse(Object.fromEntries([...params].filter(([,v])=>v!=='')));}
export const iso=(d:Date)=>d.toISOString().slice(0,10);
export const utc=(d:string)=>new Date(`${d}T00:00:00.000Z`);
export function whereFilters(f:Filters, dates=true):Prisma.MaterialUsageWhereInput {
  const and:Prisma.MaterialUsageWhereInput[]=[{dataset:f.dataset}];
  for (const key of ['productCode','recipeCode','lineCode','remark','kibbleCode'] as const) if(f[key]) and.push({[key]:f[key]});
  if(f.search)and.push({OR:['productCode','recipeCode','lineCode','recordNo','kibbleCode'].map(key=>({[key]:{contains:f.search,mode:'insensitive'}}))});
  if(dates) {
    if(f.from || f.to)and.push({usageDate:{...(f.from?{gte:utc(f.from)}:{}),...(f.to?{lte:utc(f.to)}:{})}});
    if(f.year)and.push({usageDate:{gte:new Date(Date.UTC(f.year,(f.month??1)-1,1)),lt:new Date(Date.UTC(f.year,f.month??12,1))}});
  }
  return {AND:and};
}
export function previousPeriod(from:Date,to:Date){const days=Math.floor((to.getTime()-from.getTime())/86400000)+1;return {from:new Date(from.getTime()-days*86400000),to:new Date(from.getTime()-86400000),days};}
export function bucketDate(date:Date,grain:string){const d=new Date(date);if(grain==='monthly')d.setUTCDate(1);if(grain==='weekly')d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return iso(d);}
