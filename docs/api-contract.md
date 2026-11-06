# API behavior and response shapes

Authoritative operation list: `openapi.json`. The Postman v2.1 collection is generated from the same operation list by `python3 scripts/generate-contract.py`; scripts/assertions are maintained in `scripts/http-smoke.ts` rather than duplicated in generated collections. No cloud workspace binding was created (local CLI initialization failed with macOS Keychain error).

## Shared contract

- Successful JSON calls return the payload directly. Errors return `{error: string, details?: [{field,message}]}`. Internal exceptions never expose stack traces, file paths, SQL or credentials.
- Every endpoint except login requires `recipe_session` cookie. Admin and Viewer can read. Writes require Admin except logout. History rollback is Admin only. Mutations require an Origin header matching the request origin.
- Weights are decimal strings, percentages are decimal strings or null when comparison denominator is zero. Record date fields are ISO UTC midnight values representing date-only PostgreSQL DATE. Chart series date is YYYY-MM-DD.
- Exact dimension filters: dataset (default BIN), productCode, recipeCode, lineCode, remark (FG/WIP), kibbleCode. Optional search matches codes/recordNo case-insensitively.
- `from/to` are inclusive YYYY-MM-DD. `year` and optional `month` further intersect the date range. No month without year. `grain` is daily/weekly/monthly, weeks start Monday.
- Pagination: page >=1, pageSize 1–100 (default 20), sort whitelist and asc/desc. Date range reversed, invalid dates, unsupported sort and oversized pages return 400.
- Login rate limit: 8 attempts per email per 15 min per process. Use a shared perimeter limiter for multi-instance deployment.

## Authentication

POST `/api/auth/login` JSON `{email,password}` → `{user:{id,name,role,email}}`, sets HttpOnly 8h session. GET `/api/auth/me` → `{id,email,name,role,sessionVersion}`. POST logout revokes every session for that account and deletes cookie → `{ok:true}`.

## Import

POST preview multipart `file` (.xlsx/.xls, max 10 MiB, validated signature/MIME), optional dataset → `{batchId,expiresAt,rows,errors,sheets,ignoredSheets,totalRows,validRows,errorRows,ambiguous,conflicts,fileMatches}`. Each preview row contains 10 canonical fields plus sourceEachTons/sourceSheet/sourceRow. Missing SUM MASS is null. Conflicts list records on any incoming date. FileMatches list previously imported identical hashes. Preview lasts 1 hour and binds to uploader. Preview never mutates MaterialUsage.

POST confirm `{batchId,mode:'skip'|'replace'|'cancel'}` → ImportBatch (serialized counts/status). Invalid rows or ambiguous keys block confirm with 422, stale/already committed batch returns 409, expired returns 410. Every check is repeated under database write lock at commit. Skip skips complete dates already present in the selected dataset, or the complete file if SHA-256 matches a committed import. Replace replaces whole dates present in preview; the UI explicitly confirms this scope. Audit and before snapshot are transactional. Nothing imports on failure.

GET history → `{items,total,page,pages}`, fixed 20 items/page. GET history/id → batch with errors/uploader/record count. GET history/id/errors → CSV. POST history/id/rollback restores replaced rows and removes imported rows atomically with audit; rejects if later edits, deletes, replacements or dependent batches could be lost.

## Dashboard / analysis

GET summary → `{metrics,previousMetrics,changes,period,dailyUsage,lineDistribution,lineSummary,topRecipes,recipes,fgWip,kibble,lines,recipeByLine,monthlyUsage,grandTotal}`.

- metrics: totalTons, totalKg, totalSumMassKg, sumMassRecords, totalRecords, activeLines, activeRecipes. SUM MASS is independent, nulls excluded.
- period: `{from,to,previousFrom,previousTo}` or null. Previous is the immediately preceding equal-length period with same dimension filters.
- changes: percent delta for each metric or null if previous is zero.
- dailyUsage: `[{date,total,...lineCode:tons}]`; sparse buckets represent recorded usage only.
- distributions: `[{name,tons,kg,records,percentage}]`, descending tons; no fixed enum for LINE/recipes/EX codes.
- lineSummary: `[{name,previous,current,total,change,percentage}]`. Total = current+previous. Percentage denominator is current grand total.
- grandTotal: previous/current/total/change/percentage across all filtered lines.
- lines includes topRecipes and fgWip per line. recipeByLine includes lines and daily series per recipe.

Individual dashboard endpoints return the matching array. GET recipes and GET lines return the same analytical snapshot with the dimensions needed by their screens. GET filters → observed sorted code arrays plus dateFrom/dateTo for dataset.

## Records / audit / export

GET records → `{items,total,page,pageSize,pages}` with stable secondary id sorting. GET records/id → complete row. PATCH records/id accepts all editable fields except eachTons (derived) and source fields; missing SUM MASS is null. Record date/number changes must still meet dataset/date/No unique key. DELETE removes row after UI confirmation. Both require Admin and record before/after Audit.

GET audit (Admin) → latest 100 entries, optional entityId. Entries include actor name, timestamps and before/after JSON snapshots.

GET export `type=records|summary|recipes|lines`, `format=xlsx|csv`, plus same filters. Records maximum 50,000; larger scope returns 413. Exports use entire filtered data, independent of pagination. Numeric weights are strings to preserve original precision; CSV formula-like values are escaped. Excel generated through SheetJS uses string cells for source codes and decimal text. Attachment filenames are server constants.
