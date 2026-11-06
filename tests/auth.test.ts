import { describe,it,expect,afterEach,vi } from 'vitest';
import { assertRole,checkOrigin,signSession,type Actor } from '../src/lib/auth';
import { jwtVerify } from 'jose';
describe('authorization and session',()=>{
 afterEach(()=>vi.unstubAllEnvs());
 it('only permits Admin writes while allowing Viewer reads',()=>{expect(()=>assertRole({role:'VIEWER'},true)).toThrow('เฉพาะ');expect(()=>assertRole({role:'ADMIN'},true)).not.toThrow();expect(()=>assertRole({role:'VIEWER'})).not.toThrow();});
 it('rejects missing or mismatched Origin on mutations',()=>{expect(()=>checkOrigin(new Request('http://localhost:3000/api/import/confirm'))).toThrow();expect(()=>checkOrigin(new Request('http://localhost:3000/api/import/confirm',{headers:{Origin:'https://evil.test'}}))).toThrow();expect(()=>checkOrigin(new Request('http://localhost:3000/api/import/confirm',{headers:{Origin:'http://localhost:3000'}}))).not.toThrow();});
 it('uses public Host when Next rewrites its internal URL',()=>{expect(()=>checkOrigin(new Request('http://localhost:3000/api/import/confirm',{headers:{Origin:'http://127.0.0.1:3000',Host:'127.0.0.1:3000'}}))).not.toThrow();});
 it('signs expiring sessions with user identity and session version',async()=>{const secret='test-secret-32-characters-or-longer-12345';vi.stubEnv('SESSION_SECRET',secret);const actor={id:'user1',role:'VIEWER',sessionVersion:7} as Actor;const token=await signSession(actor);const {payload}=await jwtVerify(token,new TextEncoder().encode(secret));expect(payload.sub).toBe('user1');expect(payload.version).toBe(7);expect(payload.exp!-payload.iat!).toBe(28800);await expect(jwtVerify(token,new TextEncoder().encode('incorrect-key'))).rejects.toThrow();});
});
