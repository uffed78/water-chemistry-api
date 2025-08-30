# Jämförelse med Bru'n Water - Identifierade Problem

## Sammanfattning
Vid jämförelse mellan vår API och Bru'n Water för samma input (Dublin-profil) har flera kritiska problem identifierats.

## Testfall
- **Source Water:** RO (0 ppm på allt)  
- **Target Water:** Dublin (Ca: 118, Mg: 4, SO₄: 55, Cl: 19 ppm)
- **Volym:** 32.2L total
- **Salter:** Gypsum 1.5g, CaCl₂ 0.7g, Baking Soda 1.1g, MgCl₂ 0.3g

## Problem 1: Felaktig PPM-beräkning ❌

### Symptom
Vår app visar nästan dubbla ppm-värden jämfört med Bru'n Water för samma salttillsatser.

### Orsak
**Fil:** `src/core/calculations.ts`, rad 648-664

Våra `ionsPPMPerGram` värden i `salts.ts` är redan "ppm per gram per liter", men vi behandlar dem som "ppm per gram totalt".

### Exempel
För 1.5g Gypsum i 32.2L:
- **Förväntat:** Ca = (1.5/32.2) × 232.5 = 10.8 ppm
- **Vår app visar:** 30.1 ppm (nästan 3x för mycket!)
- **Bru'n Water:** 35 ppm (vilket inkluderar andra källor)

### Analys av formeln
```typescript
// NUVARANDE (FELAKTIG):
const gramsPerLiter = adjustment.amount / volumeLiters
water.calcium += salt.ionsPPMPerGram.calcium * gramsPerLiter

// Exempel: 1.5g / 32.2L = 0.0466 g/L
// 232.5 ppm/g × 0.0466 g/L = 10.8 ppm ✓ (matematiskt korrekt)
```

Men vår app visar 30.1 ppm istället för 10.8! Detta tyder på att något annat också är fel, möjligen:
1. Volymen som används är fel (kanske bara mash-volym?)
2. Salterna appliceras flera gånger
3. Split-funktionen dubblerar mängderna

## Problem 2: Auto-calculate misslyckas totalt ❌

### Symptom
Auto-calculate ger bara:
- Ca: 30 ppm (mål: 118)
- Mg: 1 ppm (mål: 4)  
- SO₄: 52 ppm (mål: 55)
- Cl: 18 ppm (mål: 19)
- HCO₃: 25 ppm (mål: 160)

### Orsak
Optimeringsalgoritmen är för försiktig eller stannar för tidigt. Den når inte ens i närheten av målvärdena, särskilt för calcium och bikarbonat.

## Problem 3: pH-beräkning skiljer sig ⚠️

### Symptom
- **Vår app:** pH 5.40 (efter syra)
- **Bru'n Water:** pH 5.72 (utan syra, visar -1.3ml = för alkalisk)

### Möjliga orsaker
1. Olika formler för pH-beräkning
2. Felaktig buffertkapacitet för malten
3. Bikarbonatets påverkan beräknas fel

## Problem 4: Volymhantering misstänkt 🔍

### Observation
Om vi får 30.1 ppm Ca istället för 10.8 ppm, är det en faktor ~2.8x.

Möjliga förklaringar:
- Använder vi bara mash-volym (17L) istället för total (32.2L)?
- 32.2 / 17 = 1.89 (inte 2.8)
- Kanske används fel volym någonstans

## Problem 5: Split-funktionen påverkar inte ppm ⚠️

Mash/sparge/boil split delar upp salterna men verkar inte påverka de slutliga ppm-beräkningarna korrekt.

## Rekommenderade åtgärder

### 1. Verifiera PPM-formeln
Kontrollera exakt hur `ionsPPMPerGram` ska tolkas och används.

### 2. Spåra volymberäkning
Lägg till debug-logging för att se vilken volym som faktiskt används i `applySaltAdjustments`.

### 3. Förbättra auto-calculate
- Öka antal iterationer
- Justera vikter för olika joner
- Tillåt större steg för att nå målen

### 4. Validera mot Bru'n Water
Skapa enhetstester som jämför våra resultat med kända Bru'n Water-beräkningar.

### 5. pH-formel granskning
Jämför våra pH-formler med Bru'n Water's dokumentation.

## Testkommandon

```bash
# Testa PPM-beräkning
npx ts-node test-brunwater-comparison.ts

# Testa Dublin target optimization
npx ts-node test-dublin-target.ts
```

## Slutsats
API:et har fundamentala problem med:
1. **PPM-beräkningar** - ger 2-3x för höga värden
2. **Auto-calculate** - når inte målprofiler
3. **pH-beräkning** - skiljer sig från Bru'n Water

Dessa problem måste åtgärdas innan API:et kan anses tillförlitligt för bryggning.