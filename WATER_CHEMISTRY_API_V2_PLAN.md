# Water Chemistry API v2.0 - Komplett Implementation Plan

## Översikt
Bygga om API:et från grunden med vetenskapligt korrekta beräkningar, multipla modeller och full flexibilitet. Fokus på korrekthet, modularitet och utbyggbarhet.

## Del 1: Kärnarkitektur

### 1.1 Ny mappstruktur
```
src/
  models/           # Olika beräkningsmodeller
    ph/
      simple.ts     # Enkel linjär pH-modell
      kaiser.ts     # Kai Troester's modell
      advanced.ts   # Full kemisk jämvikt
    water/
      ppm-calculator.ts   # PPM-beräkningar med olika volymlägen
      volume-modes.ts     # Logik för olika volymhantering
    optimization/
      balanced.ts   # Balanserad approach
      minimal.ts    # Minsta tillsatser
      exact.ts      # Exakt matchning
  profiles/         # Utbyggbara profiler (JSON)
    water/          # Burton, Dublin, Pilsen etc.
    styles/         # IPA, Stout, Pilsner etc.
  endpoints/        # API endpoints
    calculate/
      auto.ts       # Automatisk beräkning
      manual.ts     # Manuell input
    profiles/
      water.ts      # Vattenprofiler
      styles.ts     # Ölstilsprofiler
    validate/
      validate.ts   # Validering av recept
  core/            # Gemensam funktionalitet
    chemistry.ts    # Kemiska konstanter
    constants.ts    # Salter, syror etc.
    types.ts        # TypeScript interfaces
```

### 1.2 Volymhanteringsmodeller

#### Total Volume Mode
```typescript
// Alla salter beräknas på total volym
// Exempel: 1g salt / 30L total = 0.033 g/L
// Användning: När allt vatten blandas först (ovanligt)
```

#### Mash Volume Mode (REKOMMENDERAD)
```typescript
// Alla salter beräknas på mäskvolym
// Exempel: 1g salt / 15L mäsk = 0.067 g/L
// Användning: Standard för de flesta bryggare
// Detta är vad Bru'n Water använder
```

#### Staged Mode (AVANCERAD)
```typescript
// Olika salter beräknas på olika volymer
// Mäsksalter → mäskvolym
// Laksalter → lakvolym  
// Koksalter → totalvolym
// Användning: För erfarna bryggare som optimerar varje steg
```

## Del 2: API Endpoints

### 2.1 Beräkningsendpoints

#### POST /api/calculate/auto
Automatisk beräkning för att nå target-profil
```typescript
Request: {
  sourceWater: WaterProfile,
  targetWater?: WaterProfile,      // Eller använd style
  grainBill: GrainBillItem[],
  volumes: { 
    total: number,
    mash: number,
    sparge: number 
  },
  options: {
    volumeMode: 'total' | 'mash' | 'staged',
    phModel: 'simple' | 'kaiser' | 'advanced',
    optimization: 'balanced' | 'minimal' | 'exact'
  }
}

Response: {
  adjustments: {
    salts: SaltAddition[],
    acids: AcidAddition[],
    mash?: { salts, acids },       // Om staged mode
    sparge?: { salts, acids },
    boil?: { salts }
  },
  achievedWater: WaterProfile,
  predictions: {
    mashPH: number,
    finalPH: number,
    // pH progression om advanced model
    basePH?: number,
    sourcePH?: number,
    afterSaltsPH?: number
  },
  analysis: {
    matchPercentage: number,
    warnings: string[],
    suggestions: string[]
  }
}
```

#### POST /api/calculate/manual
Användaren anger salter, API:et beräknar resultat
```typescript
Request: {
  sourceWater: WaterProfile,
  additions: {
    salts: {
      gypsum: 2.5,           // gram
      calcium_chloride: 1.2,
      epsom_salt: 0.5
    },
    acids: {
      lactic_88: 3.5,        // ml
      phosphoric_85: 0
    }
  },
  volumes: { total, mash, sparge },
  grainBill: GrainBillItem[],
  options: { 
    volumeMode: 'total' | 'mash' | 'staged',
    phModel: 'simple' | 'kaiser' | 'advanced'
  }
}

Response: {
  achievedWater: WaterProfile,    // Beräknade PPM
  predictions: {
    mashPH: number,
    finalPH: number,
    sulfateChlorideRatio: number,
    residualAlkalinity: number
  },
  analysis: {
    calciumLevel: 'low' | 'optimal' | 'high',
    flavorProfile: 'hoppy' | 'balanced' | 'malty',
    phStatus: 'too_low' | 'in_range' | 'too_high',
    warnings: string[],
    suggestions: string[]
  }
}
```

### 2.2 Profilhantering

#### GET /api/profiles/water
Lista alla tillgängliga vattenprofiler
```typescript
Response: {
  profiles: [
    {
      id: 'burton',
      name: 'Burton-on-Trent',
      description: 'Classic English IPA water',
      goodFor: ['IPA', 'Bitter'],
      ions: { calcium: 275, sulfate: 610, ... }
    },
    ...
  ]
}
```

#### GET /api/profiles/water/:id
Hämta specifik vattenprofil
```typescript
GET /api/profiles/water/dublin

Response: {
  id: 'dublin',
  name: 'Dublin',
  description: 'Classic Irish Stout water',
  calcium: 118,
  magnesium: 4,
  sodium: 12,
  sulfate: 55,
  chloride: 19,
  bicarbonate: 160,
  goodFor: ['Stout', 'Porter', 'Brown Ale']
}
```

#### GET /api/profiles/style/:id
Hämta optimal vattenprofil för ölstil
```typescript
GET /api/profiles/style/american-ipa

Response: {
  style: 'American IPA',
  description: 'Hop-forward with crisp bitterness',
  recommendedWater: {
    calcium: [100, 150],      // Range
    magnesium: [5, 15],
    sodium: [0, 50],
    sulfate: [200, 350],      // Högt för hoppkaraktär
    chloride: [40, 70],
    bicarbonate: [0, 50],
    sulfateChlorideRatio: [3, 5]
  },
  targetMashPH: [5.2, 5.4],
  notes: 'High sulfate enhances hop bitterness and aroma'
}
```

### 2.3 Validering

#### POST /api/validate
Validera ett recept mot best practices
```typescript
Request: {
  plannedAdditions: {
    salts: { ... },
    acids: { ... }
  },
  sourceWater: WaterProfile,
  targetProfile?: string,        // 'dublin', 'burton', etc.
  grainBill: GrainBillItem[],
  volumes: { ... },
  concerns: [
    'yeast_health',      // Kontrollera Ca, Mg, Zn
    'hop_utilization',   // SO4 nivåer
    'mash_ph',          // pH 5.2-5.6
    'clarity'           // Ca för protein koagulation
  ]
}

Response: {
  valid: boolean,
  issues: [
    {
      severity: 'error' | 'warning' | 'info',
      message: 'Calcium too low for yeast health',
      suggestion: 'Add 0.5g calcium chloride'
    }
  ],
  predictions: {
    fermentation: 'poor' | 'good' | 'excellent',
    clarity: 'cloudy' | 'clear' | 'brilliant',
    flavor_impact: 'too_minerally' | 'balanced' | 'too_soft'
  }
}
```

## Del 3: Implementation av beräkningar

### 3.1 PPM-beräkning (KRITISK FIX)

#### Nuvarande problem:
- API:et beräknar PPM på total volym men visar för höga värden
- Bru'n Water använder mäskvolym för koncentration
- Våra värden är ~2x för låga jämfört med Bru'n Water

#### Ny implementation:
```typescript
function calculatePPM(
  saltGrams: number,
  ionsPPMPerGram: number,
  volumes: { total: number, mash: number, sparge: number },
  volumeMode: 'total' | 'mash' | 'staged',
  saltLocation?: 'mash' | 'sparge' | 'boil'
): number {
  let effectiveVolume: number;
  
  switch(volumeMode) {
    case 'mash':
      // Bru'n Water standard - alla salter på mäskvolym
      effectiveVolume = volumes.mash;
      break;
      
    case 'staged':
      // Beräkna baserat på var saltet läggs
      if (saltLocation === 'mash') {
        effectiveVolume = volumes.mash;
      } else if (saltLocation === 'sparge') {
        effectiveVolume = volumes.sparge;
      } else {
        effectiveVolume = volumes.total;
      }
      break;
      
    default: // 'total'
      effectiveVolume = volumes.total;
  }
  
  return (saltGrams / effectiveVolume) * ionsPPMPerGram;
}
```

### 3.2 pH-modeller

#### Simple Model (simple.ts)
```typescript
// Linjär approximation baserad på residual alkalinity
// Snabb beräkning, ±0.1 pH accuracy
// Bra för överslagsberäkning
```

#### Kaiser Model (kaiser.ts)
```typescript
// Baserad på Kai Troester's forskning
// Tar hänsyn till:
// - Malttyp och färg
// - Buffertkapacitet
// - Vattenkemi
// ±0.05 pH accuracy
```

#### Advanced Model (advanced.ts)
```typescript
// Full kemisk jämvikt
// Henderson-Hasselbalch ekvationen
// Tar hänsyn till:
// - Temperatur
// - Jonaktivitet
// - Kolsyrajämvikt
// Mest exakt men långsammare
```

### 3.3 Optimeringsstrategier

#### Balanced (balanced.ts)
```typescript
// Prioritering:
// 1. Calcium 50-150 ppm (enzymfunktion)
// 2. SO4:Cl ratio (smakbalans)
// 3. Residual alkalinity (pH-kontroll)
// Tillåter ±10% avvikelse
// Max 4 olika salter
```

#### Minimal (minimal.ts)
```typescript
// Minsta möjliga tillsatser
// Bara kritiska joner:
// - Ca för enzymer (min 50 ppm)
// - SO4 eller Cl för smak
// Max 2-3 salter
```

#### Exact (exact.ts)
```typescript
// Försök matcha target exakt
// Använd alla tillgängliga salter
// Linear programming solver
// Varna för:
// - Omöjliga kombinationer
// - För många salter (>6)
```

## Del 4: Dataprofiler

### 4.1 Vattenprofiler (/src/profiles/water/)

#### Format (JSON):
```json
{
  "burton": {
    "name": "Burton-on-Trent",
    "country": "England",
    "calcium": 275,
    "magnesium": 40,
    "sodium": 25,
    "sulfate": 610,
    "chloride": 35,
    "bicarbonate": 270,
    "carbonate": 0,
    "ph": 7.5,
    "description": "Extremely hard water, high in sulfates",
    "history": "Made Burton IPAs famous for their dry, crisp hop character",
    "goodFor": ["IPA", "Bitter", "Pale Ale"],
    "avoidFor": ["Pilsner", "Light Lager"]
  },
  "dublin": {
    "name": "Dublin",
    "country": "Ireland",
    "calcium": 118,
    "magnesium": 4,
    "sodium": 12,
    "sulfate": 55,
    "chloride": 19,
    "bicarbonate": 160,
    "carbonate": 0,
    "ph": 7.6,
    "description": "Moderately hard with high bicarbonate",
    "history": "Perfect for dark beers like Guinness",
    "goodFor": ["Stout", "Porter", "Brown Ale"],
    "avoidFor": ["IPA", "Pilsner"]
  }
}
```

### 4.2 Stilprofiler (/src/profiles/styles/)

#### Format (JSON):
```json
{
  "american-ipa": {
    "name": "American IPA",
    "category": "Hoppy",
    "og": [1.056, 1.070],
    "fg": [1.008, 1.014],
    "ibu": [40, 70],
    "srm": [6, 14],
    "targetWater": {
      "calcium": [100, 150],
      "magnesium": [5, 15],
      "sodium": [0, 50],
      "sulfate": [200, 350],
      "chloride": [40, 70],
      "bicarbonate": [0, 50]
    },
    "sulfateChlorideRatio": [3, 5],
    "targetMashPH": [5.2, 5.4],
    "notes": {
      "water": "High sulfate for hop expression",
      "salts": "Gypsum is key, avoid sodium",
      "ph": "Lower pH enhances hop flavor"
    }
  }
}
```

## Del 5: Testning och validering

### 5.1 Enhetstester

#### PPM-beräkning:
```typescript
describe('PPM Calculations', () => {
  test('Mash volume mode matches Bru\'n Water', () => {
    // 1.5g Gypsum i 17L mäsk
    const result = calculatePPM(1.5, 232.5, {mash: 17}, 'mash')
    expect(result).toBeCloseTo(20.5, 1)  // Bru'n Water värde
  })
  
  test('Total volume mode gives lower concentration', () => {
    // 1.5g Gypsum i 32.2L total
    const result = calculatePPM(1.5, 232.5, {total: 32.2}, 'total')
    expect(result).toBeCloseTo(10.8, 1)
  })
})
```

#### pH-modeller:
```typescript
describe('pH Models', () => {
  test('Kaiser model within 0.05 of measured', () => {
    const result = kaiserModel.calculate(testData)
    expect(result).toBeCloseTo(5.35, 2)
  })
})
```

### 5.2 Integrationstester

```typescript
describe('Full calculation flow', () => {
  test('Dublin water profile optimization', () => {
    const result = await api.post('/calculate/auto', {
      sourceWater: RO_WATER,
      targetWater: DUBLIN,
      // ...
    })
    
    expect(result.achievedWater.calcium).toBeCloseTo(118, 10)
    expect(result.predictions.mashPH).toBeBetween(5.3, 5.5)
  })
})
```

## Del 6: Migration från nuvarande API

### 6.1 Fas 1: Parallell implementation
- Behåll gamla endpoints
- Implementera nya vid sidan om
- Logga skillnader för analys

### 6.2 Fas 2: Gradvis övergång
- Lägg till `X-API-Version` header
- Default till v1, opt-in till v2
- Deprecation warnings för v1

### 6.3 Fas 3: Full migration
- v2 som default
- v1 endast med explicit header
- Sunset datum för v1

## Del 7: Implementation prioritering

### Vecka 1: Kritiska bugfixar
1. **Fixa PPM-beräkning** - Implementera volumeMode
2. **Manual calculation endpoint** - Användare anger salter
3. **Grundläggande tester** - Validera mot Bru'n Water

### Vecka 2: Kärnfunktionalitet
4. **pH-modeller** - Börja med simple och kaiser
5. **Auto-calculation med volumeMode** - Mash som default
6. **Vattenprofiler** - Burton, Dublin, Pilsen

### Vecka 3: Avancerade features
7. **Staged volume mode** - För avancerade användare
8. **Optimeringsstrategier** - Balanced, minimal, exact
9. **Stilprofiler** - IPA, Stout, Pilsner

### Vecka 4: Polish och validering
10. **Validation endpoint** - Receptkontroll
11. **Advanced pH model** - Full kemisk jämvikt
12. **Omfattande testning** - Jämför med flera verktyg

## Del 8: Tekniska specifikationer

### Kemiska konstanter
```typescript
const CONSTANTS = {
  // Syrakonstanter (pKa)
  CARBONIC_ACID_PKA1: 6.35,
  CARBONIC_ACID_PKA2: 10.33,
  PHOSPHORIC_ACID_PKA2: 7.21,
  
  // Jonaktivitet
  IONIC_STRENGTH_FACTOR: 0.5,
  
  // Temperaturkorrektion
  TEMP_CORRECTION_FACTOR: 0.003,
  
  // Buffertkapacitet (mEq/kg)
  BASE_MALT_BUFFER: 35,
  CRYSTAL_MALT_BUFFER: 45,
  ROASTED_MALT_BUFFER: 70
}
```

### Saltdefinitioner (korrigerade)
```typescript
const SALTS = {
  gypsum: {
    formula: 'CaSO4·2H2O',
    molarMass: 172.17,
    ionsPPMPerGram: {
      calcium: 232.5,
      sulfate: 557.7
    }
  },
  // ... etc
}
```

## Del 9: API-dokumentation

### OpenAPI/Swagger spec
- Generera automatiskt från TypeScript
- Interaktiv dokumentation
- Exempel för varje endpoint

### Användardokumentation
- Förklaring av varje volymläge
- När ska man använda vilken pH-modell
- Best practices för olika ölstilar

## Del 10: Framtida utbyggnad

### Planerade features
- Temperaturkompensation för pH
- Jonaktivitetsberäkningar
- Historisk loggning av bryggningar
- Machine learning för optimering

### API-versionering
- Semantic versioning
- Bakåtkompatibilitet garanterad inom major version
- Changelog för alla ändringar

---

## Sammanfattning

Detta blir ett komplett, vetenskapligt korrekt och modulärt API som:
- Fixar nuvarande PPM-beräkningsproblem
- Erbjuder flera beräkningsmodeller
- Är lätt att utbygga med nya profiler
- Kan valideras mot etablerade verktyg
- Ger användaren full kontroll och flexibilitet

Nästa steg: Börja implementation enligt prioriteringslistan!