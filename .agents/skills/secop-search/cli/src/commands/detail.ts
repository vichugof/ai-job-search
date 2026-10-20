import { DATASET_URL, sodaFetch, mapRow, formatCOP, soqlString, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const PROCESS_ID = /^CO1\.REQ\.\d+$/i
const NOTICE_UID = /CO1\.NTC\.\d+/i

/** Map an id / notice UID / SECOP URL to a SoQL where clause, or null if unrecognised. */
export function whereForId(input: string): string | null {
  const s = input.trim()
  if (PROCESS_ID.test(s)) return `id_del_proceso = ${soqlString(s.toUpperCase())}`
  const ntc = s.match(NOTICE_UID)?.[0]
  if (ntc) return `urlproceso.url like ${soqlString(`%noticeUID=${ntc.toUpperCase()}`)}`
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const where = whereForId(opts.id)
  if (!where) {
    writeError(
      `unrecognised id "${opts.id}" - pass a process id (CO1.REQ.123), a notice UID (CO1.NTC.123) or a community.secop.gov.co URL containing noticeUID=`,
      "BAD_ID",
    )
    return 1
  }
  try {
    const params = new URLSearchParams({ $where: where, $limit: "1" })
    const rows = (await sodaFetch(`${DATASET_URL}?${params.toString()}`)) ?? []
    if (rows.length === 0) {
      writeError(`no SECOP II process found for "${opts.id}"`, "NOT_FOUND")
      return 1
    }
    const r = mapRow(rows[0] as Record<string, unknown>)
    if (opts.format === "plain") {
      const lines = [
        r.name ?? r.title ?? "—",
        `Entidad: ${r.company ?? "—"}`,
        `Ubicación: ${r.location ?? "—"}`,
        `Publicado: ${r.date ?? "—"}`,
        `Cierre de respuestas: ${r.deadline ?? "—"}`,
        `Modalidad: ${r.modality ?? "—"}`,
        `Tipo de contrato: ${r.contractType ?? "—"}`,
        `Estado: ${r.status ?? "—"}`,
        `Precio base: ${formatCOP(r.budget)}`,
        `Duración: ${r.duration ?? "—"}`,
        ...(r.awardedTo ? [`Adjudicado a: ${r.awardedTo}`] : []),
        `ID: ${r.id}`,
        `URL: ${r.url ?? "(sin URL pública)"}`,
        "",
        r.description ?? "(sin descripción)",
      ]
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(r, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "FETCH_FAILED")
    return 1
  }
}
