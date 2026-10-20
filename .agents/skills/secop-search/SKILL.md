---
name: secop-search
version: 1.0.0
description: >
  Use this skill to search Colombian public-sector contracting processes on SECOP II
  (Sistema Electrónico de Contratación Pública) via the official open-data API on
  datos.gov.co — prestación de servicios, consultorías and other contracts published
  by entities like the ANT, IGAC, catastros municipales, alcaldías and gobernaciones.
  Market: Colombia, postings in Spanish. Trigger phrases: SECOP, SECOP II, contratación
  pública, procesos de contratación, contratos de prestación de servicios, convocatorias
  públicas, licitaciones, contratista, "is any entity contracting catastro / SIG work",
  public contracts Colombia, government contracts Colombia.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/secop-search/cli/src/cli.ts *)
---

# SECOP II Search Skill

Searches **SECOP II contracting processes** through the government's open-data copy
of the platform (dataset `p6dx-8zbt`, "SECOP II - Procesos de Contratación", updated
daily on [datos.gov.co](https://www.datos.gov.co/)). No login, no API key, and **zero
runtime dependencies** — it runs with just `bun`.

## Read this first: SECOP is not a job board

In Colombia, much public-sector professional work is hired as **contratos de prestación
de servicios** (personal service contracts). Most of those are awarded by **contratación
directa** and appear in SECOP only once the contractor is already chosen (estado
"Seleccionado"). So the skill has two modes:

| `--status` | What you get | Use it for |
|---|---|---|
| `open` (default) | Processes still in "Publicado"/"Abierto" state, excluding direct contracting, asset sales, rentals, purchases and supply contracts | Opportunities a person or firm can still respond to (régimen especial invitations, mínima cuantía, concursos de méritos) |
| `all` | Everything, including already-awarded direct contracts | **A hiring-demand signal**: which entities are contracting cadastre/GIS professionals right now, and for what fees. Contact those entities directly; this is not a list of jobs to apply to |

Many open processes are aimed at **firms** (consultorías with large budgets). The
ones that suit an individual professional are usually prestación de servicios under
régimen especial or mínima cuantía with modest budgets.

## Commands

### Search processes

```bash
bun run .agents/skills/secop-search/cli/src/cli.ts search [flags]
```

- `--query <text>` / `-q` — case-insensitive substring match in the process **name or description**. Combine alternatives with uppercase `OR` (max 5): `-q "catastr OR predial OR topograf"`. **Matching is accent-sensitive**, so prefer accent-free stems (`topograf`, `geograf`, `catastr`).
- `--department <text>` / `-d` — the contracting entity's department (substring): `"Valle"`, `"Antioquia"`, `"Bogot"`.
- `--city <text>` / `-c` — the entity's city (substring): `"Cali"`, `"Palmira"`.
- `--jobage <days>` — published within N days (on `fecha_de_publicacion_del`).
- `--status open|all` — see the table above. Default `open`.
- `--page <n>` — 1-indexed. `--limit <n>` / `-n` — page size, 1-200, default 25.
- `--format json|table|plain` — default `json`.

Location is the **entity's** location, not where the work happens; a Medellín-based
company may contract work in Turbo. Read the description.

### Fetch one process

```bash
bun run .agents/skills/secop-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

Accepts a process id (`CO1.REQ.11205948`), a notice UID (`CO1.NTC.11060152`), or a
`community.secop.gov.co` URL containing `noticeUID=`. Returns the full description,
modality, contract type, status, base price, duration, response deadline and awardee.

## Usage examples

```bash
# Open cadastre processes nationwide, last 30 days
bun run .agents/skills/secop-search/cli/src/cli.ts search -q "catastr" --jobage 30 --format table

# Open cadastre / property / survey processes from entities in Valle del Cauca
bun run .agents/skills/secop-search/cli/src/cli.ts search -q "catastr OR predial OR topograf" -d "Valle" --jobage 30 --format table

# Who in Cali is contracting cadastre professionals (awarded contracts = demand signal)
bun run .agents/skills/secop-search/cli/src/cli.ts search -q "catastr" -c "Cali" --status all --jobage 30 --format plain

# GIS work anywhere, open
bun run .agents/skills/secop-search/cli/src/cli.ts search -q "geograf OR SIG OR cartograf" --jobage 14 --format table

# Full details of one process
bun run .agents/skills/secop-search/cli/src/cli.ts detail CO1.REQ.11205948 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default: programmatic use. Each result has `id`, `title`, `company` (entity), `location`, `date`, `url`, plus `noticeUid`, `name`, `description`, `modality`, `contractType`, `status`, `budget` (COP), `duration`, `deadline`, `awardedTo` |
| `table` | Quick scanning: id, date, entity, location, base price, status, title |
| `plain` | Reading results with modality, status and budget |

Errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Notes

- `title` is built from the **description**, because the process name is often generic ("PRESTACION DE SERVICIOS") or just the contractor's name.
- `url` is `null` when SECOP lists only its login page (draft processes). The public page itself (`community.secop.gov.co`) blocks automated clients (403); open URLs in a browser.
- `deadline` comes from "Fecha de Recepción de Respuestas" and is often empty for régimen especial processes. Check the SECOP page for the actual cronograma.
- Keyword noise: "catastro" also matches property sales ("ficha catastral") and utility network cadastres ("catastro de redes"). Open mode removes sales; read the description for the rest.
- `budget` is the process's precio base for the whole contract, not a monthly fee. Divide by the duration in months to compare against a salary.
- The dataset is refreshed daily, so same-day processes may not appear yet.
- datos.gov.co's robots.txt asks for a 1-second crawl delay. Keep volume low.
