# SECOP II - data source reference

## Why the open-data API, not the SECOP II portal

`community.secop.gov.co` is an ASP.NET app behind an Azure Application Gateway that
returns **403** to non-browser clients (including its own `robots.txt`). The same process
data is published by Colombia Compra Eficiente as open data on datos.gov.co (Socrata),
with a public JSON API whose `/resource/` paths robots.txt permits (`Crawl-delay: 1`).

## Endpoint

```
GET https://www.datos.gov.co/resource/p6dx-8zbt.json
```

Dataset: "SECOP II - Procesos de Contratación". Column metadata:
`https://www.datos.gov.co/api/views/p6dx-8zbt.json` (`columns[].fieldName`).
No authentication. An optional Socrata app token (`X-App-Token`) raises rate limits; this
CLI does not use one.

## SoQL parameters used

| Param | Use |
|---|---|
| `$where` | Filters (see below) |
| `$order` | `fecha_de_publicacion_del DESC, id_del_proceso` (stable paging) |
| `$limit` / `$offset` | Page size / `(page-1)*limit` |

Filters built by `search`:

| Flag | SoQL |
|---|---|
| `-q a OR b` | `(upper(nombre_del_procedimiento) like '%A%' OR upper(descripci_n_del_procedimiento) like '%A%' OR ...)` |
| `-d` | `upper(departamento_entidad) like '%X%'` |
| `-c` | `upper(ciudad_entidad) like '%X%'` |
| `--jobage N` | `fecha_de_publicacion_del >= '<today-N>T00:00:00'` |
| `--status open` | `estado_del_procedimiento in ('Publicado','Abierto') AND modalidad_de_contratacion not like 'Contratación directa%' AND ... not like 'Enajenación%' AND tipo_de_contrato not in (Compraventa, Arrendamiento..., Venta..., Comodato, Suministros)` |

`detail` looks up by `id_del_proceso = 'CO1.REQ.x'`, or by notice UID with
`urlproceso.url like '%noticeUID=CO1.NTC.x'`. The `url` column is a Socrata URL type:
`like`/`contains` on `urlproceso` itself is a type error; filter the `.url` sub-field.

Invalid SoQL returns HTTP 400 with `{"message": "Query coordinator error: ..."}`; the CLI
surfaces the first line of that message.

## Response fields → result

| Result field | Column |
|---|---|
| `id` | `id_del_proceso` (CO1.REQ.*) |
| `title` | `descripci_n_del_procedimiento` (falls back to `nombre_del_procedimiento`), truncated to 140 chars |
| `name` | `nombre_del_procedimiento` |
| `company` | `entidad` |
| `location` | `ciudad_entidad`, `departamento_entidad` |
| `date` | `fecha_de_publicacion_del` (ISO timestamp → date) |
| `url` | `urlproceso.url` (null if it is the `/STS/Users/Login/` page) |
| `noticeUid` | `noticeUID=` value from the URL (CO1.NTC.*) |
| `modality` | `modalidad_de_contratacion` |
| `contractType` | `tipo_de_contrato` |
| `status` | `estado_del_procedimiento` (Borrador, Publicado, Abierto, Evaluación, Seleccionado, Cancelado, ...) |
| `budget` | `precio_base` (COP, whole contract) |
| `duration` | `duracion` + `unidad_de_duracion` |
| `deadline` | `fecha_de_recepcion_de` |
| `awardedTo` | `nombre_del_proveedor` |

Placeholder strings `No Definido`, `No Aplica`, `No Adjudicado`, `No Especificado` are
mapped to `null`. Omitted columns (Socrata drops nulls) also map to `null`.

## Observed distribution (catastro, 30 days to 2026-10-20)

~436 of ~520 matches were `Contratación directa / Seleccionado / Prestación de servicios`,
i.e. already-awarded personal-service contracts. Hence the default `open` mode, with
`--status all` kept as a demand signal.
