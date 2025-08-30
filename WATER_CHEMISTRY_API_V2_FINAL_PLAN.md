# Water Chemistry API v2.0 - FINAL Implementation Plan

## VIKTIG STRATEGI ÄNDRING
**Vi ERSÄTTER all gammal kod med ny, korrekt implementation.**
- Ingen legacy kod behålls
- Samma endpoints används (så appen fortsätter fungera)
- Allt byggs korrekt från början

## Fas 1: Radera och Förbered

### 1.1 Vad som raderas
```
RADERA:
src/core/calculations.ts    # Trasig optimering, fel PPM-beräkning
src/core/types.ts           # Överkomplicerade types
src/core/grain-database.ts  # Behålls men flyttas till v2
src/core/salts.ts          # Behålls men flyttas till v2
api/styles.ts              # Onödig

BEHÅLL (tills vidare):
api/calculate.ts           # Ersätts med ny implementation
vercel.json               # Deployment config
package.json             # Dependencies
```

### 1.2 Ny struktur
```
api/
  calculate.ts           # NY implementation (ersätter gamla)
  profiles.ts           # NY endpoint för profiler
  validate.ts          # NY endpoint för validering

src/
  v2/                  # ALL NY KOD
    calculations/
      ppm.ts          # Korrekt PPM-beräkning med volumeMode
      ph.ts           # Simple, Kaiser, Advanced modeller
      optimize.ts     # ENKEL, FUNGERANDE optimering
    
    data/
      salts.ts        # Verifierade saltvärden (från gamla)
      acids.ts        # Syrakonstanter
      grains.ts       # Maltdata (från gamla grain-database)
      water-profiles.json   # Burton, Dublin, etc.
      style-profiles.json   # IPA, Stout, etc.
    
    types/
      index.ts        # Enkla, tydliga TypeScript types
    
    utils/
      validation.ts   # Input validering
      helpers.ts      # Hjälpfunktioner
```

## Fas 2: Korrekt Implementation från Början

### 2.1 PPM-beräkning (KRITISKT)

#### src/v2/calculations/ppm.ts
```typescript
export type VolumeMode = 'total' | 'mash' | 'staged'

export function calculatePPM(
  saltGrams: number,
  ionsPPMPerGram: number,
  volumes: { total: number, mash: number, sparge: number },
  mode: VolumeMode = 'mash',  // DEFAULT TILL MASH SOM BRU'N WATER
  location?: 'mash' | 'sparge' | 'boil'
): number {
  let effectiveVolume: number
  
  switch(mode) {
    case 'mash':
      // Bru'n Water standard - koncentration i mäskvolymen
      effectiveVolume = volumes.mash
      break
      
    case 'staged':
      // Beräkna baserat på var saltet läggs
      if (location === 'mash') {
        effectiveVolume = volumes.mash
      } else if (location === 'sparge') {
        effectiveVolume = volumes.sparge
      } else {
        effectiveVolume = volumes.total
      }
      break
      
    case 'total':
      // För de som blandar allt vatten först (ovanligt)
      effectiveVolume = volumes.total
      break
  }
  
  return (saltGrams / effectiveVolume) * ionsPPMPerGram
}

// Beräkna för alla joner från en salt
export function calculateSaltContribution(
  salt: Salt,
  grams: number,
  volumes: Volumes,
  mode: VolumeMode = 'mash'
): WaterProfile {
  return {
    calcium: salt.ions.calcium ? 
      calculatePPM(grams, salt.ions.calcium, volumes, mode) : 0,
    magnesium: salt.ions.magnesium ? 
      calculatePPM(grams, salt.ions.magnesium, volumes, mode) : 0,
    sodium: salt.ions.sodium ? 
      calculatePPM(grams, salt.ions.sodium, volumes, mode) : 0,
    sulfate: salt.ions.sulfate ? 
      calculatePPM(grams, salt.ions.sulfate, volumes, mode) : 0,
    chloride: salt.ions.chloride ? 
      calculatePPM(grams, salt.ions.chloride, volumes, mode) : 0,
    bicarbonate: salt.ions.bicarbonate ? 
      calculatePPM(grams, salt.ions.bicarbonate, volumes, mode) : 0,
  }
}
```

### 2.2 Enkel, Fungerande Optimering

#### src/v2/calculations/optimize.ts
```typescript
// ENKEL OCH FÖRSTÅELIG ALGORITM
export function optimizeWaterSimple(
  source: WaterProfile,
  target: WaterProfile,
  volumes: Volumes,
  mode: VolumeMode = 'mash'
): SaltAdditions {
  
  const additions: SaltAdditions = {}
  const current = { ...source }
  
  // Steg 1: Calcium behov
  const calciumNeeded = target.calcium - current.calcium
  
  // Steg 2: Sulfat vs Klorid behov
  const sulfateNeeded = target.sulfate - current.sulfate
  const chlorideNeeded = target.chloride - current.chloride
  
  // Steg 3: Välj rätt salter (ENKEL LOGIK)
  
  // Om vi behöver både Ca och SO4 → Gypsum
  if (calciumNeeded > 0 && sulfateNeeded > 0) {
    const gypsum = Math.min(
      calciumNeeded / 232.5,     // Max för Ca
      sulfateNeeded / 557.7      // Max för SO4
    ) * volumes.mash  // Gram totalt
    
    additions.gypsum = Math.round(gypsum * 10) / 10
    current.calcium += (additions.gypsum / volumes.mash) * 232.5
    current.sulfate += (additions.gypsum / volumes.mash) * 557.7
  }
  
  // Om vi fortfarande behöver Ca och har Cl behov → CaCl2
  const calciumStillNeeded = target.calcium - current.calcium
  if (calciumStillNeeded > 0 && chlorideNeeded > 0) {
    const cacl2 = Math.min(
      calciumStillNeeded / 272,
      chlorideNeeded / 482
    ) * volumes.mash
    
    additions.calcium_chloride = Math.round(cacl2 * 10) / 10
    current.calcium += (additions.calcium_chloride / volumes.mash) * 272
    current.chloride += (additions.calcium_chloride / volumes.mash) * 482
  }
  
  // Magnesium → Epsom eller MgCl2
  const magnesiumNeeded = target.magnesium - current.magnesium
  if (magnesiumNeeded > 0) {
    if (sulfateNeeded > 0) {
      // Epsom om vi behöver sulfat
      const epsom = (magnesiumNeeded / 98.6) * volumes.mash
      additions.epsom_salt = Math.round(epsom * 10) / 10
    } else if (chlorideNeeded > 0) {
      // MgCl2 om vi behöver klorid
      const mgcl2 = (magnesiumNeeded / 119.5) * volumes.mash
      additions.magnesium_chloride = Math.round(mgcl2 * 10) / 10
    }
  }
  
  // Alkalinitet → Baking Soda (försiktigt!)
  const bicarbonateNeeded = target.bicarbonate - current.bicarbonate
  if (bicarbonateNeeded > 20) {  // Bara om signifikant behov
    const bakingSoda = (bicarbonateNeeded / 726.4) * volumes.mash
    additions.baking_soda = Math.round(bakingSoda * 10) / 10
  }
  
  return additions
}

// Mer avancerad version kan läggas till senare
export function optimizeWaterAdvanced(
  source: WaterProfile,
  target: WaterProfile,
  volumes: Volumes,
  options: {
    mode: VolumeMode,
    strategy: 'balanced' | 'minimal' | 'exact',
    maxSalts: number,
    allowedSalts: string[]
  }
): SaltAdditions {
  // Implementation kommer senare
  // För nu, använd simple
  return optimizeWaterSimple(source, target, volumes, options.mode)
}
```

### 2.3 pH-beräkning (Börja Enkelt)

#### src/v2/calculations/ph.ts
```typescript
// ENKEL MODELL FÖRST
export function calculateMashPH_Simple(
  water: WaterProfile,
  grains: GrainBill[],
  volumes: Volumes
): number {
  // Residual Alkalinity
  const RA = (water.bicarbonate * 0.82) - 
             (water.calcium / 1.4) - 
             (water.magnesium / 1.7)
  
  // Genomsnittlig maltfärg
  const avgColor = grains.reduce((sum, g) => 
    sum + (g.color * g.weight), 0) / 
    grains.reduce((sum, g) => sum + g.weight, 0)
  
  // Enkel linjär approximation
  const basePH = 5.8  // Typisk destillerat vatten pH
  const RAEffect = RA * -0.003  // RA påverkan
  const colorEffect = avgColor * -0.02  // Mörkare malt = lägre pH
  
  return basePH + RAEffect + colorEffect
}

// Kaiser och Advanced modeller kan läggas till senare
```

## Fas 3: API Endpoints (Ersätt Gamla)

### 3.1 api/calculate.ts (ERSÄTT HELT)
```typescript
import { calculateSaltContribution } from '../src/v2/calculations/ppm'
import { optimizeWaterSimple } from '../src/v2/calculations/optimize'
import { calculateMashPH_Simple } from '../src/v2/calculations/ph'

export default function handler(req: Request, res: Response) {
  const { 
    sourceWater, 
    targetWater,
    grainBill,
    volumes,
    mode = 'manual',  // 'manual' | 'auto'
    volumeMode = 'mash',  // 'total' | 'mash' | 'staged'
    additions  // För manual mode
  } = req.body
  
  if (mode === 'manual') {
    // ANVÄNDAREN ANGER SALTER
    const achieved = { ...sourceWater }
    
    // Beräkna bidrag från varje salt
    for (const [saltId, grams] of Object.entries(additions.salts)) {
      const salt = SALTS[saltId]
      const contribution = calculateSaltContribution(
        salt, grams, volumes, volumeMode
      )
      
      // Addera till achieved
      achieved.calcium += contribution.calcium
      achieved.magnesium += contribution.magnesium
      // ... etc
    }
    
    // Beräkna pH
    const mashPH = calculateMashPH_Simple(achieved, grainBill, volumes)
    
    return res.json({
      achieved,
      predictions: { mashPH },
      volumeMode,
      volumeUsed: volumeMode === 'mash' ? volumes.mash : volumes.total
    })
    
  } else {
    // AUTO MODE - OPTIMERA
    const additions = optimizeWaterSimple(
      sourceWater, 
      targetWater, 
      volumes,
      volumeMode
    )
    
    // Beräkna achieved
    const achieved = { ...sourceWater }
    for (const [saltId, grams] of Object.entries(additions)) {
      const salt = SALTS[saltId]
      const contribution = calculateSaltContribution(
        salt, grams, volumes, volumeMode
      )
      // Addera...
    }
    
    const mashPH = calculateMashPH_Simple(achieved, grainBill, volumes)
    
    return res.json({
      additions,
      achieved,
      predictions: { mashPH },
      volumeMode
    })
  }
}
```

### 3.2 api/profiles.ts (NY)
```typescript
import waterProfiles from '../src/v2/data/water-profiles.json'
import styleProfiles from '../src/v2/data/style-profiles.json'

export default function handler(req: Request, res: Response) {
  const { type, id } = req.query
  
  if (type === 'water') {
    if (id) {
      return res.json(waterProfiles[id])
    }
    return res.json(Object.keys(waterProfiles))
  }
  
  if (type === 'style') {
    if (id) {
      return res.json(styleProfiles[id])
    }
    return res.json(Object.keys(styleProfiles))
  }
  
  return res.status(400).json({ error: 'Invalid type' })
}
```

## Fas 4: Data (Korrekt från Början)

### 4.1 src/v2/data/salts.ts
```typescript
export const SALTS = {
  gypsum: {
    id: 'gypsum',
    name: 'Gypsum (CaSO₄·2H₂O)',
    ions: {
      calcium: 232.5,    // ppm per gram per liter
      sulfate: 557.7
    }
  },
  calcium_chloride: {
    id: 'calcium_chloride',
    name: 'Calcium Chloride (CaCl₂)',
    ions: {
      calcium: 272.0,
      chloride: 482.0
    }
  },
  epsom_salt: {
    id: 'epsom_salt',
    name: 'Epsom Salt (MgSO₄·7H₂O)',
    ions: {
      magnesium: 98.6,
      sulfate: 389.5
    }
  },
  magnesium_chloride: {
    id: 'magnesium_chloride',
    name: 'Magnesium Chloride (MgCl₂·6H₂O)',
    ions: {
      magnesium: 119.5,
      chloride: 348.5
    }
  },
  sodium_chloride: {
    id: 'sodium_chloride',
    name: 'Table Salt (NaCl)',
    ions: {
      sodium: 393.3,
      chloride: 606.7
    }
  },
  baking_soda: {
    id: 'baking_soda',
    name: 'Baking Soda (NaHCO₃)',
    ions: {
      sodium: 273.6,
      bicarbonate: 726.4
    }
  }
}
```

### 4.2 src/v2/data/water-profiles.json
```json
{
  "burton": {
    "name": "Burton-on-Trent",
    "calcium": 275,
    "magnesium": 40,
    "sodium": 25,
    "sulfate": 610,
    "chloride": 35,
    "bicarbonate": 270
  },
  "dublin": {
    "name": "Dublin",
    "calcium": 118,
    "magnesium": 4,
    "sodium": 12,
    "sulfate": 55,
    "chloride": 19,
    "bicarbonate": 160
  },
  "pilsen": {
    "name": "Pilsen",
    "calcium": 7,
    "magnesium": 2,
    "sodium": 2,
    "sulfate": 5,
    "chloride": 5,
    "bicarbonate": 15
  }
}
```

## Fas 5: Implementation Steg-för-Steg

### Vecka 1: Grund
1. **Dag 1-2**: 
   - Backup av gammal kod
   - Radera gamla filer
   - Skapa ny mappstruktur
   
2. **Dag 3-4**:
   - Implementera `ppm.ts` med volumeMode
   - Implementera `optimize.ts` (simple version)
   - Testa mot Bru'n Water värden

3. **Dag 5**:
   - Ersätt `api/calculate.ts`
   - Testa med din app
   - Verifiera att PPM är korrekta

### Vecka 2: Utbyggnad
4. **Dag 1-2**:
   - Lägg till pH-beräkning (simple)
   - Lägg till acid beräkningar
   
5. **Dag 3-4**:
   - Implementera `api/profiles.ts`
   - Lägg till water-profiles.json
   - Lägg till style-profiles.json

6. **Dag 5**:
   - Testa hela flödet
   - Jämför med Bru'n Water

### Vecka 3: Förfining
7. Lägg till Kaiser pH-modell
8. Lägg till Advanced optimizer
9. Lägg till validation endpoint
10. Omfattande testning

## Fas 6: Testning

### 6.1 Kritiska tester
```typescript
describe('PPM Calculations', () => {
  test('Mash mode = Bru\'n Water', () => {
    // 1.5g Gypsum, 17L mäsk
    const ppm = calculatePPM(1.5, 232.5, {mash: 17}, 'mash')
    expect(ppm).toBeCloseTo(20.5, 1)
  })
  
  test('Total mode = lägre koncentration', () => {
    // 1.5g Gypsum, 32.2L total
    const ppm = calculatePPM(1.5, 232.5, {total: 32.2}, 'total')
    expect(ppm).toBeCloseTo(10.8, 1)
  })
})

describe('Optimization', () => {
  test('Dublin target', () => {
    const salts = optimizeWaterSimple(
      RO_WATER,
      DUBLIN,
      {mash: 17, total: 32.2},
      'mash'
    )
    
    // Ska ge rimliga salter
    expect(salts.gypsum).toBeLessThan(5)
    expect(salts.calcium_chloride).toBeLessThan(3)
  })
})
```

## Sammanfattning

### Detta är annorlunda från förra planen:
1. **RADERAR all gammal kod** - ingen legacy
2. **ERSÄTTER endpoints** - samma URL, ny kod
3. **ENKEL optimering** - inte 350 rader komplex kod
4. **MASH som default** - som Bru'n Water
5. **Stegvis implementation** - fungerande kod varje dag

### Fokus:
- **Korrekthet** över komplexitet
- **Förståelighet** över "smartness"
- **Testbarhet** från dag 1

### Nästa steg:
1. Backup gammal kod
2. Börja implementation enligt Fas 5
3. Testa varje steg mot Bru'n Water

Detta är en KLAR, EXEKVERBAR plan som ger KORREKTA resultat!