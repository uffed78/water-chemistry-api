# Water Chemistry API - Förbättringsförslag

## Kritiska buggar att fixa

### 1. ✅ FIXAT - Syraberäkning fungerar inte
**Problem**: API:et beräknade inte syramängder automatiskt trots att det stod i dokumentationen.
**Lösning**: Buffertkapacitetsformeln var fel. Ändrade från `(totalBufferCapacity / 1000) * 1.2` till `totalBufferCapacity * 1.5`.

**Test som visar problemet**:
```bash
curl -X POST https://water-chemistry-api.vercel.app/api/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "sourceWater": {
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
    }
  }'
```

**Resultat**: 
- `predictions.mashPH`: 5.91 (för högt!)
- `adjustments.acids`: [] (tom array)
- `warnings`: "Mash pH is high..."

**Förväntat**: API:et borde beräkna lämplig mängd mjölksyra för att sänka pH från 5.91 till 5.2.

## Nya features som behövs

### 2. ✅ IMPLEMENTERAT - Fler pH-prediktioner för att visa progression
**Nuläge**: API returnerade bara `mashPH` och `finalPH`

**Implementerat**: API returnerar nu fyra pH-värden som visar progressionen:
```typescript
predictions: {
  basePH: number,        // pH från endast maltgiva (utan vatten)
  sourcePH: number,      // pH med källvatten (innan justeringar)
  afterSaltsPH: number,  // pH efter salttillsatser (innan syror)
  finalPH: number,       // Slutlig pH efter syror
  mashPH: number,        // Bakåtkompatibilitet (= afterSaltsPH)
  // ... övriga predictions
}
```

Detta skulle ge användaren bättre förståelse för hur varje steg påverkar pH.

### 3. ✅ IMPLEMENTERAT - Stöd för manuella syrajusteringar
**Problem**: När vi skickade `manualAdjustments.acids` räknade API:et inte om pH baserat på syramängden.

**Implementerat**:
```json
{
  "manualAdjustments": {
    "acids": {
      "lactic_88": 3.5,     // 3.5 ml mjölksyra 88%
      "phosphoric_85": 2.0  // 2.0 ml fosforsyra 85%
    }
  }
}
```
Nu räknas `predictions.finalPH` om korrekt baserat på den angivna syramängden. API:et hoppar över automatisk syraberäkning när manuella värden anges.

### 4. ✅ IMPLEMENTERAT - Mash/sparge-uppdelning av tillsatser
**Nuläge**: API returnerade totala mängder, klienten behövde själv dela upp

**Implementerat**: API returnerar nu intelligent uppdelning:
```json
{
  "adjustments": {
    "salts": [...],     // Totala mängder med "target" field
    "acids": [...],     // Totala mängder med "target" field
    "mash": {           // Specifikt för mäsken
      "salts": [...],
      "acids": [...]
    },
    "sparge": {         // Specifikt för lakvattnet
      "salts": [...],
      "acids": [...]
    },
    "boil": {           // Specifikt för koket
      "salts": [...]
    }
  }
}
```

**Uppdelningslogik:**
- **Gypsum/Epsom**: 50% mäsk (pH), 50% kok (hoppkaraktär)  
- **Calcium chloride/NaCl**: 67% mäsk, 33% kok (undvik hård bitterhet)
- **Alkaliska salter**: 100% mäsk (pH-justering)
- **Syror**: Separeras automatiskt mellan mäsk och lak

### 5. ✅ FÖRBÄTTRAT - Bättre hantering av targetWater
**Problem**: API:et överskred ofta målvärdena och optimerade dåligt

**Förbättrat**: Ny optimeringsalgoritm med overshoot-prevention:
- Beräknar max mängd per salt för att undvika överskridning
- Iterativ optimering med 30 steg
- Viktat poängsystem för olika joner
- 80% konservativ applicering per iteration

**Resultat för Burton-on-Trent profil:**
- Calcium: 273/275 ppm (99% match)
- Sulfate: 610/610 ppm (100% match)
- Chloride: 33/35 ppm (94% match)
- Sodium: 24/25 ppm (96% match)

**Kvarstående begränsningar:**
- Bicarbonate kan vara svårt att matcha exakt (påverkar pH)
- Magnesium kan behöva manuell justering för vissa profiler

## Implementation priority

1. **Kritisk**: Fix syraberäkning (#1)
2. **Viktig**: Lägg till pH-progression (#2)
3. **Viktig**: Stöd manuella syrajusteringar (#3)
4. **Nice-to-have**: Mash/sparge split (#4)
5. **Nice-to-have**: Fix targetWater (#5)

## Kompatibilitet
Dessa ändringar bör vara bakåtkompatibla:
- Nya fält läggs till i `predictions` (bryter inte existerande kod)
- `adjustments` kan ha både gammal struktur och ny mash/sparge struktur
- Manuella syrajusteringar är redan en del av request-formatet

## Testfall för verifiering
Efter implementation, verifiera att:
1. Syra beräknas när pH > targetPH
2. `basePH`, `afterSaltsPH`, `finalPH` returneras korrekt
3. Manuella syrajusteringar påverkar `finalPH`
4. Mash/sparge split följer dokumenterade regler
5. targetWater används för saltberäkningar