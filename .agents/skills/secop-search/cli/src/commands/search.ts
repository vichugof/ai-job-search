import {
  DATASET_URL,
  sodaFetch,
  keywordClause,
  openClause,
  isoDaysAgo,
  mapRow,
  formatCOP,
  soqlString,
  writeError,
  type SecopResult,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  department?: string
  city?: string
  jobage?: number
  status: "open" | "all"
  page: number
  limit: number
  format: "json" | "table" | "plain"
}

export function buildWhere(opts: SearchOpts, now: Date = new Date()): string {
  const parts: string[] = []
  if (opts.query) parts.push(keywordClause(opts.query))
  if (opts.department) parts.push(`upper(departamento_entidad) like ${soqlString(`%${opts.department.toUpperCase()}%`)}`)
  if (opts.city) parts.push(`upper(ciudad_entidad) like ${soqlString(`%${opts.city.toUpperCase()}%`)}`)
  if (opts.jobage !== undefined) parts.push(`fecha_de_publicacion_del >= ${soqlString(isoDaysAgo(opts.jobage, now))}`)
  else parts.push("fecha_de_publicacion_del IS NOT NULL")
  if (opts.status === "open") parts.push(openClause())
  return parts.join(" AND ")
}

export function buildUrl(opts: SearchOpts, now: Date = new Date()): string {
  const params = new URLSearchParams()
  params.set("$where", buildWhere(opts, now))
  params.set("$order", "fecha_de_publicacion_del DESC, id_del_proceso")
  params.set("$limit", String(opts.limit))
  params.set("$offset", String((opts.page - 1) * opts.limit))
  return `${DATASET_URL}?${params.toString()}`
}

function renderTable(rs: SecopResult[]): string {
  if (rs.length === 0) return "No results."
  const header =
    "ID".padEnd(17) + " " + "DATE".padEnd(10) + " " + "ENTITY".padEnd(30) + " " + "LOCATION".padEnd(24) + " " +
    "BUDGET".padEnd(15) + " " + "STATUS".padEnd(11) + " TITLE"
  const rows = rs.map(
    (r) =>
      `${r.id.padEnd(17)} ${(r.date ?? "—").padEnd(10)} ${(r.company ?? "—").slice(0, 30).padEnd(30)} ` +
      `${(r.location ?? "—").slice(0, 24).padEnd(24)} ${formatCOP(r.budget).padEnd(15)} ` +
      `${(r.status ?? "—").slice(0, 11).padEnd(11)} ${(r.title ?? "—").slice(0, 70)}`,
  )
  return [header, "-".repeat(header.length + 20), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const rows = (await sodaFetch(buildUrl(opts))) ?? []
    const results = rows.map((r) => mapRow(r as Record<string, unknown>))
    if (opts.format === "table") {
      process.stdout.write(renderTable(results) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        (results.length === 0
          ? "No results."
          : results
              .map(
                (r) =>
                  `${r.title ?? "—"}\n  ${r.company ?? "—"} · ${r.location ?? "—"} · ${r.date ?? "—"}\n` +
                  `  ${r.modality ?? "—"} · ${r.contractType ?? "—"} · ${r.status ?? "—"} · ${formatCOP(r.budget)}` +
                  (r.deadline ? ` · cierre ${r.deadline}` : "") +
                  (r.awardedTo ? `\n  adjudicado a: ${r.awardedTo}` : "") +
                  `\n  id: ${r.id}\n  ${r.url ?? "(sin URL pública)"}`,
              )
              .join("\n\n")) + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: results.length, page: opts.page, status: opts.status }, results }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "FETCH_FAILED")
    return 1
  }
}
