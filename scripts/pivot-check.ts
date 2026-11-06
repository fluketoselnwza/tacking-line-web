import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import Decimal from 'decimal.js';
import { parseWorkbook } from '../src/lib/excel';
// Deliberately requires a known Pivot total and matching date scope: no guessing
// which grand total/cached pivot cell belongs to which source filter.
const [path,from,to,pivotTotal,line,recipe]=process.argv.slice(2);
if(!path||!from||!to||pivotTotal===undefined)throw new Error('Usage: npx tsx scripts/pivot-check.ts file.xlsx YYYY-MM-DD YYYY-MM-DD pivotTons [LINE] [RECIPE]');
const buffer=readFileSync(path),parsed=parseWorkbook(buffer);
if(parsed.errors.length)throw new Error(`Source has ${parsed.errors.length} validation errors`);
const rows=parsed.rows.filter(r=>r.usageDate!==null&&r.usageDate>=from&&r.usageDate<=to&&(!line||r.lineCode===line)&&(!recipe||r.recipeCode===recipe));
const total=rows.reduce((a,r)=>a.plus(r.eachTons??0),new Decimal(0));
const pivotSheets=XLSX.read(buffer,{type:'buffer'}).SheetNames.filter(n=>/pivot/i.test(n));
console.log(JSON.stringify({from,to,line:line??null,recipe:recipe??null,records:rows.length,pivotSheets,sourceTons:total.toFixed(),expectedPivotTons:pivotTotal,difference:total.minus(pivotTotal).toFixed(),matches:total.eq(pivotTotal)},null,2));
if(!total.eq(pivotTotal))process.exitCode=1;
