import { WaterChemistryEngine } from './src/core/calculations'
import { CalculationRequest } from './src/core/types'
import { SALT_DEFINITIONS } from './src/core/salts'

// EXAKT samma input som från bilderna
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
  targetWater: {
    name: 'Dublin',
    calcium: 118,
    magnesium: 4,
    sodium: 12,
    sulfate: 55,
    chloride: 19,
    bicarbonate: 160,
    carbonate: 0,
    ph: 7.5
  },
  grainBill: [
    {name: "Pale Ale", amountKg: 5, color: 3, grainType: "base"}
  ],
  volumes: {
    total: 32.2,   // Total water
    mash: 17.0,    // Från Bru'n Water bilden
    sparge: 15.2   // Från Bru'n Water bilden
  },
  targetMashPH: 5.4,
  units: 'metric' as const
}

console.log('=== DEBUG PPM CALCULATION ===')
console.log('\nVolumes:')
console.log(`  Total: ${request.volumes.total}L`)
console.log(`  Mash: ${request.volumes.mash}L`)
console.log(`  Sparge: ${request.volumes.sparge}L`)

// Kör beräkningen
const engine = new WaterChemistryEngine()
const result = engine.calculate(request)

console.log('\n=== SALTS FROM API ===')
for (const salt of result.adjustments.salts) {
  console.log(`${salt.name}: ${salt.amount}g`)
}

// Manuell beräkning av vad dessa salter BORDE ge
console.log('\n=== MANUAL PPM CALCULATION ===')
console.log('Using TOTAL volume:', request.volumes.total, 'L')

let manualCalc = {
  calcium: 0,
  magnesium: 0,
  sodium: 0,
  sulfate: 0,
  chloride: 0,
  bicarbonate: 0
}

for (const salt of result.adjustments.salts) {
  const saltDef = SALT_DEFINITIONS[salt.id]
  if (!saltDef) continue
  
  const ppmPerGram = saltDef.ionsPPMPerGram
  const gramsPerLiter = salt.amount / request.volumes.total
  
  console.log(`\n${salt.name} (${salt.amount}g):`)
  console.log(`  Grams per liter: ${gramsPerLiter.toFixed(4)}`)
  
  if (ppmPerGram.calcium) {
    const ppm = ppmPerGram.calcium * gramsPerLiter
    manualCalc.calcium += ppm
    console.log(`  Ca: ${ppmPerGram.calcium} × ${gramsPerLiter.toFixed(4)} = ${ppm.toFixed(2)} ppm`)
  }
  if (ppmPerGram.magnesium) {
    const ppm = ppmPerGram.magnesium * gramsPerLiter
    manualCalc.magnesium += ppm
    console.log(`  Mg: ${ppmPerGram.magnesium} × ${gramsPerLiter.toFixed(4)} = ${ppm.toFixed(2)} ppm`)
  }
  if (ppmPerGram.sodium) {
    const ppm = ppmPerGram.sodium * gramsPerLiter
    manualCalc.sodium += ppm
    console.log(`  Na: ${ppmPerGram.sodium} × ${gramsPerLiter.toFixed(4)} = ${ppm.toFixed(2)} ppm`)
  }
  if (ppmPerGram.sulfate) {
    const ppm = ppmPerGram.sulfate * gramsPerLiter
    manualCalc.sulfate += ppm
    console.log(`  SO4: ${ppmPerGram.sulfate} × ${gramsPerLiter.toFixed(4)} = ${ppm.toFixed(2)} ppm`)
  }
  if (ppmPerGram.chloride) {
    const ppm = ppmPerGram.chloride * gramsPerLiter
    manualCalc.chloride += ppm
    console.log(`  Cl: ${ppmPerGram.chloride} × ${gramsPerLiter.toFixed(4)} = ${ppm.toFixed(2)} ppm`)
  }
  if (ppmPerGram.bicarbonate) {
    const ppm = ppmPerGram.bicarbonate * gramsPerLiter
    manualCalc.bicarbonate += ppm
    console.log(`  HCO3: ${ppmPerGram.bicarbonate} × ${gramsPerLiter.toFixed(4)} = ${ppm.toFixed(2)} ppm`)
  }
}

console.log('\n=== COMPARISON ===')
console.log('Ion    | Manual Calc | API Result | Factor | Bru\'n Water')
console.log('-------|-------------|------------|--------|-------------')
console.log(`Ca     | ${manualCalc.calcium.toFixed(1).padStart(11)} | ${result.achievedWater.calcium.toFixed(1).padStart(10)} | ${(result.achievedWater.calcium / manualCalc.calcium).toFixed(2).padStart(6)} | 35`)
console.log(`Mg     | ${manualCalc.magnesium.toFixed(1).padStart(11)} | ${result.achievedWater.magnesium.toFixed(1).padStart(10)} | ${(result.achievedWater.magnesium / manualCalc.magnesium).toFixed(2).padStart(6)} | 2`)
console.log(`Na     | ${manualCalc.sodium.toFixed(1).padStart(11)} | ${result.achievedWater.sodium.toFixed(1).padStart(10)} | ${(result.achievedWater.sodium / manualCalc.sodium).toFixed(2).padStart(6)} | 18`)
console.log(`SO4    | ${manualCalc.sulfate.toFixed(1).padStart(11)} | ${result.achievedWater.sulfate.toFixed(1).padStart(10)} | ${(result.achievedWater.sulfate / manualCalc.sulfate).toFixed(2).padStart(6)} | 49`)
console.log(`Cl     | ${manualCalc.chloride.toFixed(1).padStart(11)} | ${result.achievedWater.chloride.toFixed(1).padStart(10)} | ${(result.achievedWater.chloride / manualCalc.chloride).toFixed(2).padStart(6)} | 32`)
console.log(`HCO3   | ${manualCalc.bicarbonate.toFixed(1).padStart(11)} | ${result.achievedWater.bicarbonate.toFixed(1).padStart(10)} | ${(result.achievedWater.bicarbonate / manualCalc.bicarbonate).toFixed(2).padStart(6)} | 37`)

console.log('\n=== HYPOTHESIS ===')
const avgFactor = (result.achievedWater.calcium / manualCalc.calcium + 
                   result.achievedWater.sulfate / manualCalc.sulfate) / 2
console.log(`Average factor for Ca and SO4: ${avgFactor.toFixed(2)}`)

if (Math.abs(avgFactor - 2.0) < 0.1) {
  console.log('❌ PROBLEM: Values are ~2x too high!')
  console.log('Possible cause: Using mash volume instead of total?')
  console.log(`Total/Mash ratio: ${(request.volumes.total / request.volumes.mash).toFixed(2)}`)
} else if (Math.abs(avgFactor - (request.volumes.total / request.volumes.mash)) < 0.1) {
  console.log('❌ CONFIRMED: Using mash volume instead of total volume!')
}

// Test om split-funktionen påverkar
console.log('\n=== SPLIT ADJUSTMENTS ===')
if (result.adjustments.mash) {
  console.log('Mash salts:')
  for (const salt of result.adjustments.mash.salts) {
    console.log(`  ${salt.name}: ${salt.amount}g`)
  }
}
if (result.adjustments.boil) {
  console.log('Boil salts:')
  for (const salt of result.adjustments.boil.salts) {
    console.log(`  ${salt.name}: ${salt.amount}g`)
  }
}