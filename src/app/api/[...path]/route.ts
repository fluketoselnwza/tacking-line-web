import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { compare } from 'bcryptjs';
import { z, ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { requireUser, signSession, checkOrigin } from '@/lib/auth';
import { previewImport, confirmImport, rollbackBatch } from '@/lib/imports';
import { dashboard, options } from '@/lib/analytics';
import { parseFilters, whereFilters, iso } from '@/lib/filters';
import { records, modifyRecord } from '@/lib/records';
import { toExcel, toCSV, MAX_FILE_SIZE, HEADERS } from '@/lib/excel';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const attempts=new Map<string,{count:number;until:number}>();
function download(rows:Record<string,unknown>[],format:string,name:string){
  if(format==='csv')return new Response(toCSV(rows),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${name}.csv"`,'Cache-Control':'no-store'}});
  const buffer=toExcel(rows);
  return new Response(new Uint8Array(buffer),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${name}.xlsx"`,'Cache-Control':'no-store'}});
}
async function handler(req:NextRequest){
 try {
  const path=new URL(req.url).pathname.replace(/^\/api\//,'');
  const method=req.method;
  if(method!=='GET'){
    checkOrigin(req);
    if(Number(req.headers.get('content-length')??0)>MAX_FILE_SIZE+1024*1024)throw new AppError(413,'ไฟล์ใหญ่เกินกำหนด');
  }
  if(path==='auth/login'&&method==='POST'){
    const {email,password}=z.object({email:z.string().email().max(254),password:z.string().min(1).max(256)}).parse(await req.json());
    // Account-based throttling is independent of spoofable proxy IP headers.
    const key=email.toLowerCase(),now=Date.now(),a=attempts.get(key);
    if(a && a.until>now && a.count>=8)throw new AppError(429,'ลองเข้าสู่ระบบมากเกินไป กรุณารอ 15 นาที');
    if(attempts.size>10000)for(const [k,v]of attempts)if(v.until<now)attempts.delete(k);
    attempts.set(key,{count:a&&a.until>now?a.count+1:1,until:a&&a.until>now?a.until:now+900000});
    const user=await db.user.findUnique({where:{email:key}});
    const valid=await compare(password,user?.passwordHash??'$2b$12$KIX7OeU0o4hAkGQHJTr0XOJ0rMQUFcdq.rCkzFegEK9yZsVn14nQK');
    if(!user||!valid)throw new AppError(401,'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    attempts.delete(key);
    const token=await signSession(user);
    (await cookies()).set('recipe_session',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:28800});
    return NextResponse.json({user:{id:user.id,name:user.name,role:user.role,email:user.email}});
  }
  const admin=method!=='GET';
  const actor=await requireUser(path==='auth/logout'?false:admin);
  if(path==='auth/me'&&method==='GET')return NextResponse.json(actor);
  if(path==='auth/logout'&&method==='POST'){
    await db.user.update({where:{id:actor.id},data:{sessionVersion:{increment:1}}});
    (await cookies()).delete('recipe_session');return NextResponse.json({ok:true});
  }
  if(path==='import/preview'&&method==='POST'){
    const length=Number(req.headers.get('content-length'));
    if(!length||length>MAX_FILE_SIZE+1024*1024)throw new AppError(413,'ต้องระบุขนาดไฟล์และไม่เกิน 10 MB');
    const form=await req.formData(),file=form.get('file');
    if(!(file instanceof File))throw new AppError(400,'กรุณาเลือกไฟล์');
    const dataset=z.string().trim().min(1).max(80).regex(/^[\p{L}\p{N}_ -]+$/u).parse(form.get('dataset')??'BIN');
    return NextResponse.json(await previewImport(file,dataset,actor));
  }
  if(path==='import/confirm'&&method==='POST'){
    const {batchId,mode}=z.object({batchId:z.string().cuid(),mode:z.enum(['skip','replace','cancel'])}).strict().parse(await req.json());
    return NextResponse.json(await confirmImport(batchId,mode,actor));
  }
  if(path==='import/history'&&method==='GET'){
    const page=z.coerce.number().int().min(1).parse(req.nextUrl.searchParams.get('page')??1);
    const [items,total]=await db.$transaction([db.importBatch.findMany({skip:(page-1)*20,take:20,orderBy:{uploadedAt:'desc'},select:{id:true,dataset:true,fileName:true,fileHash:true,totalRows:true,successRows:true,skippedRows:true,errorRows:true,status:true,dateFrom:true,dateTo:true,uploadedAt:true,user:{select:{name:true,email:true}}}}),db.importBatch.count()]);
    return NextResponse.json({items,total,page,pages:Math.ceil(total/20)});
  }
  const batchMatch=path.match(/^import\/history\/([^/]+)(?:\/(errors|rollback))?$/);
  if(batchMatch){
    const id=z.string().cuid().parse(batchMatch[1]);
    if(batchMatch[2]==='rollback'&&method==='POST')return NextResponse.json(await rollbackBatch(id,actor));
    if(method==='GET'){
      const batch=await db.importBatch.findUnique({where:{id},include:{errors:true,user:{select:{name:true,email:true}},_count:{select:{records:true}}}});
      if(!batch)throw new AppError(404,'ไม่พบ Batch');
      if(batchMatch[2]==='errors')return download(batch.errors.map(e=>({Sheet:e.sheetName,Row:e.rowNumber,Field:e.fieldName,Error:e.errorMessage})),'csv','import-errors');
      return NextResponse.json(batch);
    }
  }
  if(path==='audit'&&method==='GET'){
    if(actor.role!=='ADMIN')throw new AppError(403,'เฉพาะผู้ดูแลระบบ');
    const id=req.nextUrl.searchParams.get('entityId');
    return NextResponse.json(await db.auditLog.findMany({where:id?{entityId:id}:{},take:100,orderBy:{createdAt:'desc'},include:{user:{select:{name:true}}}}));
  }
  const f=parseFilters(req.nextUrl.searchParams);
  if(path==='filters'&&method==='GET')return NextResponse.json(await options(f.dataset));
  if((path.startsWith('dashboard/')||path==='recipes'||path==='lines')&&method==='GET'){
    const data=await dashboard(f);
    const map:Record<string,unknown>={'dashboard/summary':data,'dashboard/daily-usage':data.dailyUsage,'dashboard/line-distribution':data.lineDistribution,'dashboard/top-recipes':data.topRecipes,'dashboard/fg-wip':data.fgWip,'dashboard/kibble':data.kibble,recipes:data,lines:data};
    if(!(path in map))throw new AppError(404,'ไม่พบ API');
    return NextResponse.json(map[path]);
  }
  if(path==='records'&&method==='GET')return NextResponse.json(await records(f));
  const recordMatch=path.match(/^records\/([^/]+)$/);
  if(recordMatch){
    const id=z.string().cuid().parse(recordMatch[1]);
    if(method==='PATCH'||method==='DELETE')return NextResponse.json(await modifyRecord(id,method==='PATCH'?await req.json():null,actor,method==='DELETE'));
    if(method==='GET'){
      const row=await db.materialUsage.findUnique({where:{id}});if(!row)throw new AppError(404,'ไม่พบรายการ');return NextResponse.json(row);
    }
  }
  if(path==='export'&&method==='GET'){
    const format=z.enum(['xlsx','csv']).parse(req.nextUrl.searchParams.get('format')??'xlsx');
    const type=z.enum(['records','summary','recipes','lines']).parse(req.nextUrl.searchParams.get('type')??'records');
    if(type!=='records'){
      const data=await dashboard(f);
      const rows=type==='summary'?data.lineSummary:type==='recipes'?data.recipes:data.lineDistribution;
      return download(rows,format,type);
    }
    const count=await db.materialUsage.count({where:whereFilters(f)});
    if(count>50000)throw new AppError(413,'Export ได้ครั้งละ 50,000 รายการ กรุณาลดช่วงวันที่');
    const data=await db.materialUsage.findMany({where:whereFilters(f),orderBy:[{[f.sort]:f.order},{id:'asc'}],take:50000});
    const rows=data.map(r=>Object.fromEntries(HEADERS.map((h,i)=>[h,[iso(r.usageDate),r.recordNo,r.productCode,r.recipeCode,r.lineCode,r.sumMassKg?.toFixed()??null,r.eachKg.toFixed(),r.eachTons.toFixed(),r.remark,r.kibbleCode][i]])));
    return download(rows,format,'material-usage');
  }
  throw new AppError(404,'ไม่พบ API');
 }catch(error){
  if(error instanceof AppError)return NextResponse.json({error:error.message},{status:error.status});
  if(error instanceof ZodError)return NextResponse.json({error:'ข้อมูลคำขอไม่ถูกต้อง',details:error.issues.map(i=>({field:i.path.join('.'),message:i.message}))},{status:400});
  if(error instanceof Prisma.PrismaClientKnownRequestError){
    if(error.code==='P2002')return NextResponse.json({error:'วันที่ + No. ซ้ำกับข้อมูลเดิม กรุณาตรวจสอบ'},{status:409});
    if(['P2034','P2028'].includes(error.code))return NextResponse.json({error:'ข้อมูลถูกใช้งานพร้อมกัน กรุณาลองใหม่'},{status:409});
  }
  console.error('API failure',error instanceof Error?error.name:'Unknown');
  return NextResponse.json({error:'ระบบไม่สามารถดำเนินการได้ กรุณาตรวจสอบการเชื่อมต่อฐานข้อมูลหรือติดต่อผู้ดูแล'},{status:500});
 }
}
export const GET=handler;export const POST=handler;export const PATCH=handler;export const DELETE=handler;
