#!/usr/bin/env bun
// Self-contained CLI for searching Colombian public-procurement processes in
// SECOP II, via the official open-data copy on datos.gov.co (Socrata SODA API,
// dataset p6dx-8zbt). No external CLI framework and zero runtime dependencies.
//
// Public open data: no login, no API key. Keep volume low all the same -
// datos.gov.co's robots.txt asks for a 1-second crawl delay.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { queryAlternatives } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", d: "department", c: "city", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `secop-cli — search Colombian public contracting processes (SECOP II, datos.gov.co)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <CO1.REQ.id|CO1.NTC.uid|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>        Keywords matched (case-insensitive substring) in the process
                            name or description. Use uppercase OR for alternatives (max 5):
                            -q "catastro OR topograf OR SIG geograf". Use accent-free stems
                            ("topograf", "geograf") - matching is accent-sensitive.
  --department, -d <text>   Entity department, substring match: "Valle", "Antioquia".
  --city, -c <text>         Entity city, substring match: "Cali", "Palmira".
  --jobage <days>           Published within N days.
  --status <mode>           open (default): processes still accepting responses, excluding
                            direct contracting, asset sales, rentals and purchases.
                            all: everything, including already-awarded direct contracts
                            (useful as a signal of who is hiring and at what fee).
  --page <n>                1-indexed page. Default 1.
  --limit, -n <n>           Results per page (1-200). Default 25.
  --format <fmt>            json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "catastro" --jobage 30 --format table
  bun run src/cli.ts search -q "catastr OR predial OR topograf" -d "Valle" --jobage 30 --format table
  bun run src/cli.ts search -q "catastro" -c "Cali" --status all --jobage 30 --format table
  bun run src/cli.ts detail CO1.REQ.11205948 --format plain
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "department", "city", "jobage", "status", "page", "limit", "format", "help", "h"]),
  detail: new Set(["format", "help", "h"]),
}

function fail(error: string, code = "BAD_ARG"): number {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
  return 1
}

function parsePositiveInt(name: string, raw: string | boolean | string[], max?: number): number | string {
  const val = typeof raw === "string" ? Number(raw.trim()) : NaN
  if (!Number.isInteger(val) || val < 1 || (max !== undefined && val > max)) {
    return `--${name} must be a whole number of at least 1${max ? ` and at most ${max}` : ""}, got "${raw}"`
  }
  return val
}

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2))
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  // Unknown flags are rejected, never silently dropped: a discarded filter
  // changes what the search returns with no error.
  const knownFlags = KNOWN_FLAGS[cmd]
  if (knownFlags) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || knownFlags.has(key)) continue
      return fail(
        `unknown flag --${key} for '${cmd}' - flags are never silently ignored, because a discarded filter changes what the search returns; see --help for the supported flags`,
        "UNKNOWN_FLAG",
      )
    }
  }

  if (cmd === "search") {
    for (const name of ["query", "department", "city"]) {
      if (flags[name] !== undefined && (typeof flags[name] !== "string" || !(flags[name] as string).trim())) {
        return fail(`--${name} requires a non-empty value`)
      }
    }
    if (typeof flags.query === "string") {
      const alts = queryAlternatives(flags.query)
      if (alts.length === 0) return fail("--query has no search terms")
      if (alts.length > 5) return fail(`--query supports at most 5 OR alternatives, got ${alts.length}`)
    }
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "table", "plain"].includes(fmt)) return fail(`--format must be one of json|table|plain, got "${fmt}"`)
    const status = flags.status !== undefined ? String(flags.status) : "open"
    if (!["open", "all"].includes(status)) return fail(`--status must be one of open|all, got "${status}"`)

    let jobage: number | undefined
    if (flags.jobage !== undefined) {
      const v = parsePositiveInt("jobage", flags.jobage)
      if (typeof v === "string") return fail(v)
      jobage = v
    }
    let page = 1
    if (flags.page !== undefined) {
      const v = parsePositiveInt("page", flags.page)
      if (typeof v === "string") return fail(v)
      page = v
    }
    let limit = 25
    if (flags.limit !== undefined) {
      const v = parsePositiveInt("limit", flags.limit, 200)
      if (typeof v === "string") return fail(v)
      limit = v
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      department: typeof flags.department === "string" ? flags.department : undefined,
      city: typeof flags.city === "string" ? flags.city : undefined,
      jobage,
      status: status as SearchOpts["status"],
      page,
      limit,
      format: fmt as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) return fail("detail requires an <id|url>", "NO_ID")
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "plain"].includes(fmt)) return fail(`--format must be one of json|plain, got "${fmt}"`)
    const opts: DetailOpts = { id, format: fmt as DetailOpts["format"] }
    return runDetail(opts)
  }

  return fail(`Unknown command "${cmd}"`, "BAD_CMD")
}

// Set exitCode rather than calling process.exit(): exit() can terminate before
// a large stdout write to a pipe has drained, truncating JSON at ~64 KB.
main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e), code: "INTERNAL_ERROR" }) + "\n",
    )
    process.exitCode = 1
  })
