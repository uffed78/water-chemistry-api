import { WaterChemistryEngine } from './src/core/calculations'
import { CalculationRequest } from './src/core/types'

// Test med EXAKT samma salter som i bilderna (1.5g Gypsum, 0.7g CaCl2, etc)
const request: CalculationRequest = {
  sourceWater: {
    name: 'RO Water',
    calcium: 0,
    magnesium: 0,
    sodium: 0,
    sulfate: 0,
    chloride: 0,
    bicarbonate: 0,
    carbonate: 0,
    ph: 7.0
  },
  grainBill: [
    {name: "Pale Ale", amountKg: 5, color: 3, grainType: "base"}
  ],
  volumes: {
    total: 32.2,
    mash: 17.0,
    sparge: 15.2
  },
  targetMashPH: 5.4,
  // Manuellt ange exakt samma salter som i bilden
  manualAdjustments: {
    salts: {
      'gypsum': 1.5,
      'calcium_chloride': 0.7,
      'baking_soda': 1.1,
      'magnesium_chloride': 0.3
    }
  },
  units: 'metric' as const
}

const engine = new WaterChemistryEngine()
const result = engine.calculate(request)

console.log('=== MANUAL SALTS TEST ===')
console.log('\nSalts provided:')
console.log('  Gypsum: 1.5g')
console.log('  Calcium Chloride: 0.7g')
console.log('  Baking Soda: 1.1g')
console.log('  Magnesium Chloride: 0.3g')

console.log('\n=== API RESULT ===')
console.log('Ion    | API Result | Bru\'n Water | Our App (from image)')
console.log('-------|------------|-------------|--------------------')
console.log(`Ca     | ${result.achievedWater.calcium.toFixed(1).padStart(10)} | ${35} ppm      | 30.1 ppm`)
console.log(`Mg     | ${result.achievedWater.magnesium.toFixed(1).padStart(10)} | ${2} ppm       | 1.1 ppm`)
console.log(`Na     | ${result.achievedWater.sodium.toFixed(1).padStart(10)} | ${18} ppm      | 9.3 ppm`)
console.log(`SO4    | ${result.achievedWater.sulfate.toFixed(1).padStart(10)} | ${49} ppm      | 52.0 ppm`)
console.log(`Cl     | ${result.achievedWater.chloride.toFixed(1).padStart(10)} | ${32} ppm      | 18.2 ppm`)
console.log(`HCO3   | ${result.achievedWater.bicarbonate.toFixed(1).padStart(10)} | ${37} ppm      | 24.8 ppm`)

console.log('\n=== MANUAL CALCULATION ===')
// Beräkna manuellt vad det borde bli
const manualPPM = {
  Ca: (1.5/32.2 * 232.5) + (0.7/32.2 * 272),  // Gypsum + CaCl2
  Mg: (0.3/32.2 * 119.5),                      // MgCl2
  Na: (1.1/32.2 * 273.6),                      // Baking soda
  SO4: (1.5/32.2 * 557.7),                     // Gypsum
  Cl: (0.7/32.2 * 482) + (0.3/32.2 * 348.5),  // CaCl2 + MgCl2
  HCO3: (1.1/32.2 * 726.4)                     // Baking soda
}

console.log('What it SHOULD be (our formula):')
for (const [ion, ppm] of Object.entries(manualPPM)) {
  console.log(`  ${ion}: ${ppm.toFixed(1)} ppm`)
}

console.log('\n=== BRU\'N WATER ANALYSIS ===')
console.log('Bru\'n Water shows higher values, especially for:')
console.log('  Ca: 35 vs our 16.7 (factor 2.1x)')
console.log('  Na: 18 vs our 9.3 (factor 1.9x)')
console.log('  SO4: 49 vs our 26.0 (factor 1.9x)')
console.log('  Cl: 32 vs our 13.7 (factor 2.3x)')
console.log('  HCO3: 37 vs our 24.8 (factor 1.5x)')
console.log('\nAverage factor: ~2x')
console.log('This suggests Bru\'n Water might be using MASH volume (17L) for concentration!')
console.log('32.2 / 17 = 1.89x')

// Test med mash-volym
console.log('\n=== IF USING MASH VOLUME (17L) ===')
const mashPPM = {
  Ca: (1.5/17 * 232.5) + (0.7/17 * 272),
  Mg: (0.3/17 * 119.5),
  Na: (1.1/17 * 273.6),
  SO4: (1.5/17 * 557.7),
  Cl: (0.7/17 * 482) + (0.3/17 * 348.5),
  HCO3: (1.1/17 * 726.4)
}

console.log('PPM if calculated with mash volume:')
for (const [ion, ppm] of Object.entries(mashPPM)) {
  console.log(`  ${ion}: ${ppm.toFixed(1)} ppm`)
}

console.log('\nThis matches Bru\'n Water much better!')