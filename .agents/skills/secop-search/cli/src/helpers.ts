// Shared helpers for secop-search: SODA (Socrata) fetch with backoff, SoQL
// building, and row -> result mapping for the "SECOP II - Procesos de
// Contratación" open-data dataset on datos.gov.co.

export const DATASET_URL = "https://www.datos.gov.co/resource/p6dx-8zbt.json"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; secop-search-cli/1.0)"

/**
 * GET a SODA endpoint with exponential backoff on 429/5xx. Returns null on 404.
 * A 400 carries Socrata's query-error message, which is surfaced verbatim.
 */
export async function sodaFetch(url: string): Promise<unknown[] | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return null
    if (!response.ok) {
      let msg = `${response.status} ${response.statusText}`
      try {
        const body = (await response.json()) as { message?: string }
        if (body?.message) msg += `: ${body.message.split("\n")[0]}`
      } catch {}
      throw new Error(`Request failed: ${msg}`)
    }
    const data = await response.json()
    if (!Array.isArray(data)) throw new Error("Unexpected response: expected a JSON array")
    return data
  }
  throw new Error("Request failed after max retries")
}

/** Escape a value for a SoQL single-quoted string literal. */
export function soqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

/**
 * Split a query on uppercase OR into at most 5 alternatives. Each alternative
 * matches (case-insensitive substring) the process name or description.
 */
export function queryAlternatives(query: string): string[] {
  return query
    .split(/\s+OR\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function keywordClause(query: string): string {
  const alts = queryAlternatives(query).map((alt) => {
    const lit = soqlString(`%${alt.toUpperCase()}%`)
    return `upper(nombre_del_procedimiento) like ${lit} OR upper(descripci_n_del_procedimiento) like ${lit}`
  })
  return `(${alts.join(" OR ")})`
}

// "open" mode keeps processes a person can still respond to. Direct contracting
// (contratación directa) is excluded because it is published only once the
// contractor is already chosen; asset sales, rentals and purchases are excluded
// because they are not service work.
export const OPEN_STATES = ["Publicado", "Abierto"]
export const EXCLUDED_MODALITY_PREFIXES = ["Contratación directa", "Enajenación"]
export const EXCLUDED_CONTRACT_TYPES = [
  "Compraventa",
  "Arrendamiento de inmuebles",
  "Arrendamiento de muebles",
  "Venta inmuebles",
  "Venta muebles",
  "Comodato",
  "Suministros",
]

export function openClause(): string {
  const states = OPEN_STATES.map(soqlString).join(",")
  const mods = EXCLUDED_MODALITY_PREFIXES.map((m) => `modalidad_de_contratacion not like ${soqlString(m + "%")}`)
  const types = EXCLUDED_CONTRACT_TYPES.map(soqlString).join(",")
  return `estado_del_procedimiento in (${states}) AND ${mods.join(" AND ")} AND tipo_de_contrato not in (${types})`
}

export function isoDaysAgo(days: number, now: Date = new Date()): string {
  const d = new Date(now.getTime() - days * 86400000)
  return d.toISOString().slice(0, 10) + "T00:00:00"
}

export interface SecopResult {
  id: string
  title: string | null
  company: string | null
  location: string | null
  date: string | null
  url: string | null
  noticeUid: string | null
  name: string | null
  description: string | null
  modality: string | null
  contractType: string | null
  status: string | null
  budget: number | null
  duration: string | null
  deadline: string | null
  awardedTo: string | null
}

type Row = Record<string, unknown>

const PLACEHOLDERS = new Set(["", "no definido", "no aplica", "no adjudicado", "no especificado"])

function str(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.replace(/\s+/g, " ").trim()
  return PLACEHOLDERS.has(s.toLowerCase()) ? null : s
}

function day(v: unknown): string | null {
  const s = str(v)
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}

const LOGIN_URL = /\/Login\//i

export function mapRow(r: Row): SecopResult {
  const rawUrl = (r.urlproceso as { url?: string } | undefined)?.url ?? null
  const url = rawUrl && !LOGIN_URL.test(rawUrl) ? rawUrl : null
  const noticeUid = url?.match(/noticeUID=([A-Z0-9.]+)/i)?.[1] ?? null
  const name = str(r.nombre_del_procedimiento)
  const description = str(r.descripci_n_del_procedimiento)
  // The process name is often just "PRESTACION DE SERVICIOS" or the
  // contractor's name; the description says what the work is, so it makes the
  // more useful title.
  const titleSrc = description ?? name
  const title = titleSrc ? (titleSrc.length > 140 ? titleSrc.slice(0, 137) + "..." : titleSrc) : null
  const city = str(r.ciudad_entidad)
  const dept = str(r.departamento_entidad)
  const location = [city, dept].filter(Boolean).join(", ") || null
  const budgetNum = Number(r.precio_base)
  const dur = str(String(r.duracion ?? ""))
  const unit = str(r.unidad_de_duracion)
  return {
    id: String(r.id_del_proceso ?? ""),
    title,
    company: str(r.entidad),
    location,
    date: day(r.fecha_de_publicacion_del),
    url,
    noticeUid,
    name,
    description,
    modality: str(r.modalidad_de_contratacion),
    contractType: str(r.tipo_de_contrato),
    status: str(r.estado_del_procedimiento),
    budget: Number.isFinite(budgetNum) && budgetNum > 0 ? budgetNum : null,
    duration: dur && dur !== "0" ? [dur, unit].filter(Boolean).join(" ") : null,
    deadline: day(r.fecha_de_recepcion_de),
    awardedTo: str(r.nombre_del_proveedor),
  }
}

export function formatCOP(n: number | null): string {
  return n === null ? "—" : "$" + Math.round(n).toLocaleString("es-CO")
}
