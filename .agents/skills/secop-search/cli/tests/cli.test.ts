import { describe, expect, test } from "bun:test"
import { runCLI, parseJSON } from "./helpers.ts"

interface SearchOut {
  meta: { count: number; page: number; status: string }
  results: { id: string; title: string | null; company: string | null; location: string | null; date: string | null; url: string | null }[]
}

describe("live search (datos.gov.co)", () => {
  test("catastro, all statuses, returns populated results", async () => {
    const out = parseJSON<SearchOut>(await runCLI(["search", "-q", "catastro", "--status", "all", "--limit", "5"]))
    expect(out.meta.count).toBeGreaterThanOrEqual(1)
    for (const r of out.results) {
      expect(r.id).toMatch(/^CO1\.REQ\.\d+$/)
      expect(r.title).toBeTruthy()
      expect(r.company).toBeTruthy()
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      for (const k of ["location", "url"]) expect(k in r).toBe(true)
    }
  })

  test("large JSON output is not truncated when piped", async () => {
    const out = parseJSON<SearchOut>(await runCLI(["search", "-q", "catastr", "--status", "all", "--limit", "200"]))
    expect(out.results.length).toBe(out.meta.count)
  })

  test("detail resolves an id returned by search", async () => {
    const out = parseJSON<SearchOut>(await runCLI(["search", "-q", "catastro", "--status", "all", "--limit", "1"]))
    const d = parseJSON<{ id: string; description: string | null }>(await runCLI(["detail", out.results[0].id]))
    expect(d.id).toBe(out.results[0].id)
  })
})

describe("argument validation", () => {
  const cases: [string, string[], string][] = [
    ["unknown flag", ["search", "--bogus", "x"], "UNKNOWN_FLAG"],
    ["bad status", ["search", "--status", "closed"], "BAD_ARG"],
    ["empty query", ["search", "-q", ""], "BAD_ARG"],
    ["too many OR alternatives", ["search", "-q", "a OR b OR c OR d OR e OR f"], "BAD_ARG"],
    ["fractional jobage", ["search", "--jobage", "0.5"], "BAD_ARG"],
    ["limit over 200", ["search", "--limit", "500"], "BAD_ARG"],
    ["detail without id", ["detail"], "NO_ID"],
    ["detail bad id", ["detail", "foo"], "BAD_ID"],
  ]
  for (const [name, args, code] of cases) {
    test(name, async () => {
      const r = await runCLI(args)
      expect(r.exitCode).toBe(1)
      expect(r.stdout).toBe("")
      expect(JSON.parse(r.stderr).code).toBe(code)
    })
  }
})
