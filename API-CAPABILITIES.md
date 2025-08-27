# Water Chemistry API – Kapabiliteter och Omfattning

Denna fil sammanfattar allt som detta API gör: vilka salter och syror som stöds, vilka beräkningar som implementeras, vilka endpoints som finns, samt kända begränsningar jämfört med Bru'n Water 1.25.

## Översikt
- Syfte: Fristående beräknings-API för bryggvatten som kan användas av valfri klientapp.
- Teknologi: TypeScript, Vercel serverless-funktioner, strikt typning och CORS-stöd.
- Kataloger: `api/` (endpoints), `src/core/` (beräkningsmotor, typer, salter, maltdatabas), `src/data/` (standardprofiler).

## Endpoints
- `GET /api/salts`: Returnerar samtliga bryggsalter och deras jonbidrag per gram.
- `GET /api/profiles`: Returnerar klassiska bryggvattenprofiler (t.ex. Pilsen, Burton, Dublin).
- `POST /api/calculate`: Kör vattenkemi-beräkningar utifrån indata (vattenprofil, maltgiva, volymer, ev. manuella tillsatser).

Not: Planen nämner även `POST /api/validate`, men den endpointen finns inte i denna kodbas.

## Datatyper (förenklat)
- `WaterProfile`
  - `name`, `calcium`, `magnesium`, `sodium`, `sulfate`, `chloride`, `bicarbonate`, `carbonate`, `ph` (+ härledda fält som RA, TDS, ionBalance kan beräknas).
- `GrainBillItem`
  - `name`, `amountKg`, `color` (SRM), `grainType` (`base` | `crystal` | `roasted` | `acidulated` | `other`).
- `CalculationRequest`
  - `sourceWater`, valfritt `targetWater`, `grainBill`, `volumes` (`total`, `mash`, `sparge`), valfritt `targetMashPH`, `units` (`metric` | `imperial`), valfritt `manualAdjustments` (`salts`, `acids`).
- `CalculationResponse`
  - `success`, `sourceWater`, `achievedWater`, `adjustments` (`salts`, `acids`), `predictions`, `warnings`, `recommendations`.

## Salter (8 st)
Följande salter stöds med jonbidrag i mg/L per gram salt per liter (ppm per g/L):

- Gypsum (`CaSO₄·2H₂O`)
  - Ca: 232.5, SO4: 557.7
- Calcium Chloride dihydrate (`CaCl₂·2H₂O`)
  - Ca: 272.0, Cl: 482.0
- Epsom Salt (`MgSO₄·7H₂O`)
  - Mg: 98.6, SO4: 389.5
- Magnesium Chloride (`MgCl₂·6H₂O`)
  - Mg: 119.5, Cl: 348.5
- Sodium Chloride (`NaCl`)
  - Na: 393.3, Cl: 606.7
- Baking Soda (`NaHCO₃`)
  - Na: 273.6, HCO3: 726.4
- Calcium Carbonate – Chalk (`CaCO₃`)
  - Ca: 400.4, HCO3: 1219.2, löslighet begränsad (modellering av löslighet ej införlivad i beräkningarna).
- Calcium Hydroxide – Pickling Lime (`Ca(OH)₂`)
  - Ca: 540.8, OH−: 459.2 (OH− hanteras inte explicit i vattenprofilen, påverkan på alkalinitet är ej modellerad).

Formel för jonbidrag används konsekvent:
- PPM-ökning = (gram salt / liter vatten) × jonbidragsfaktor

## Syror som stöds i beräkningar
- Lactic acid 88% (mEq/mL ≈ 11.76)
- Lactic acid 80% (≈ 10.45)
- Phosphoric acid 85% (≈ 14.67)
- Hydrochloric acid 37% (≈ 11.98)

Användning i motorn:
- Mash: Beräknas mängd syra (framförallt lactic 88%) om predikterat pH ligger över mål (t.ex. 5.4).
- Sparge: Det finns en hjälpfunktion för att uppskatta syrning av spargevattnet (lactic 88% och phosphoric 85%), men den exponerade API-responsen delar inte upp tillsatser i mash/sparge.

Obs: Bru'n Water-listan innehåller fler koncentrationer (10–96%) inkl. svavelsyra; dessa är inte fullt implementerade här.

## Beräkningar och prediktioner
- Mash pH (förenklad modell)
  - Bygger på: viktad DI-pH för malter, residualalkalinitet (RA), mash-tjocklek, samt förstärkt sänkning för specialmalter (crystal/roasted).
  - Returneras avrundat till 2 decimaler i `predictions.mashPH`.
- Residual Alkalinity – RA (Kolbach)
  - RA_as_CaCO3 = (HCO3 × 0.82) + (CO3 × 1.67) − (Ca/1.4) − (Mg/1.7)
- Sulfat/Klorid-kvot
  - `sulfateChlorideRatio = SO4 / max(Cl, 1)`
- Effektiv hårdhet
  - `effectiveHardness = Ca + Mg`
- Total hårdhet (as CaCO3)
  - `totalHardness = Ca × 2.5 + Mg × 4.1`
- Jonbalans (validering)
  - Cation mEq: Ca/20.04 + Mg/12.15 + Na/22.99
  - Anion mEq: HCO3/61.02 + CO3/30.01 + SO4/48.03 + Cl/35.45
  - Balans% = ((kat−an)/ (kat+an)) × 100, med godkänd tolerans ±5%.
- Saltrekommendationer (heuristik)
  - Bestämmer enkla stilmål (ljus/mörk/malty/hoppy) och föreslår mängder av `gypsum`, `calcium_chloride`, `epsom_salt` för att nå rimliga nivåer av Ca, SO4, Cl, Mg.
- Syraaddition (mash)
  - Beräknar mEq behov från pH-avvikelse och kornens buffertkapacitet; konverterar till mL för valda syrastyrkor (framförallt lactic 88%).
- Sparge-syrning (hjälpfunktion)
  - Uppskattar mEq baserat på alkalinitet och mål-pH (~5.5) och konverterar till mL för lactic 88% eller phosphoric 85%.

`predictions` i svaret innehåller: `mashPH`, `finalPH` (≈ mashPH − 0.1), `residualAlkalinity`, `sulfateChlorideRatio`, `effectiveHardness`, `totalHardness`.

## Varningar och rekommendationer
- Varningar kan inkludera: för lågt/högt mash pH, låg/hög Ca, hög Mg/Na/SO4/Cl/HCO3, mycket låg/hög RA.
- Rekommendationer: vägledning utifrån SO4:Cl-kvot och effektiv hårdhet inom önskat intervall.

## Standardprofiler
Följande profiler finns i `src/data/standard-profiles.ts`:
- Pilsen, Burton on Trent, Dublin, London, Munich, Vienna.

Varje profil specificerar Ca, Mg, Na, SO4, Cl, HCO3, CO3, pH.

## Stöd för manuella justeringar
- `manualAdjustments.salts`: godtyckliga gram per salt-id (t.ex. `gypsum: 7`).
- `manualAdjustments.acids`: reserverat fält; mash-syra räknas automatiskt om pH är högt, men explicit fördelning mash/sparge görs inte i svaret.

## Enheter och volymer
- Indata innehåller `volumes.total`, `volumes.mash`, `volumes.sparge`.
- Salttillsatser i nuvarande motor dimensioneras mot totalvolym (mash/sparge-fördelning hanteras inte automatiskt i svaret).
- `units` finns i request men explicit konvertering mellan imperial/metric används inte i beräkningarna (intern logik i metric).

## Kända begränsningar jämfört med Bru'n Water 1.25
- Ingen iterativ Henderson–Hasselbalch-lösning (10 iterationer) för mash pH; förenklad modell används.
- Ingen matris-/least-squares-solver för att exakt matcha målvatten med salter.
- Extra joner (K, NO3) ingår inte i profiler eller jonbalans.
- Temperaturkompensation för pH (t.ex. 25°C → mäsktemp) saknas.
- Kalklöslighet modelleras ej i själva doseringsalgoritmen.
- Pickling lime (OH−) påverkar inte alkalinitet/RA i modellen (OH− saknas i `WaterProfile`).
- Ingen automatisk uppdelning av tillsatser mellan mash/sparge i API-svaret.
- `acids.ts` som separat modul finns inte; syra-beräkningar ligger i `calculations.ts`.

## Mash/Sparge-split (klientrekommendation)
- Mash-kalcium först: Allokera `gypsum`/`calcium_chloride` till mash tills Ca ≥ ~50 ppm i mashvolymen.
- Basiska salter endast i mash: `baking_soda`, `calcium_carbonate`, `calcium_hydroxide` (höjer pH/alkalinitet) läggs i mash, ej i sparge.
- Gypsum/CaCl2 i övrigt: Dela resterande 70/30 mash/sparge eller proportionellt mot volym (`mash/(mash+sparge)`), beroende på preferens.
- `epsom_salt` och `sodium_chloride`: Dela volymproportionellt (t.ex. 50/50 om mash=sparge).
- Syror: Mash-syra enligt API-resultat; sparge-syra beräknas separat mot mål-pH ~5.5 med enkel alkalinitetsmodell:
  - Alkalinitet as CaCO3 ≈ `HCO3_ppm * 0.82`
  - mEq behövs ≈ `(Alk_as_CaCO3 * vol_L) / 50 * faktor` (faktor 0.5–1)
  - Lactic 88% mL ≈ `mEq / 11.76` (Phosphoric 85% ≈ `mEq / 14.67`)

Minimal hjälpfunktion i klient (skiss):
```ts
type Adj = { id: string; name: string; amount: number; unit: 'g'|'ml' }

export function splitAdjustments(
  adjustments: { salts: Adj[]; acids: Adj[] },
  volumes: { mash: number; sparge: number; total: number },
  sourceWater: { bicarbonate: number }
) {
  const mash: { salts: Adj[]; acids: Adj[] } = { salts: [], acids: [] }
  const sparge: { salts: Adj[]; acids: Adj[] } = { salts: [], acids: [] }
  const ratio = volumes.mash / Math.max(volumes.total, 1)

  for (const s of adjustments.salts) {
    const id = s.id
    if (id === 'baking_soda' || id === 'calcium_carbonate' || id === 'calcium_hydroxide') {
      mash.salts.push(s) // endast mash
      continue
    }
    if (id === 'gypsum' || id === 'calcium_chloride') {
      const mashAmt = Math.round(s.amount * 0.7 * 10) / 10
      const spargeAmt = Math.round((s.amount - mashAmt) * 10) / 10
      if (mashAmt > 0) mash.salts.push({ ...s, amount: mashAmt })
      if (spargeAmt > 0) sparge.salts.push({ ...s, amount: spargeAmt })
      continue
    }
    // övriga salter proportionellt mot volym
    const mashAmt = Math.round(s.amount * ratio * 10) / 10
    const spargeAmt = Math.round((s.amount - mashAmt) * 10) / 10
    if (mashAmt > 0) mash.salts.push({ ...s, amount: mashAmt })
    if (spargeAmt > 0) sparge.salts.push({ ...s, amount: spargeAmt })
  }

  // Mash-acid enligt API, sparge-acid via enkel modell (lactic 88%)
  mash.acids = adjustments.acids
  const alkCaCO3 = sourceWater.bicarbonate * 0.82
  const mEq = (alkCaCO3 * volumes.sparge) / 50 * 0.5 // faktor 0.5 som konservativ start
  const lactic88_ml = Math.round((mEq / 11.76) * 10) / 10
  if (lactic88_ml > 0.1) sparge.acids.push({ id: 'lactic_acid_88', name: 'Lactic Acid (88%)', amount: lactic88_ml, unit: 'ml' })

  return { mash, sparge }
}
```

## Testning
- Script i roten (Node-baserade) kör mot byggd `dist/`:
  - `test-local.js`, `test-salts.js`, `test-profiles.js`, `test-brunwater-validation.js`, `test-comprehensive-final.js`.
- Dessa verifierar profiler, saltspecifikationer, pH/RA/kvot-beräkningar och visar exempelutdata.

## Snabbexempel – POST /api/calculate
Request (kortad):
```json
{
  "sourceWater": {
    "name": "My Tap Water",
    "calcium": 50,
    "magnesium": 10,
    "sodium": 15,
    "sulfate": 40,
    "chloride": 20,
    "bicarbonate": 100,
    "carbonate": 0,
    "ph": 7.2
  },
  "grainBill": [
    { "name": "Pilsner Malt", "amountKg": 5, "color": 2, "grainType": "base" }
  ],
  "volumes": { "total": 30, "mash": 15, "sparge": 15 },
  "units": "metric"
}
```
Svar (utdrag):
```json
{
  "success": true,
  "adjustments": { "salts": [...], "acids": [...] },
  "predictions": {
    "mashPH": 5.5,
    "finalPH": 5.4,
    "residualAlkalinity": 80.0,
    "sulfateChlorideRatio": 2.0,
    "effectiveHardness": 60.0,
    "totalHardness": 160.0
  },
  "warnings": [ ... ],
  "recommendations": [ ... ]
}
```

---

Frågor eller önskemål om utökat stöd (t.ex. mash/sparge-split, iterativ pH-modell eller saltsolver)? Lägg gärna upp en issue eller be om en riktad PR.
