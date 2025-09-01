# Agents Guide

Purpose: Align agents and contributors on how to work in this repo safely and consistently, especially when switching between Local and Cloud environments.

## Scope
- Only modify API and library code in this repository:
  - `api/` (Vercel serverless endpoints)
  - `src/` (v2 calculations, data, models)
- Do not edit the separate client/app repo from here.
- Do not modify generated output in `dist/` directly.

## Environments
- Local: runs on your machine against the folder opened in VS Code.
- Cloud: runs in an isolated remote workspace (its own filesystem and toolchain).
- Switching the environment changes the entire project scope the agent can read/write.
- Changes in Cloud are not on your disk until you commit/push and pull them locally.

## Safety & Approvals
- Default approval mode: on‑request. Ask before destructive actions (e.g., `rm`, `git reset`, installs requiring network, etc.).
- Never write outside the repo root.
- Prefer small, focused patches. Avoid unrelated refactors.

## Toolchain
- Node/TypeScript (from package.json):
  - TypeScript: ^5.9.x
  - Jest: ^30
- Commands:
  - Build: `npm run build` (emits `dist/`)
  - Test: `npm test`
  - Dev (local serverless): `vercel dev`

## API Endpoints (Vercel)
- `POST /api/calculate` – manual or auto via `mode`
- `POST /api/validate` – validates planned additions and predicts mash pH
- `GET /api/salts` – salt definitions

## Defaults & Domain Rules
- Volume handling: default `volumeMode` = `"mash"` (Bru’n‑like normalization).
- pH models: `"simple"` (default) or `"kaiser"`.
- Carbonate assumption: `assumeCarbonateDissolution = true` by default.
  - CaCO3 (carbonate) counts as HCO3⁻ in mash unless explicitly disabled.
  - Ca(OH)2 contributes alkalinity as HCO3⁻ via CO2 reaction.
- Hydrates used:
  - CaCl2·2H2O, CaSO4·2H2O, MgSO4·7H2O, MgCl2·6H2O.

## Where to Change Things
- PPM logic and per‑salt ion yields: `src/v2/calculations/ppm.ts`, `src/v2/data/salts.ts`.
- pH models: `src/v2/calculations/ph.ts` (+ legacy models in `src/models/ph`).
- Auto optimization (simple): `src/v2/calculations/optimize.ts`.
- v1/legacy optimizers (reference/ideas): `src/models/optimization/` (balanced, exact, minimal).
- HTTP handlers: `api/calculate.ts`, `api/validate.ts`.

## Testing Philosophy
- Run only relevant tests when iterating (`jest -t <name>`), full suite before PR.
- Don’t “fix” failing tests unrelated to your change; call them out in PR notes.
- For volume math, verify against mash vs total explicitly.

## Parity Checks (handy spot checks)
Assume `volumes.mash = 17 L`, `volumeMode = "mash"` and RO source.
- 1 g NaCl → Na⁺ ≈ 393.4/17 ≈ 23.1 ppm, Cl⁻ ≈ 606.6/17 ≈ 35.7 ppm.
- 1 g CaCO3 → HCO3⁻ ≈ (600×1.0168)/17 ≈ 35.9 ppm (with dissolution on).
- 1 g Ca(OH)2 → HCO3⁻ ≈ 1646/17 ≈ 96.8 ppm.

## Optimizers (Auto Mode)
- Current v2: `optimizeWaterSimple` (greedy; 3–4 salter; snabb men grov).
- Available (legacy, richer features):
  - Balanced: multi‑objective (Ca min, SO4:Cl ratio, ion match), max 4 salter.
  - Exact: iterativ minimering av total jon‑avvikelse, stöd för `allowedSalts`, `maxSaltAmount`.
  - Minimal: få salter, uppnår Ca‑min och stil‑ratio.
- Intent: expose selection via API (e.g., `optimization: "balanced" | "exact" | "minimal" | "simple"`). When ported to v2, ensure they use `volumeMode` and the carbonate→bicarbonate rule.

## Definition of Done
- Code compiles (`npm run build`).
- Tests pass or unrelated failures are documented.
- For water math, at least one Bru’n‑like parity case verified.
- README_V2 updated if API inputs/outputs or defaults change.

## Troubleshooting
- Seeing differences vs Bru’n Water? Check:
  - Volume basis (mash vs total), salt distribution, hydrater.
  - `assumeCarbonateDissolution` flag.
  - NaCl and alkalinitet från CaCO3/Ca(OH)2 inkluderas.
- Don’t edit `dist/`; rebuild instead.

## Backlog
- See `BACKLOG.md` for deferred features (API optimizer options, constraints, parity tests). Keep it in sync when you add or remove items.
