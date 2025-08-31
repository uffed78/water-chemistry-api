import { SALTS, SaltDefinition } from '../data/salts'
import { WaterProfile, Volumes, VolumeMode } from '../types'

// Molar masses (g/mol) for conversion logic
const MOLAR_MASS = {
  HCO3: 61.016, // bicarbonate
  CO3: 60.009,  // carbonate
  CaOH2: 74.093 // calcium hydroxide
}

export function calculatePPM(
  saltGrams: number,
  ionsPPMPerGram: number,
  volumes: Partial<Volumes> & { total?: number; mash?: number; sparge?: number },
  mode: VolumeMode = 'mash',
  location?: 'mash' | 'sparge' | 'boil'
): number {
  let effectiveVolume = 0
  switch (mode) {
    case 'mash':
      effectiveVolume = volumes.mash ?? volumes.total ?? 0
      break
    case 'staged':
      if (location === 'mash') effectiveVolume = volumes.mash ?? 0
      else if (location === 'sparge') effectiveVolume = volumes.sparge ?? 0
      else effectiveVolume = volumes.total ?? 0
      break
    default:
      effectiveVolume = volumes.total ?? 0
  }
  if (!effectiveVolume || !ionsPPMPerGram || !saltGrams) return 0
  return (saltGrams / effectiveVolume) * ionsPPMPerGram
}

export function calculateSaltContribution(
  salt: SaltDefinition,
  grams: number,
  volumes: Volumes,
  mode: VolumeMode = 'mash',
  location?: 'mash' | 'sparge' | 'boil',
  options: { assumeCarbonateDissolution?: boolean } = { assumeCarbonateDissolution: true }
): WaterProfile {
  const ions = salt.ionsPPMPerGram
  // Base ion contributions
  const calcium = ions.calcium ? calculatePPM(grams, ions.calcium, volumes, mode, location) : 0
  const magnesium = ions.magnesium ? calculatePPM(grams, ions.magnesium, volumes, mode, location) : 0
  const sodium = ions.sodium ? calculatePPM(grams, ions.sodium, volumes, mode, location) : 0
  const sulfate = ions.sulfate ? calculatePPM(grams, ions.sulfate, volumes, mode, location) : 0
  const chloride = ions.chloride ? calculatePPM(grams, ions.chloride, volumes, mode, location) : 0

  // Direct bicarbonate from salts that provide it (e.g., NaHCO3)
  let bicarbonate = ions.bicarbonate ? calculatePPM(grams, ions.bicarbonate, volumes, mode, location) : 0

  // If a salt provides carbonate (e.g., CaCO3) and we assume dissolution,
  // convert carbonate to bicarbonate using stoichiometric mass ratio.
  // 1 mol CO3(2-) -> 1 mol HCO3(-) at mash conditions (with available H+).
  const carbonatePPM = ions.carbonate ? calculatePPM(grams, ions.carbonate, volumes, mode, location) : 0
  let carbonate: number | undefined = undefined
  if (carbonatePPM) {
    if (options.assumeCarbonateDissolution) {
      const ratio = MOLAR_MASS.HCO3 / MOLAR_MASS.CO3 // ≈1.0168
      bicarbonate += carbonatePPM * ratio
      carbonate = 0 // treat as converted
    } else {
      carbonate = carbonatePPM
    }
  }

  // Special case: Pickling lime (Ca(OH)2) contributes alkalinity after reacting with CO2.
  // Assume full conversion to bicarbonate: Ca(OH)2 + 2 CO2 -> Ca(HCO3)2
  // Per gram Ca(OH)2, bicarbonate produced at 1 L is:
  // (2 * M(HCO3) / M(Ca(OH)2)) g/L ≈ 1.646 g/L = 1646 ppm
  if (options.assumeCarbonateDissolution && /Ca\(OH\)2/.test(salt.formula)) {
    const bicarbPerGram = (2 * MOLAR_MASS.HCO3 / MOLAR_MASS.CaOH2) * 1000 // mg/L per gram
    bicarbonate += calculatePPM(grams, bicarbPerGram, volumes, mode, location)
  }

  return {
    calcium,
    magnesium,
    sodium,
    sulfate,
    chloride,
    bicarbonate,
    carbonate,
    ph: undefined,
    alkalinity: undefined
  }
}

// expose SALTS via v2/data
