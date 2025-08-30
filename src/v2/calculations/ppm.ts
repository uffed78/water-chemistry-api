import { SALTS, SaltDefinition } from '../data/salts'
import { WaterProfile, Volumes, VolumeMode } from '../types'

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
  location?: 'mash' | 'sparge' | 'boil'
): WaterProfile {
  const ions = salt.ionsPPMPerGram
  return {
    calcium: ions.calcium ? calculatePPM(grams, ions.calcium, volumes, mode, location) : 0,
    magnesium: ions.magnesium ? calculatePPM(grams, ions.magnesium, volumes, mode, location) : 0,
    sodium: ions.sodium ? calculatePPM(grams, ions.sodium, volumes, mode, location) : 0,
    sulfate: ions.sulfate ? calculatePPM(grams, ions.sulfate, volumes, mode, location) : 0,
    chloride: ions.chloride ? calculatePPM(grams, ions.chloride, volumes, mode, location) : 0,
    bicarbonate: ions.bicarbonate ? calculatePPM(grams, ions.bicarbonate, volumes, mode, location) : 0,
    carbonate: ions.carbonate ? calculatePPM(grams, ions.carbonate, volumes, mode, location) : 0,
    ph: undefined,
    alkalinity: undefined
  }
}

// expose SALTS via v2/data
