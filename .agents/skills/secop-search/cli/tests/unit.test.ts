import { describe, expect, test } from "bun:test"
import { keywordClause, mapRow, openClause, soqlString, isoDaysAgo } from "../src/helpers.ts"
import { buildWhere } from "../src/commands/search.ts"
import { whereForId } from "../src/commands/detail.ts"

describe("SoQL building", () => {
  test("escapes single quotes", () => {
    expect(soqlString("O'Brien")).toBe("'O''Brien'")
  })

  test("OR alternatives match name or description, uppercased", () => {
    const c = keywordClause("catastro OR topograf")
    expect(c).toContain("upper(nombre_del_procedimiento) like '%CATASTRO%'")
    expect(c).toContain("upper(descripci_n_del_procedimiento) like '%TOPOGRAF%'")
  })

  test("lowercase or is a plain word, not an operator", () => {
    expect(keywordClause("this or that")).toContain("'%THIS OR THAT%'")
  })

  test("open mode excludes direct contracting and asset sales", () => {
    const c = openClause()
    expect(c).toContain("estado_del_procedimiento in ('Publicado','Abierto')")
    expect(c).toContain("modalidad_de_contratacion not like 'Contratación directa%'")
    expect(c).toContain("modalidad_de_contratacion not like 'Enajenación%'")
  })

  test("all mode has no open filter; jobage maps to a date floor", () => {
    const now = new Date("2026-10-20T12:00:00Z")
    const w = buildWhere({ query: "catastro", jobage: 14, status: "all", page: 1, limit: 25, format: "json" }, now)
    expect(w).not.toContain("estado_del_procedimiento")
    expect(w).toContain(`fecha_de_publicacion_del >= '${isoDaysAgo(14, now)}'`)
    expect(isoDaysAgo(14, now)).toBe("2026-10-06T00:00:00")
  })
})

describe("detail id parsing", () => {
  test("process id", () => {
    expect(whereForId("co1.req.11205948")).toBe("id_del_proceso = 'CO1.REQ.11205948'")
  })
  test("notice uid inside a URL", () => {
    expect(
      whereForId("https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=CO1.NTC.11060152"),
    ).toBe("urlproceso.url like '%noticeUID=CO1.NTC.11060152'")
  })
  test("garbage", () => {
    expect(whereForId("12345")).toBeNull()
  })
})

describe("row mapping", () => {
  test("placeholders become null, login URLs are dropped, description is the title", () => {
    const r = mapRow({
      id_del_proceso: "CO1.REQ.1",
      entidad: "ALCALDIA X",
      ciudad_entidad: "No Definido",
      departamento_entidad: "Valle del Cauca",
      nombre_del_procedimiento: "PRESTACION DE SERVICIOS",
      descripci_n_del_procedimiento: "Apoyo   a la gestión catastral",
      fecha_de_publicacion_del: "2026-10-14T00:00:00.000",
      precio_base: "0",
      duracion: "0",
      nombre_del_proveedor: "No Definido",
      urlproceso: { url: "https://community.secop.gov.co/STS/Users/Login/Index" },
    })
    expect(r.title).toBe("Apoyo a la gestión catastral")
    expect(r.location).toBe("Valle del Cauca")
    expect(r.date).toBe("2026-10-14")
    expect(r.url).toBeNull()
    expect(r.budget).toBeNull()
    expect(r.duration).toBeNull()
    expect(r.awardedTo).toBeNull()
    // contract-required keys are present even when null
    for (const k of ["id", "title", "company", "location", "date", "url"]) expect(k in r).toBe(true)
  })
})
