# secop-cli

Search Colombian public contracting processes (SECOP II) via the datos.gov.co open-data
API. Zero runtime dependencies: `bun install` only pulls TypeScript dev types.

```bash
bun install            # dev types, for typecheck only
bun run typecheck
bun run test           # unit tests + a live smoke test against datos.gov.co
bun run src/cli.ts search -q "catastr" --jobage 30 --format table
bun run src/cli.ts detail CO1.REQ.11205948 --format plain
```

See `../SKILL.md` for flags and `../url-reference.md` for the API details.
