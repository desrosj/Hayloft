# Tasks — Hayloft (formerly HarvestArchive)

<!-- Task list for Hayloft. Sections are statuses; one task per checkbox line.
     Inline tags:  !|!!|!!! = priority   #label   due:YYYY-MM-DD   ^id = stable task id (keep it). -->

## In Progress

- [ ] Create WebDevStudios/hayloft, push squashed "Initial release", flip public !!! #oss ^os-publish

## Next

- [ ] Repoint Railway deploy at WebDevStudios/hayloft after publish !! #ops ^os-railway

## Backlog

- [ ] Test suite scaffold (vitest): db helpers, upsert, auth #quality ^bl-tests
- [ ] CSV export per list view #feature ^bl-csv
- [ ] Incremental sync mode docs/polish (`--mode=sync`) #feature ^bl-sync
- [ ] Optional: rotate Harvest PAT + Railway DB password (never committed; cheap insurance) #ops ^bl-rotate

## Done

- [x] Rebrand to Hayloft: rename wds-* Tailwind tokens, login/footer/wordmark, env defaults !!! #oss ^os-rebrand
- [x] Docs for public release: README rewrite, LICENSE (MIT), CONTRIBUTING, issue templates !!! #oss ^os-docs
- [x] Demo seed script (`npm run seed-demo`) for screenshots + contributor onboarding !! #oss ^os-seed
- [x] Screenshots from demo-seeded instance into docs/ !! #oss ^os-shots
- [x] CI workflow: typecheck + CSS build + docker build !! #oss ^os-ci
