# Water Chemistry API

A precision brewing water chemistry calculation API designed to match Bru'n Water's accuracy. This standalone API provides comprehensive water chemistry calculations for brewing applications.

## 🎯 Features

- **Precise Salt Calculations** - All 8 major brewing salts with accurate ion contributions
- **Standard Water Profiles** - Famous brewing city water profiles (Pilsen, Burton, Dublin, etc.)
- **Mash pH Prediction** - Estimates mash pH based on water chemistry and grain bill
- **Residual Alkalinity** - Calculates RA and other brewing-relevant metrics
- **CORS-Enabled** - Ready for frontend integration
- **TypeScript** - Fully typed for better development experience

## 🏗️ Project Structure

```
water-chemistry-api/
├── api/                    # Vercel serverless functions
│   ├── calculate.ts        # POST /api/calculate
│   ├── profiles.ts         # GET /api/profiles
│   └── salts.ts           # GET /api/salts
├── src/
│   ├── core/              # Core calculation logic
│   │   ├── types.ts       # TypeScript interfaces
│   │   ├── calculations.ts # Main calculation engine
│   │   └── salts.ts       # Salt definitions & properties
│   └── data/              # Static data
│       └── standard-profiles.ts # Famous water profiles
└── dist/                  # Compiled JavaScript
```

## 🚀 Quick Start

### Installation

```bash
# Clone and setup
git clone <repo-url>
cd water-chemistry-api
npm install

# Build TypeScript
npm run build

# Test locally
node test-local.js
```

### Development

```bash
# Start local development (requires Vercel CLI login)
vercel login
npm run dev

# Or test core functionality directly
npm run build
node test-local.js
```

## 🔧 API Endpoints

### GET /api/salts

Returns all available brewing salts with their chemical properties.

**Response:**
```json
{
  "gypsum": {
    "id": "gypsum",
    "name": "Gypsum",
    "formula": "CaSO₄·2H₂O",
    "molarMass": 172.17,
    "ionsPPMPerGram": {
      "calcium": 232.5,
      "sulfate": 557.7
    }
  }
}
```

### GET /api/profiles

Returns standard brewing water profiles.

**Response:**
```json
[
  {
    "id": "pilsen",
    "name": "Pilsen",
    "calcium": 7,
    "magnesium": 2,
    "sulfate": 5,
    "chloride": 5,
    "bicarbonate": 35,
    "ph": 7.0
  }
]
```

### POST /api/calculate

Performs water chemistry calculations.

**Request:**
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
    {
      "name": "Pilsner Malt",
      "amountKg": 5,
      "color": 2,
      "grainType": "base"
    }
  ],
  "volumes": {
    "total": 30,
    "mash": 15,
    "sparge": 15
  },
  "units": "metric"
}
```

**Response:**
```json
{
  "success": true,
  "sourceWater": { ... },
  "achievedWater": { ... },
  "adjustments": {
    "salts": [
      {
        "id": "gypsum",
        "name": "Gypsum",
        "amount": 2.0,
        "unit": "g"
      }
    ],
    "acids": []
  },
  "predictions": {
    "mashPH": 5.52,
    "finalPH": 5.42,
    "residualAlkalinity": 85.7,
    "sulfateChlorideRatio": 2.0,
    "effectiveHardness": 54.0
  },
  "warnings": [],
  "recommendations": []
}
```

## 🧪 Testing

Test the calculation engine locally:

```bash
npm run build
node test-local.js      # Test calculations
node test-salts.js      # Test salt definitions  
node test-profiles.js   # Test water profiles
```

Example calculation test:
```javascript
const { WaterChemistryEngine } = require('./dist/src/core/calculations')

const engine = new WaterChemistryEngine()
const result = engine.calculate({
  sourceWater: { /* water profile */ },
  grainBill: [ /* grain bill */ ],
  volumes: { total: 30, mash: 15, sparge: 15 },
  units: 'metric'
})

console.log('Predicted mash pH:', result.predictions.mashPH)
```

## 🚀 Deployment

Deploy to Vercel:

```bash
# Login and deploy
vercel login
npm run deploy

# Your API will be available at:
# https://water-chemistry-api.vercel.app
```

Test deployed API:
```bash
# Test salts endpoint
curl https://water-chemistry-api.vercel.app/api/salts

# Test calculation endpoint
curl -X POST https://water-chemistry-api.vercel.app/api/calculate \
  -H "Content-Type: application/json" \
  -d '{"sourceWater": {...}, "grainBill": [...], "volumes": {...}}'
```

## 🧮 Supported Salts

- **Gypsum** (CaSO₄·2H₂O) - Adds calcium and sulfate
- **Calcium Chloride** (CaCl₂·2H₂O) - Adds calcium and chloride  
- **Epsom Salt** (MgSO₄·7H₂O) - Adds magnesium and sulfate
- **Magnesium Chloride** (MgCl₂·6H₂O) - Adds magnesium and chloride
- **Table Salt** (NaCl) - Adds sodium and chloride
- **Baking Soda** (NaHCO₃) - Adds sodium and bicarbonate
- **Chalk** (CaCO₃) - Adds calcium and bicarbonate (limited solubility)
- **Pickling Lime** (Ca(OH)₂) - Adds calcium and hydroxide

## 🏛️ Water Profiles

Classic brewing city profiles included:
- **Pilsen** - Soft water, perfect for light lagers
- **Burton on Trent** - High sulfate, ideal for IPAs  
- **Dublin** - Moderate bicarbonate, great for stouts
- **London** - Balanced profile for English ales
- **Munich** - Low mineral, perfect for malty lagers
- **Vienna** - Moderate hardness for amber lagers

## 🔬 Calculations

Current implementation includes:
- Ion balance calculations from salt additions
- Basic mash pH estimation  
- Residual alkalinity calculation
- Sulfate/chloride ratio analysis
- Effective water hardness

### Next Steps for Enhanced Accuracy

1. **Advanced Mash pH Modeling** - Implement Bru'n Water's precise algorithms
2. **Grain Database** - Add detailed grain acidification data
3. **Advanced Acid Calculations** - Support multiple acid types
4. **Water Analysis Validation** - Ion balance checking
5. **Style Guidelines** - Target ranges for different beer styles

## 🔗 Integration

Use in your brewing application:

```typescript
const response = await fetch('https://water-chemistry-api.vercel.app/api/calculate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sourceWater: myWaterProfile,
    grainBill: myGrainBill, 
    volumes: myVolumes,
    units: 'metric'
  })
})

const result = await response.json()
console.log('Add to your water:', result.adjustments.salts)
```

## 📝 License

ISC License

---

**Note:** This is the foundational implementation. The calculation algorithms will be enhanced to match Bru'n Water's precision in future updates.