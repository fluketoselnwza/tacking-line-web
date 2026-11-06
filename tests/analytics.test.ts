import { describe,it,expect } from 'vitest';
import { metrics,groups,series,change,type AggregateRow } from '../src/lib/analytics';
import { parseFilters,whereFilters,previousPeriod,utc } from '../src/lib/filters';
const rows:AggregateRow[]=[{usageDate:utc('2026-07-01'),eachKg:'0.1',eachTons:'0.0001',sumMassKg:null,lineCode:'A',recipeCode:'R1',remark:'FG',kibbleCode:'EX1'},{usageDate:utc('2026-07-01'),eachKg:'0.2',eachTons:'0.0002',sumMassKg:'99.9',lineCode:'B',recipeCode:'R1',remark:'WIP',kibbleCode:'EX2'}];
describe('dashboard aggregation',()=>{
 it('separates SUM MASS and EACH using exact decimal sums',()=>{expect(metrics(rows)).toEqual({totalKg:'0.3',totalTons:'0.0003',totalSumMassKg:'99.9',sumMassRecords:1,totalRecords:2,activeLines:2,activeRecipes:1});});
 it('grand total equals grouped records',()=>{expect(groups(rows,'lineCode').map(r=>r.tons)).toEqual(['0.0002','0.0001']);expect(series(rows,'daily')[0].total).toBe('0.0003');});
 it('groups by Monday week / calendar month',()=>{expect(series(rows,'weekly')[0].date).toBe('2026-06-29');expect(series(rows,'monthly')[0].date).toBe('2026-07-01');});
 it('uses an equal length immediately preceding comparison',()=>{const p=previousPeriod(utc('2026-07-01'),utc('2026-07-31'));expect(p.days).toBe(31);expect(p.from.toISOString().slice(0,10)).toBe('2026-05-31');expect(p.to.toISOString().slice(0,10)).toBe('2026-06-30');expect(change(10,0)).toBeNull();expect(change(15,10)).toBe('50.00');});
 it('composes dates and dimension filters',()=>{const f=parseFilters(new URLSearchParams('from=2026-07-01&to=2026-07-02&lineCode=A&recipeCode=R1&remark=FG'));const and=whereFilters(f).AND;expect(and).toContainEqual({lineCode:'A'});expect(and).toContainEqual({recipeCode:'R1'});expect(and).toContainEqual({usageDate:{gte:utc('2026-07-01'),lte:utc('2026-07-02')}});});
 it('validates date range / pagination / arbitrary sort keys',()=>{expect(()=>parseFilters(new URLSearchParams('from=2026-08-01&to=2026-07-01'))).toThrow();expect(()=>parseFilters(new URLSearchParams('pageSize=99999'))).toThrow();expect(()=>parseFilters(new URLSearchParams('sort=passwordHash'))).toThrow();});
});
