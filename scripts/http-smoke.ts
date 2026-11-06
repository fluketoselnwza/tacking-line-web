import { config } from '../src/lib/config';
import assert from 'node:assert/strict';
const base=config.smokeBaseUrl;
async function login(email:string,password:string){const r=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(r.status,200,await r.clone().text());const cookie=r.headers.get('set-cookie')!.split(';')[0];return cookie;}
async function main(){
 assert.equal((await fetch(`${base}/api/records`)).status,401);
 const viewer=await login(config.viewerEmail!,config.viewerPassword!);
 const admin=await login(config.adminEmail!,config.adminPassword!);
 const routes=['dashboard/summary','dashboard/daily-usage','dashboard/line-distribution','dashboard/top-recipes','dashboard/fg-wip','dashboard/kibble','records','recipes','lines','import/history','filters','auth/me'];
 for(const route of routes){const r=await fetch(`${base}/api/${route}`,{headers:{Cookie:viewer}});assert.equal(r.status,200,`${route}: ${await r.clone().text()}`);console.log('PASS GET',route);}
 const denied=await fetch(`${base}/api/import/confirm`,{method:'POST',headers:{Origin:base,Cookie:viewer,'Content-Type':'application/json'},body:JSON.stringify({batchId:'unused',mode:'replace'})});assert.equal(denied.status,403);
 assert.equal((await fetch(`${base}/api/audit`,{headers:{Cookie:viewer}})).status,403);
 assert.equal((await fetch(`${base}/api/audit`,{headers:{Cookie:admin}})).status,200);
 assert.equal((await fetch(`${base}/api/records?pageSize=99999`,{headers:{Cookie:viewer}})).status,400);
 assert.equal((await fetch(`${base}/api/import/confirm`,{method:'POST',headers:{Origin:'https://wrong.example',Cookie:admin,'Content-Type':'application/json'},body:'{}'})).status,403);
 for(const format of ['csv','xlsx']){const r=await fetch(`${base}/api/export?format=${format}`,{headers:{Cookie:viewer}});assert.equal(r.status,200);assert.match(r.headers.get('content-disposition')??'',/attachment/);}
 for(const page of ['dashboard','records','recipes','lines','upload','upload/history']){const r=await fetch(`${base}/${page}`,{headers:{Cookie:admin}});assert.equal(r.status,200,page);}
 console.log('PASS authorization, CSRF, validation, CSV/XLSX exports and all six pages');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
