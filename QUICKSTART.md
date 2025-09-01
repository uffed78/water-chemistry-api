# Water Chemistry API v2 – Snabbguide

Kort, praktisk översikt över alla funktioner som finns nu. Använd denna när du anropar Vercel‑endpoints.

## Endpoints
- `POST /api/calculate` – beräkningar
  - Lägen: `mode: "manual" | "auto"`
  - Volymläge: `volumeMode: "mash" | "total" | "staged"` (default: `mash`)
  - pH‑modell: `phModel: "simple" | "kaiser"` (default: `simple`)
  - Karbonatantagande: `assumeCarbonateDissolution: boolean` (default: `true`)
  - Auto‑optimering: `optimization: "simple" | "balanced" | "exact"` (default: `simple`)
- `POST /api/validate` – validerar planerade tillsatser, ger pH och varningar
- `GET /api/profiles?type=water[&id=...]` – vattenprofiler (id‑lista eller en specifik)
- `GET /api/profiles?type=style[&id=...]` – stilprofiler (id‑lista eller en specifik)
- `GET /api/salts` – saltdefinitioner (hydrater, ppm/gram)

## Viktiga begrepp
- `volumeMode = "mash"` räknar PPM på mäskvolym och matchar Bru’n Water‑logik.
- `assumeCarbonateDissolution = true` ger HCO3⁻ från CaCO3 och stark alkalinitet från Ca(OH)2.
- Auto‑optimering:
  - `simple`: snabb, få salter (grundnivå)
  - `balanced`: fler salter, iterativ förbättring, låg avvikelse
  - `exact`: mest aggressiv minimering av total jon‑avvikelse

## Snabba exempel

Manual (salter angivna)
```bash
curl -sX POST https://<your-vercel>/api/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "manual",
    "sourceWater": {"calcium":0,"magnesium":0,"sodium":0,"sulfate":0,"chloride":0,"bicarbonate":0},
    "additions": {"salts": {"gypsum": 2.0, "calcium_chloride": 1.0}},
    "volumes": {"total": 32.2, "mash": 17, "sparge": 15.2},
    "grainBill": [{"name":"Pilsner","weight":5.0,"color":3,"type":"base"}],
    "phModel": "kaiser",
    "volumeMode": "mash",
    "assumeCarbonateDissolution": true
  }'
```

Auto (balanced)
```bash
curl -sX POST https://<your-vercel>/api/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "auto",
    "optimization": "balanced",
    "sourceWater": {"calcium":0,"magnesium":0,"sodium":0,"sulfate":0,"chloride":0,"bicarbonate":0},
    "targetWater": {"calcium":100,"magnesium":10,"sodium":25,"sulfate":175,"chloride":75,"bicarbonate":40},
    "volumes": {"total": 32.2, "mash": 17, "sparge": 15.2},
    "grainBill": [{"name":"Pale","weight":5.0,"color":4,"type":"base"}],
    "assumeCarbonateDissolution": true
  }'
```

Auto (exact)
```bash
curl -sX POST https://<your-vercel>/api/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "auto",
    "optimization": "exact",
    "sourceWater": {"calcium":0,"magnesium":0,"sodium":0,"sulfate":0,"chloride":0,"bicarbonate":0},
    "targetWater": {"calcium":125,"magnesium":10,"sodium":25,"sulfate":300,"chloride":75,"bicarbonate":30},
    "volumes": {"total": 32.2, "mash": 17, "sparge": 15.2},
    "grainBill": [{"name":"IPA Base","weight":5.0,"color":5,"type":"base"}],
    "phModel": "simple",
    "assumeCarbonateDissolution": true
  }'
```

Validate (planerade tillsatser)
```bash
curl -sX POST https://<your-vercel>/api/validate \
  -H "Content-Type: application/json" \
  -d '{
    "plannedAdditions": {"salts": {"gypsum": 2.0, "calcium_chloride": 1.0}},
    "sourceWater": {"calcium":25,"magnesium":8,"sodium":10,"sulfate":50,"chloride":30,"bicarbonate":80},
    "volumes": {"total": 32.2, "mash": 17, "sparge": 15.2},
    "grainBill": [{"name":"Maris Otter","weight":5.0,"color":6,"type":"base"}],
    "phModel": "kaiser",
    "assumeCarbonateDissolution": true
  }'
```

## Snabba “paritets‑checks” (mash 17 L, RO)
- 1 g NaCl → Na⁺ ≈ 23 ppm, Cl⁻ ≈ 36 ppm
- 1 g CaCO3 → HCO3⁻ ≈ 36 ppm (med antagande på)
- 1 g Ca(OH)2 → HCO3⁻ ≈ 97 ppm

## Tips
- Jämför äpplen med äpplen: samma volymbas (mash vs total) när du jämför mot Bru’n.
- Om du vill undvika upplöst krita, sätt `assumeCarbonateDissolution: false`.
- För exakt match: använd `optimization: "exact"` och håll `targetWater` realistiskt (ingen reducering av joner via salter).
