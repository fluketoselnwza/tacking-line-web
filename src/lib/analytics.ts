import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { type Filters, whereFilters, previousPeriod, iso, bucketDate, utc } from './filters';
export type AggregateRow={usageDate:Date|null;eachKg:Prisma.Decimal|string|null;eachTons:Prisma.Decimal|string|null;sumMassKg:Prisma.Decimal|string|null;lineCode:string;recipeCode:string;remark:string;kibbleCode:string};
const sum=(rows:AggregateRow[],key:'eachKg'|'eachTons'|'sumMassKg')=>rows.reduce((a,r)=>r[key]===null?a:a.plus(String(r[key])),new Decimal(0)).toFixed();
export function metrics(rows:AggregateRow[]){return {totalTons:sum(rows,'eachTons'),totalKg:sum(rows,'eachKg'),totalSumMassKg:sum(rows,'sumMassKg'),sumMassRecords:rows.filter(r=>r.sumMassKg!==null).length,totalRecords:rows.length,activeLines:new Set(rows.map(r=>r.lineCode).filter(Boolean)).size,activeRecipes:new Set(rows.map(r=>r.recipeCode).filter(Boolean)).size};}
export function change(current:string|number,previous:string|number):string|null {return new Decimal(previous).eq(0)?null:new Decimal(current).minus(previous).div(previous).times(100).toFixed(2);}
export function groups(rows:AggregateRow[],key:'lineCode'|'recipeCode'|'remark'|'kibbleCode'){
  const map=new Map<string,AggregateRow[]>();for(const row of rows){const name=row[key] || "ไม่ระบุ";map.set(name,[...(map.get(name)??[]),row]);}
  const total=new Decimal(sum(rows,'eachTons'));
  return [...map].map(([name,items])=>({name,tons:sum(items,'eachTons'),kg:sum(items,'eachKg'),records:items.length,percentage:total.eq(0)?'0':new Decimal(sum(items,'eachTons')).div(total).times(100).toFixed(2)})).sort((a,b)=>new Decimal(b.tons).cmp(a.tons));
}
export function series(rows:AggregateRow[],grain:string){
  const map=new Map<string,Record<string,string>>();
  for(const row of rows){if (!row.usageDate || row.eachTons === null) continue; const date=bucketDate(row.usageDate,grain);const item=map.get(date)??{date,total:'0'};item[row.lineCode || "ไม่ระบุ"]=new Decimal(item[row.lineCode || "ไม่ระบุ"]??0).plus(String(row.eachTons)).toFixed();item.total=new Decimal(item.total).plus(String(row.eachTons)).toFixed();map.set(date,item);}
  return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export async function dashboard(f:Filters){
  return db.$transaction(async tx=>{
    const where=whereFilters(f);
    const extent=await tx.materialUsage.aggregate({where,_min:{usageDate:true},_max:{usageDate:true}});
    let from=f.from?utc(f.from):extent._min.usageDate;
    let to=f.to?utc(f.to):extent._max.usageDate;
    if(f.year){const monthFrom=new Date(Date.UTC(f.year,(f.month??1)-1,1));const monthTo=new Date(Date.UTC(f.year,f.month??12,0));from=from&&from>monthFrom?from:monthFrom;to=to&&to<monthTo?to:monthTo;}
    const current=await tx.materialUsage.findMany({where,select:{usageDate:true,eachKg:true,eachTons:true,sumMassKg:true,lineCode:true,recipeCode:true,remark:true,kibbleCode:true}});
    const period=from&&to&&from<=to?previousPeriod(from,to):null;
    const previous=period?await tx.materialUsage.findMany({where:{AND:[whereFilters(f,false),{usageDate:{gte:period.from,lte:period.to}}]},select:{usageDate:true,eachKg:true,eachTons:true,sumMassKg:true,lineCode:true,recipeCode:true,remark:true,kibbleCode:true}}):[];
    const currentMetrics=metrics(current),previousMetrics=metrics(previous);
    const lineDistribution=groups(current,'lineCode'),prevLines=groups(previous,'lineCode');
    const lineSummary=[...new Set([...lineDistribution.map(l=>l.name),...prevLines.map(l=>l.name)])].map(name=>{
      const now=lineDistribution.find(l=>l.name===name),old=prevLines.find(l=>l.name===name);return {name,previous:old?.tons??'0',current:now?.tons??'0',total:new Decimal(now?.tons??0).plus(old?.tons??0).toFixed(),change:change(now?.tons??0,old?.tons??0),percentage:now?.percentage??'0'};
    });
    const changes=Object.fromEntries(Object.keys(currentMetrics).map(k=>[k,change(currentMetrics[k as keyof typeof currentMetrics],previousMetrics[k as keyof typeof previousMetrics])]));
    const recipeGroups=groups(current,'recipeCode');
    return {metrics:currentMetrics,previousMetrics,changes,period:from&&to?{from:iso(from),to:iso(to),previousFrom:period?iso(period.from):null,previousTo:period?iso(period.to):null}:null,dailyUsage:series(current,f.grain),lineDistribution,lineSummary,topRecipes:recipeGroups.slice(0,10),recipes:recipeGroups,fgWip:groups(current,'remark'),kibble:groups(current,'kibbleCode'),lines:lineDistribution.map(l=>({...l,topRecipes:groups(current.filter(r=>r.lineCode===l.name),'recipeCode').slice(0,10),fgWip:groups(current.filter(r=>r.lineCode===l.name),'remark')})),recipeByLine:recipeGroups.map(r=>({...r,lines:groups(current.filter(v=>v.recipeCode===r.name),'lineCode'),daily:series(current.filter(v=>v.recipeCode===r.name),'daily')})),monthlyUsage:series(current,'monthly'),grandTotal:{previous:previousMetrics.totalTons,current:currentMetrics.totalTons,total:new Decimal(currentMetrics.totalTons).plus(previousMetrics.totalTons).toFixed(),change:change(currentMetrics.totalTons,previousMetrics.totalTons),percentage:current.length?'100':'0'}};
  },{isolationLevel:'RepeatableRead',timeout:60000});
}
export async function options(dataset:string){
  const base={where:{dataset}};
  const fields=['productCode','recipeCode','lineCode','remark','kibbleCode'] as const;
  const result=await Promise.all(fields.map(field=>db.materialUsage.findMany({...base,distinct:[field],select:{[field]:true},orderBy:{[field]:'asc'}})));
  const dates=await db.materialUsage.aggregate({...base,_min:{usageDate:true},_max:{usageDate:true}});
  return {...Object.fromEntries(fields.map((field,i)=>[field,result[i].map(r=>(r as unknown as Record<string,string>)[field]).filter(Boolean)])),dateFrom:dates._min.usageDate?iso(dates._min.usageDate):null,dateTo:dates._max.usageDate?iso(dates._max.usageDate):null};
}
