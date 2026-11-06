# Verification — 2026-11-05

Executed locally on macOS arm64, Node 24.3.0, Next.js 15.5.29, Prisma 6.19.0, PostgreSQL.

| Check | Result |
|---|---|
| TypeScript `npm run typecheck` | PASS |
| Unit tests `npm test` | PASS: 28 tests (7 integration tests intentionally skipped here) |
| PostgreSQL `npm run test:integration` | PASS: 7 integration tests |
| Production `npm run build` | PASS: all routes compiled |
| HTTP smoke against production server | PASS: 12 GET endpoints, authentication, Admin/Viewer authorization, CSRF, pagination validation, CSV/XLSX export, 6 app pages |
| HTTP import workflow against production server | PASS: multi-sheet Excel preview, Pivot exclusion, exact totals, missing SUM MASS, hash duplicate skip, replace, rollback, errors CSV, edit validation, delete/audit |
| Real source workbook vs Pivot | NOT VERIFIED: requested workbook was not present in workspace |
| Visual/browser interaction checks | NOT VERIFIED: browser native bridge unavailable (`privileged native pipe bridge is not available; browser-client is not trusted`) |
| Postman CLI collection execution | NOT RUN: local initialization failed with macOS Keychain `SecItemCopyMatching failed -50`; checked API through saved Node HTTP scripts instead |

Database migrations were deployed to the two newly created databases `recipe_dashboard` and `recipe_dashboard_test`. Seed inserted Admin/Viewer users only. Tests used unique TEST_*/HTTP_TEST_* datasets and cleaned their own rows, batches and audit entries. No sample usage records were left as dashboard data.

The initial HTTP check caught an Origin/Host mismatch caused by the Next.js internal URL. The implementation now compares actual Host, with optional APP_ORIGIN for canonical HTTPS deployments. A unit test covers this case, and both HTTP suites passed after the fix.

Installed dependencies required a lockfile-first workflow because of the host's low free disk space. Only this task's npm cache and generated dependency source maps were removed. A fresh machine can use standard `npm ci`; dependency sources are not customized.
