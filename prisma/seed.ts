import { config } from '../src/lib/config';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
const db=new PrismaClient({datasourceUrl: config.databaseUrl});
async function main(){
 for(const role of ['ADMIN','VIEWER'] as const){
  const email=(role==='ADMIN'?config.adminEmail:config.viewerEmail),password=role==='ADMIN'?config.adminPassword:config.viewerPassword;
  if(!email||!password||password.length<12)throw new Error(`Set ${role}_EMAIL and ${role}_PASSWORD (12+ chars)`);
  await db.user.upsert({where:{email},update:{},create:{email,passwordHash:await hash(password,12),name:role==='ADMIN'?'Administrator':'Viewer',role}});
 }
 console.log('Users created; no sample usage data inserted. Existing accounts were preserved.');
}
main().finally(()=>db.$disconnect()).catch(()=>{console.error('Seed failed: check database and seed environment variables.');process.exit(1);});
