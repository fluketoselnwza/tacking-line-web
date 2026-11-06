import { config } from '../src/lib/config';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import { HEADERS } from '../src/lib/excel';
const base=config.smokeBaseUrl;
const dataset=`HTTP_TEST_${Date.now()}`;
const db=new PrismaClient({datasourceUrl: config.databaseUrl});
let userId:string;
const batches:string[]=[],recordIds:string[]=[];
async function main(){
 const login=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:config.adminEmail,password:config.adminPassword})});
 assert.equal(login.status,200);userId=(await login.json()).user.id;
 const cookie=login.headers.get('set-cookie')!.split(';')[0];
 const jsonHeaders={Origin:base,Cookie:cookie,'Content-Type':'application/json'};
 const request=async(path:string,method='GET',body?:unknown)=>{
  const r=await fetch(`${base}/api/${path}`,{method,headers:jsonHeaders,...(body?{body:JSON.stringify(body)}:{})});
  const d=await r.json();return {r,d};
 };
 async function preview(kg=1250,tons=1.25){
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([HEADERS,['2026-07-01',1,'P1','R1','NEW-LINE',null,kg,tons,'FG','EX99']]),'ยอดใช้ JUL');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Grand total',999999]]),'PIVOT JUL');
  const form=new FormData();form.append('dataset',dataset);form.append('file',new File([XLSX.write(wb,{type:'buffer',bookType:'xlsx'})],'workflow.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const r=await fetch(`${base}/api/import/preview`,{method:'POST',headers:{Origin:base,Cookie:cookie},body:form});
  const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));batches.push(d.batchId);return d;
 }
 const p=await preview();assert.equal(p.totalRows,1);assert.equal(p.validRows,1);assert.deepEqual(p.ignoredSheets,['PIVOT JUL']);
 assert.equal((await request('import/confirm','POST',{batchId:p.batchId,mode:'skip'})).r.status,200);
 const summary=await request(`dashboard/summary?dataset=${dataset}&from=2026-07-01&to=2026-07-01`);
 assert.equal(summary.d.metrics.totalTons,'1.25');assert.equal(summary.d.metrics.totalKg,'1250');assert.equal(summary.d.metrics.totalSumMassKg,'0');assert.equal(summary.d.lineDistribution[0].name,'NEW-LINE');
 let listing=await request(`records?dataset=${dataset}`);assert.equal(listing.d.total,1);recordIds.push(listing.d.items[0].id);
 const duplicate=await preview();assert.equal(duplicate.fileMatches.length,1);
 const skipped=await request('import/confirm','POST',{batchId:duplicate.batchId,mode:'skip'});assert.equal(skipped.d.skippedRows,1);assert.equal(skipped.d.successRows,0);
 const replacement=await preview(2000,2);assert.equal((await request('import/confirm','POST',{batchId:replacement.batchId,mode:'replace'})).r.status,200);
 assert.equal((await request(`dashboard/summary?dataset=${dataset}`)).d.metrics.totalTons,'2');
 assert.equal((await request(`import/history/${replacement.batchId}/rollback`,'POST')).r.status,200);
 assert.equal((await request(`dashboard/summary?dataset=${dataset}`)).d.metrics.totalTons,'1.25');
 const bad=await preview(1000,999);assert.equal(bad.errors.length,1);assert.equal((await request('import/confirm','POST',{batchId:bad.batchId,mode:'replace'})).r.status,422);
 const errorCSV=await fetch(`${base}/api/import/history/${bad.batchId}/errors`,{headers:{Cookie:cookie}});assert.equal(errorCSV.status,200);assert.match(await errorCSV.text(),/EACH\(Tons\)/);
 const edited={usageDate:'2026-07-01',recordNo:'1',productCode:'P1',recipeCode:'R1',lineCode:'NEW-LINE',sumMassKg:null,eachKg:'1260.123456789',remark:'FG',kibbleCode:'EX99'};
 assert.equal((await request(`records/${recordIds[0]}`,'PATCH',{...edited,eachKg:'bad'})).r.status,400);
 const edit=await request(`records/${recordIds[0]}`,'PATCH',edited);assert.equal(edit.r.status,200);assert.equal(edit.d.eachTons,'1.260123456789');assert.equal(edit.d.sumMassKg,null);
 assert.equal((await request(`import/history/${p.batchId}/rollback`,'POST')).r.status,409);
 assert.equal((await request(`records/${recordIds[0]}`,'DELETE')).r.status,200);
 assert.equal((await request(`records?dataset=${dataset}`)).d.total,0);
 const audits=await request(`audit?entityId=${recordIds[0]}`);assert.ok(audits.d.some((a:{action:string})=>a.action==='UPDATE'));assert.ok(audits.d.some((a:{action:string})=>a.action==='DELETE'));
 console.log('PASS live HTTP workflow: XLSX multi-sheet preview, import, exact totals, file hash duplicate, replace, rollback, errors CSV, edit validation, delete and audit');
}
main().finally(async()=>{
 // Only remove this script's uniquely named dataset and exact audit entity IDs.
 await db.materialUsage.deleteMany({where:{dataset}});
 if(batches.length)await db.auditLog.deleteMany({where:{userId,entityId:{in:[...batches,...recordIds]}}});
 await db.importBatch.deleteMany({where:{dataset}});
 await db.$disconnect();
}).catch(e=>{console.error(e);process.exitCode=1;});
