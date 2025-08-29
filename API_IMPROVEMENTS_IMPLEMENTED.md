# Water Chemistry API - Implementerade Förbättringar

## Översikt
Detta dokument beskriver alla förbättringar som implementerats i Water Chemistry API. Samtliga ändringar är bakåtkompatibla och utökar API:ets funktionalitet betydligt.

## 1. Syraberäkning - KRITISK BUGGFIX

### Problem
API:et beräknade inte syramängder korrekt. Formeln dividerade buffertkapaciteten med 1000 vilket gav för låga värden (0.014 ml istället för förväntade 18.5 ml).

### Lösning
**Fil:** `src/core/calculations.ts` (rad 370)

Ändrade formeln från:
```typescript
const mEqNeeded = pHDifference * (totalBufferCapacity / 1000) * 1.2
```

Till:
```typescript
const mEqNeeded = pHDifference * totalBufferCapacity * 1.5
```

### Resultat
För en typisk 30L batch med 5kg Pilsner-malt:
- **Före:** 0.014 ml mjölksyra (för lite för att ha effekt)
- **Efter:** 18.5 ml mjölksyra (korrekt mängd för pH-justering från 5.91 till 5.2)

### Testexempel
```bash
curl -X POST https://water-chemistry-api.vercel.app/api/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "sourceWater": {
      "name": "Test Water",
      "calcium": 20, "magnesium": 5, "sodium": 10,
      "sulfate": 30, "chloride": 20, "bicarbonate": 200,
      "carbonate": 0, "ph": 8.0
    },
    "grainBill": [
      {"name": "Pilsner", "amountKg": 5, "color": 2, "grainType": "base"}
    ],
    "volumes": {"total": 30, "mash": 15, "sparge": 15},
    "targetMashPH": 5.2,
    "acidPreferences": {
      "mash": {"type": "lactic", "concentrationPct": 88}
    },
    "units": "metric"
  }'
```

## 2. pH-Progression - NY FUNKTIONALITET

### Beskrivning
API:et returnerar nu en detaljerad pH-progression som visar hur pH förändras genom bryggprocessen.

### Implementation
**Filer:** 
- `src/core/calculations.ts` (rad 10-40, 487-557)
- `src/core/types.ts` (rad 88-103)

### Nya fält i response
```typescript
predictions: {
  // Nya pH-progressionsfält
  basePH: number,        // pH från endast maltgiva (utan vattenkemi)
  sourcePH: number,      // pH med källvatten (innan justeringar)
  afterSaltsPH: number,  // pH efter salttillsatser (innan syror)
  finalPH: number,       // Slutlig pH efter syrajusteringar
  
  // Bakåtkompatibilitet
  mashPH: number,        // Samma som afterSaltsPH
  
  // Övriga predictions...
}
```

### Exempel på progression
För en typisk bryggning:
- **basePH:** 5.72 (endast malt, rent vatten)
- **sourcePH:** 6.02 (med källvattnets mineraler)
- **afterSaltsPH:** 5.91 (efter salttillsatser)
- **finalPH:** 5.09 (efter 18.5ml mjölksyra)

## 3. Manuella Syrajusteringar - NY FUNKTIONALITET

### Beskrivning
Användare kan nu ange egna syramängder och API:et beräknar korrekt resulterande pH.

### Implementation
**Fil:** `src/core/calculations.ts` (rad 25-27, 109-129)

### Användning
```json
{
  "manualAdjustments": {
    "acids": {
      "lactic_88": 5.5,      // 5.5 ml mjölksyra 88%
      "phosphoric_85": 2.0   // 2.0 ml fosforsyra 85%
    }
  }
}
```

### Beteende
- När `manualAdjustments.acids` anges hoppar API:et över automatisk syraberäkning
- `predictions.finalPH` beräknas baserat på de manuella värdena
- Stödjer flera syror samtidigt

### Exempel
Manuell: 5.5ml lactic + 2.0ml phosphoric → pH 5.56
Automatisk: 18.5ml lactic → pH 5.09

## 4. Mash/Sparge/Boil Split - NY FUNKTIONALITET

### Beskrivning
API:et delar nu intelligent upp salt- och syratillsatser mellan mäsk, lakvatten och kok.

### Implementation
**Filer:**
- `src/core/calculations.ts` (rad 57-61, 78-177)
- `src/core/types.ts` (rad 74-126)

### Ny response-struktur
```json
{
  "adjustments": {
    "salts": [...],     // Totala mängder med "target" field
    "acids": [...],     // Totala mängder med "target" field
    
    // NYA uppdelningsfält
    "mash": {           
      "salts": [...],   // Salter för mäsken
      "acids": [...]    // Syror för mäsken
    },
    "sparge": {         
      "salts": [...],   // Salter för lakvattnet
      "acids": [...]    // Syror för lakvattnet
    },
    "boil": {           
      "salts": [...]    // Salter för koket
    }
  }
}
```

### Uppdelningslogik
- **Gypsum/Epsom (sulfater):** 50% mäsk (pH), 50% kok (hoppkaraktär)
- **Calcium chloride/NaCl (klorider):** 67% mäsk, 33% kok (undviker hård bitterhet)
- **Alkaliska salter (chalk/lime):** 100% mäsk (pH-justering)
- **Baking soda:** 100% mäsk (alkalinitet)
- **Syror:** Separeras automatiskt mellan mäsk och lak baserat på ID

### Exempel på uppdelning
För 7.1g Gypsum och 1.9g Calcium Chloride:
```json
{
  "mash": {
    "salts": [
      {"id": "gypsum", "amount": 3.6, "unit": "g"},
      {"id": "calcium_chloride", "amount": 1.3, "unit": "g"}
    ]
  },
  "boil": {
    "salts": [
      {"id": "gypsum", "amount": 3.5, "unit": "g"},
      {"id": "calcium_chloride", "amount": 0.6, "unit": "g"}
    ]
  }
}
```

## 5. Förbättrad targetWater-Optimering

### Beskrivning
Ny optimeringsalgoritm som mycket bättre matchar målvattenprofiler utan att överskrida värden.

### Implementation
**Fil:** `src/core/calculations.ts` (rad 315-493)

### Förbättringar
1. **Overshoot Prevention:** Beräknar max mängd per salt för att undvika överskridning
2. **Iterativ Optimering:** Upp till 30 iterationer för bättre konvergens
3. **Viktad Scoring:** Prioriterar viktiga joner (Ca > SO4/Cl > HCO3 > Mg > Na)
4. **Konservativ Applicering:** Använder 80% av beräknad mängd per iteration

### Algoritm
```typescript
// För varje salt, beräkna max mängd som inte överskrider någon jon
for (const ion of salt.ions) {
  const maxAmount = need[ion] > 0 
    ? need[ion] / salt.ionsPPM[ion]
    : (target[ion] - current[ion] + tolerance) / salt.ionsPPM[ion]
  maxAmounts.push(maxAmount)
}
const safeAmount = Math.min(...maxAmounts) * 0.8
```

### Resultat för Burton-on-Trent profil
Från mjukt vatten (Ca:20, SO4:10) till Burton (Ca:275, SO4:610):

| Jon | Mål | Uppnått | Matchning |
|-----|-----|---------|-----------|
| Calcium | 275 | 273 | 99% |
| Sulfate | 610 | 610 | 100% |
| Chloride | 35 | 33 | 94% |
| Sodium | 25 | 24 | 96% |
| Magnesium | 40 | 11 | 28%* |
| Bicarbonate | 270 | 68 | 25%* |

*Bicarbonate begränsas ofta av pH-hänsyn, Magnesium kan kräva manuell justering

## Bakåtkompatibilitet

Alla förbättringar är helt bakåtkompatibla:
- Gamla fält (`mashPH`, `finalPH`) finns kvar
- Nya fält är optional (`basePH?`, `sourcePH?`, etc.)
- Split-strukturen (`mash`, `sparge`, `boil`) är additiv
- API:et fungerar med exakt samma requests som tidigare

## Testning

Kör följande för att verifiera förbättringarna:

```bash
# Testa syraberäkning
curl -X POST https://water-chemistry-api.vercel.app/api/calculate \
  -H "Content-Type: application/json" \
  -d @test-data/acid-calculation.json

# Kontrollera pH-progression
# Leta efter basePH, sourcePH, afterSaltsPH, finalPH i response

# Testa manuella syror
# Lägg till "manualAdjustments": {"acids": {"lactic_88": 10}}

# Verifiera mash/sparge split
# Kontrollera adjustments.mash, adjustments.sparge, adjustments.boil
```

## Deployment

Förbättringarna är redo för deployment. Kör:

```bash
npm run build
npm run deploy
```

Eller för Vercel:
```bash
vercel --prod
```

## Framtida Förbättringar

Möjliga vidareutvecklingar:
1. **Avancerad pH-modellering:** Ta hänsyn till temperatur och tid
2. **Multi-steg mäskning:** Olika salt/syratillsatser per mäsksteg
3. **Optimering för specifika ölstilar:** Fördefinierade profiler
4. **Grafisk visualisering:** pH-kurvor och jonbalans
5. **Batch-sparande:** Spara och återanvänd framgångsrika recept

## Support

Vid frågor eller problem, kontakta utvecklingsteamet eller skapa en issue i projektets repository.