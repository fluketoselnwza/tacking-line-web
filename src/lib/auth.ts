import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { db } from './db';
import { AppError } from './errors';
export type Actor = { id:string; email:string; name:string; role:'ADMIN'|'VIEWER'; sessionVersion:number };
export function assertRole(actor:Pick<Actor,'role'>, admin=false) {
  if (admin && actor.role !== 'ADMIN') throw new AppError(403,'เฉพาะผู้ดูแลระบบเท่านั้น');
}
function secret() {
  const value=process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new AppError(503,'กรุณาตั้งค่า SESSION_SECRET อย่างน้อย 32 ตัวอักษร');
  return new TextEncoder().encode(value);
}
export async function signSession(actor:Actor) {
  return new SignJWT({version:actor.sessionVersion}).setProtectedHeader({alg:'HS256'}).setSubject(actor.id).setIssuedAt().setExpirationTime('8h').sign(secret());
}
export async function currentUser():Promise<Actor|null> {
  const token=(await cookies()).get('recipe_session')?.value;
  if (!token) return null;
  try {
    const {payload}=await jwtVerify(token,secret(),{algorithms:['HS256']});
    const user=await db.user.findUnique({where:{id:payload.sub},select:{id:true,email:true,name:true,role:true,sessionVersion:true}});
    return user && user.sessionVersion === payload.version ? user : null;
  } catch { return null; }
}
export async function requireUser(admin=false) {
  const user=await currentUser();
  if (!user) throw new AppError(401,'กรุณาเข้าสู่ระบบ');
  assertRole(user,admin); return user;
}
export function checkOrigin(request:Request) {
  const origin=request.headers.get('origin');
  const url=new URL(request.url);
  const expected=process.env.APP_ORIGIN ?? `${url.protocol}//${request.headers.get('host') ?? url.host}`;
  if (!origin || origin !== expected) throw new AppError(403,'คำขอข้ามเว็บไซต์ไม่ได้รับอนุญาต');
}
