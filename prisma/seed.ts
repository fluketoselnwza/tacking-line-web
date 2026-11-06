import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
const db=new PrismaClient();
async function main(){
 for(const role of ['ADMIN','VIEWER'] as const){
  const email=process.env[`${role}_EMAIL`]?.toLowerCase(),password=process.env[`${role}_PASSWORD`];
  if(!email||!password||password.length<12)throw new Error(`Set ${role}_EMAIL and ${role}_PASSWORD (12+ chars)`);
  await db.user.upsert({where:{email},update:{},create:{email,passwordHash:await hash(password,12),name:role==='ADMIN'?'Administrator':'Viewer',role}});
 }
 console.log('Users created; no sample usage data inserted. Existing accounts were preserved.');
}
main().finally(()=>db.$disconnect()).catch(()=>{console.error('Seed failed: check database and seed environment variables.');process.exit(1);});
