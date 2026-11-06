# MaterialIQ — Recipe Material Usage Dashboard

ระบบ Next.js App Router + TypeScript, Tailwind CSS, shadcn/ui components, Recharts, Prisma 6 และ PostgreSQL สำหรับนำเข้าและวิเคราะห์การใช้วัตถุดิบ รองรับ Admin / Viewer พร้อม Audit Log

## Requirements

- Node.js **22 LTS ขึ้นไป** (Node 14 ในเครื่องเดิมใช้ไม่ได้)
- PostgreSQL 14+ หรือ Docker
- พื้นที่ว่างอย่างน้อย 2 GB สำหรับ dependencies/build

## ติดตั้ง

```bash
cd recipe-material-dashboard
nvm install
nvm use
cp .env.example .env
npm ci
# ถ้ายังไม่มี PostgreSQL (port 5432 ต้องว่าง)
docker compose up -d
```

แก้ `.env`: `DATABASE_URL`, `SESSION_SECRET` อย่างน้อย 32 ตัวอักษร และอีเมล/รหัสผ่าน Admin, Viewer (รหัสผ่านอย่างน้อย 12 ตัวอักษร) ห้ามใช้ค่าตัวอย่างใน production

```bash
npm run db:generate
npm run db:migrate
# tsx loads values through Node --env-file for the seed script:
node --env-file=.env --import tsx prisma/seed.ts
npm run dev
```

เปิด http://127.0.0.1:3000 และเข้าสู่ระบบด้วยบัญชีที่ seed ไว้ ถ้าใช้ localhost ให้ใช้ hostname เดียวกันตลอด session

Seed สร้างเฉพาะผู้ใช้ ไม่มี mock usage records และไม่เปลี่ยนบัญชีที่มีอยู่ Dashboard เริ่มด้วย Empty State จนกว่าจะ Import ข้อมูลจริง

```bash
npm run build
npm start
```

ใน production ตั้ง `APP_ORIGIN=https://your-domain.example` และควรอยู่หลัง HTTPS reverse proxy จำกัด request body 11 MB และตั้ง login rate limit ที่ proxy/shared store เพิ่มเติม (in-memory throttle ในแอปมีผลเฉพาะแต่ละ process) รหัสผ่านเก็บด้วย bcrypt, JWT session มีอายุ 8 ชั่วโมงใน HttpOnly/SameSite cookie; Logout เพิ่ม sessionVersion เพื่อ revoke ทุก session ของบัญชีนั้น

## หน้าจอ

- `/dashboard`: 6 KPIs, comparison period, 6 charts, LINE summary, export
- `/upload`: drag/drop, server validation, immutable preview, conflict review, confirmation (Admin)
- `/records`: search/filter/sort, server-side pagination, details, audited edits/deletes (Admin)
- `/recipes`: recipe totals, Top 10, by LINE, daily trends; click recipe to drill down
- `/lines`: comparison, daily/monthly usage, Top Recipes and FG/WIP per LINE
- `/upload/history`: counts, uploader, errors, batch details, audit, rollback (Admin)

## Excel Import

1. ไป `/upload`, เลือก Dataset เช่น `BIN` แล้วเลือก `.xlsx` หรือ `.xls` ไม่เกิน **10 MiB / 50,000 data rows**
2. หัวตารางอยู่ภายใน 50 แถวแรก คอลัมน์ A–J ตามลำดับ:

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| Date | No. | Products | RECIPE | LINE | SUM MASS(KG) | EACH(KG) | EACH(Tons) | REMARK | Usage of kibble |

3. อ่านทุก Sheet ที่มีหัวตารางตรงกัน ข้ามชื่อที่มี `PIVOT` เสมอ Sheet ชื่อยอดใช้/usage ที่หัวตารางผิดจะแจ้ง error ส่วน Sheet อื่นที่ไม่มีหัวตารางจะอยู่ใน ignored sheets
4. รองรับ Excel serial date แบบ 1900/1904, YYYY-MM-DD, DD/MM/YYYY (พ.ศ. ได้), D-MMM-YYYY; ไม่เดา MM/DD/YYYY; carry date เฉพาะเซลล์ A ที่ merge แนวตั้งจริง
5. Preview แสดงจำนวนรายการ, ข้อผิดพลาด, sheet/row ต้นทาง, วันที่เดิม, file hash ซ้ำ ดาวน์โหลด error CSV ได้ ต้องแก้ไข error **ทั้งหมด** ก่อน Confirm ไม่มี partial replace ที่ตัดแถวผิดทิ้งเงียบ ๆ
6. Preview เก็บฝั่ง server อายุ 1 ชั่วโมง ผู้อัปโหลดเท่านั้นยืนยันได้ Client ไม่ส่งแถวกลับมาทับ Preview
7. Confirm จะตรวจซ้ำอีกครั้งใน transaction มี advisory lock ร่วมกับ edit/delete/rollback, unique constraint ป้องกัน race

### น้ำหนักและความละเอียด

- EACH(KG) เป็นค่าหลัก ต้องไม่ว่าง/ไม่ติดลบ; canonical EACH(Tons) = KG / 1000 ใช้ Decimal.js และ PostgreSQL NUMERIC ไม่บวกน้ำหนักด้วย JavaScript Number
- ถ้า EACH(Tons) ว่างคำนวณจาก KG; ถ้ามีค่า ยอมรับค่าที่ปัดเศษแบบ half-up ตามจำนวนทศนิยมของค่าตัวเลขในไฟล์ เช่น KG 6188 กับ Tons 6.19; ศูนย์ท้ายทศนิยมและรูปแบบการแสดงผลของเซลล์ไม่นับเป็นความละเอียดเพิ่มเติม โดยยังบันทึกค่าจริง 6.188 จาก KG และเก็บต้นฉบับ 6.19 ใน sourceEachTons
- SUM MASS เป็น nullable และแยกจาก EACH ไม่เติมจาก KG, KPI รวมเฉพาะค่าที่มี
- เก็บ KG ที่ NUMERIC(38,15), Tons NUMERIC(38,18), จำกัด input น้ำหนักไม่เกิน 15 decimal places / ต่ำกว่า 1e20; ค่าที่เกินจะถูก reject แทนการปัดเงียบ
- UI charts แปลงเป็น Number เพื่อวาดภาพเท่านั้น ค่า API, totals และ export เป็น decimal strings
- เก็บ usageDate เป็น PostgreSQL DATE ส่ง ISO midnight UTC; แสดง date ด้วย YYYY-MM-DD ไม่แปลง local timezone
- รหัส LINE/RECIPE/Products/Kibble เป็น string ยืดหยุ่น ไม่ hardcode EX1–EX9

### Duplicate / Replace / Rollback

Business key คือ **dataset + usageDate + recordNo** ไม่ใช่ Products/Recipe หาก No. ซ้ำในวันที่เดียวกันข้าม Sheet จะระบุ ambiguous และห้าม Import ต้องยืนยันว่าข้อมูลอยู่คนละ Dataset หรือแก้ไฟล์ต้นฉบับก่อน ระบบไม่เพิ่ม sourceSheet เข้า key เพื่อหลบความซ้ำ

- SHA-256 ระบุไฟล์เดิมภายใน Dataset; Skip ไฟล์ที่ Hash เคย Import แล้วจะข้ามทั้งหมด
- **Skip**: ข้ามทุกแถวในวันที่มีข้อมูลอยู่ใน Dataset แล้ว นำเข้าเฉพาะวันที่ยังไม่มีข้อมูล (เหมาะกับไฟล์ daily/monthly snapshots)
- **Replace**: แทนที่ **ทุกแถวของวันที่ปรากฏในไฟล์ที่ผ่าน validation ภายใน Dataset** รวมแถวเดิมที่ไม่อยู่ในไฟล์ใหม่ด้วย ต้องยืนยันใน UI จึงเหมาะกับ snapshot ที่ครบวัน ไม่ใช่ partial correction
- **Cancel**: เปลี่ยนสถานะ Preview ไม่เปลี่ยน MaterialUsage
- Replace เก็บ before snapshot และ Audit ภายใน transaction; ถ้าล้มเหลวข้อมูลเดิมอยู่ครบ
- Rollback ลบรายการจาก Batch และคืน before snapshot ด้วย ID เดิม; ปฏิเสธหากมี manual edit/delete, ข้อมูลถูก replace ต่อ, หรือมี batch ใหม่ที่เกี่ยวข้อง ต้องย้อนจากล่าสุดก่อน ไม่บังคับทับข้อมูล
- ImportBatch/ผู้ใช้ที่เกี่ยวข้องกับ MaterialUsage ห้ามลบด้วย FK Restrict
- ประวัติและ Audit เก็บไว้ถาวร; ระบบไม่ล้าง Preview ที่หมดอายุอัตโนมัติ หากข้อมูลเยอะให้จัด retention policy เพิ่มตามองค์กร

## Filters / KPI

Date range inclusive, Month+Year และทุก dimension รวมแบบ AND ค่าเริ่มต้น Dataset BIN, ไม่มีช่วงวันที่หมายถึงข้อมูลทั้งหมดที่ตรง Filter; UI เปลี่ยนใช้ Date range หรือ Month/Year สลับกัน หากเรียก API ทั้งคู่จะ intersect

Previous period เป็นช่วงก่อนหน้าทันทีที่ยาวเท่าช่วงปัจจุบัน (รวมวันต้น/ท้าย) ใช้ dimension filters เดียวกัน แต่ถอด date/month/year เพื่อเทียบข้ามเดือน/ปีได้ หากไม่ระบุวันต้น/ท้ายจะใช้ extent ของข้อมูลที่ตรง Filter KPI เปอร์เซ็นต์ฐานเดิม 0 แสดง N/A ไม่แสดง infinity

LINE Summary: Current = ช่วงปัจจุบัน, Previous = ช่วงก่อนหน้า, **Total = Current + Previous**, Percentage ใช้ Current / Current Grand Total; Grand Total คิดจากข้อมูลทั้งหมดภายใต้ Filter ไม่ใช่เฉพาะหน้า/ข้อความค้นหา LINE ภายในตาราง

กราฟรายสัปดาห์เริ่มวันจันทร์ รายเดือนเริ่มวันที่ 1; ไม่มีข้อมูลใน bucket หมายถึงไม่มี record ไม่ใช่การคาดการณ์

## API contract

[OpenAPI](docs/openapi.json), [response semantics](docs/api-contract.md), [Postman collection](docs/postman.collection.json)

ทุก API ตรวจ session; mutation ต้องส่ง `Origin` ตรง request origin เพื่อป้องกัน CSRF; Viewer อ่าน/export ได้ แต่ทุก mutation นอกจาก logout ต้อง Admin ไม่มี API key/default anonymous fallback

```bash
# Import collection into Postman, set baseUrl, email/password locally.
# Cookie jar retains login session. Never commit real credentials.
```

## Automated tests

```bash
npm test
# Integration suite skipped unless RUN_DB_TESTS=1 and TEST_DATABASE_URL are set.
# Create a DEDICATED test database, then migrate it:
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
RUN_DB_TESTS=1 node --env-file=.env --import tsx node_modules/vitest/vitest.mjs run
npm run typecheck
npm run build
```

Integration suite creates a unique TEST_* dataset/user and cleans **only its own** rows. Do not point TEST_DATABASE_URL at production. Covers multi-sheet/Pivot exclusion, .xls, date formats/epoch, Decimal precision, missing SUM MASS, rounded and mismatched tons, duplicate ambiguity, database duplicate/replacement/rollback, failed transaction restoration, aggregation/filtering and viewer authorization. HTTP smoke script verifies session authorization and all endpoints against the running app:

```bash
node --env-file=.env --import tsx scripts/http-smoke.ts
node --env-file=.env --import tsx scripts/http-workflow.ts
```

### ตรวจ Pivot จากไฟล์จริง

ไฟล์ `ยอดใช้อาหาร BIN (2).xlsx` และภาพอ้างอิงยังไม่อยู่ใน workspace ขณะพัฒนา จึงยังไม่ยืนยันยอดกับ Pivot จริง

```bash
npx tsx scripts/pivot-check.ts 'ยอดใช้อาหาร BIN (2).xlsx' 2026-07-01 2026-07-31 123.456
# Optional matching LINE and RECIPE:
npx tsx scripts/pivot-check.ts 'file.xlsx' 2026-07-01 2026-07-31 123.456 LINE1 R001
```

`pivotTons` ต้องอ่านจาก Pivot ที่ช่วงวันที่และ filters เดียวกัน คำสั่งนี้เทียบ exact decimal กับผลรวมรายการจริงและคืน exit 1 เมื่อไม่ตรง ไม่เดา cell ของ Pivot ที่ไม่รู้โครงสร้าง

## ข้อจำกัดที่ต้องทราบ

- การวิเคราะห์ใช้ snapshot transaction อ่าน filtered rows แล้ว aggregate ด้วย Decimal ใน server memory เหมาะกับขนาดระดับไฟล์ 50,000 แถว สำหรับข้อมูลหลายล้านแถวควรย้าย aggregation ไป SQL GROUP BY/materialized summaries โดยยังใช้ NUMERIC
- Workbook parse เป็น synchronous ใน Node runtime จำกัดขนาด/จำนวนแถวและตรวจ signature; production ที่รับไฟล์จากบุคคลภายนอกควรใช้ worker แยก process พร้อม memory/CPU limit เพื่อจำกัดไฟล์ ZIP ที่ขยายตัวมาก
- Export Excel เก็บน้ำหนักเป็น string เพื่อรักษาความละเอียด เมื่อนำไปคำนวณใน Excel ให้แปลงชนิดเองโดยคำนึงถึงขีดจำกัด 15 significant digits ของ Excel
- UI host ฟอนต์ Sarabun Regular/SemiBold ใน public/fonts พร้อมใบอนุญาต SIL OFL ไม่ต้องโหลดฟอนต์จากภายนอกตอนเปิดหน้า

# tacking-line-web

### Environment configuration

Server code, seed scripts, and HTTP checks read environment settings through
`src/lib/config.ts`. Settings present in the local `.env` have fallback values
in config; environment values override these defaults (an empty string remains
an explicit value). These defaults include credentials, so keep the config private.
For example `import { config } from '@/lib/config'` and
`config.sessionSecret`. Do not import this module into client components because
it exposes server settings and credentials. Next.js loads `.env` for the app;
standalone scripts need Node's `--env-file=.env` flag as in `npm run db:seed`.
Prisma CLI keeps `env("DATABASE_URL")` in `prisma/schema.prisma` because the schema
cannot import TypeScript config. Runtime Prisma clients use `config.databaseUrl`.
Integration tests use `TEST_DATABASE_URL` only when `NODE_ENV=test` and
`RUN_DB_TESTS=1`. HTTP checks accept `SMOKE_BASE_URL` (default
`http://127.0.0.1:3000`).
