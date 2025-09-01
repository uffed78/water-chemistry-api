# Backlog

Lightweight checklist of future improvements. Purpose: keep scope visible and easy to pick up later.

## Auto Optimizer – API Options
Expose as optional fields in `POST /api/calculate` when `mode: "auto"`.
- allowedSalts: string[] — whitelist of salt ids (e.g., ["gypsum","calcium_chloride","sodium_chloride"]).
- maxSalts: number — cap number of different salts in the solution.
- maxSaltAmount: number — per‑salt gram limit (default 10–12 g).
- tolerancePPM: number — target total absolute deviation across ions.
- assumeCarbonateDissolution: boolean — already supported internally; consider routing from API for all optimizers.
- constraints: object — soft caps for ion totals, e.g. { maxSodium, maxMagnesium, maxCalcium, maxTDS }.
- flavor: 'hoppy' | 'balanced' | 'malty' — weighting toward SO4:Cl ratio targets.
- ratioTarget: number — explicit target for sulfate:chloride ratio.

## Optimizer Algorithms
- Port “exact”/“balanced” options above into request handling with safe defaults.
- Optional: NNLS/L2 minimization backend for exact (non‑negative least squares) to reduce iteration tuning.

## Validation & Parity
- Add parity tests (mash mode, 17 L) against fixed Bru’n‑like cases:
  - RO + [gypsum, CaCl2, NaCl, NaHCO3, CaCO3, Ca(OH)2] single‑gram checks → expected ppm.
  - Two style targets (hoppy IPA, malty stout): assert total deviation thresholds for balanced/exact.

---
Owner: maintainers
Status: backlog (do not implement by default)
