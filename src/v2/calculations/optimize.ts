import { SALTS } from '../data/salts'
import { WaterProfile, Volumes, VolumeMode } from '../types'

export type SaltAdditions = Record<string, number>

export function optimizeWaterSimple(
  source: WaterProfile,
  target: WaterProfile,
  volumes: Volumes,
  mode: VolumeMode = 'mash'
): SaltAdditions {
  const additions: SaltAdditions = {}
  const current: WaterProfile = { ...source }

  const need = (ion: keyof WaterProfile) => Math.max(0, (target as any)[ion] - (current as any)[ion] || 0)

  // Step 1: Calcium via gypsum/CaCl2 depending on SO4/Cl needs
  const caNeed = need('calcium')
  const so4Need = need('sulfate')
  const clNeed = need('chloride')

  if (caNeed > 0 && so4Need > 0) {
    const gypCaPerG = SALTS.gypsum.ionsPPMPerGram.calcium!
    const gypSo4PerG = SALTS.gypsum.ionsPPMPerGram.sulfate!
    // grams needed per liter limited by both ions
    const gpl = Math.min(caNeed / gypCaPerG, so4Need / gypSo4PerG)
    const grams = Math.max(0, gpl) * volumes.mash
    if (grams > 0.1) {
      additions.gypsum = Math.round(grams * 10) / 10
      // Update current
      const gplApplied = additions.gypsum / volumes.mash
      current.calcium += gplApplied * gypCaPerG
      current.sulfate += gplApplied * gypSo4PerG
    }
  }

  const caStill = need('calcium')
  if (caStill > 0 && clNeed > 0) {
    const cacl2CaPerG = SALTS.calcium_chloride.ionsPPMPerGram.calcium!
    const cacl2ClPerG = SALTS.calcium_chloride.ionsPPMPerGram.chloride!
    const gpl = Math.min(caStill / cacl2CaPerG, clNeed / cacl2ClPerG)
    const grams = Math.max(0, gpl) * volumes.mash
    if (grams > 0.1) {
      additions.calcium_chloride = Math.round(grams * 10) / 10
      const gplApplied = additions.calcium_chloride / volumes.mash
      current.calcium += gplApplied * cacl2CaPerG
      current.chloride += gplApplied * cacl2ClPerG
    }
  }

  // Step 2: Magnesium if needed (prefer epsom if sulfate still needed, else MgCl2 if chloride needed)
  const mgNeed = need('magnesium')
  if (mgNeed > 0) {
    if (need('sulfate') > 0 && SALTS.epsom_salt) {
      const mgPerG = SALTS.epsom_salt.ionsPPMPerGram.magnesium!
      const grams = (mgNeed / mgPerG) * volumes.mash
      if (grams > 0.1) additions.epsom_salt = Math.round(grams * 10) / 10
    } else if (need('chloride') > 0 && SALTS.magnesium_chloride) {
      const mgPerG = SALTS.magnesium_chloride.ionsPPMPerGram.magnesium!
      const grams = (mgNeed / mgPerG) * volumes.mash
      if (grams > 0.1) additions.magnesium_chloride = Math.round(grams * 10) / 10
    }
  }

  // Step 3: Bicarbonate via baking soda if significantly low
  const hco3Need = need('bicarbonate')
  if (hco3Need > 20 && SALTS.baking_soda) {
    const hco3PerG = SALTS.baking_soda.ionsPPMPerGram.bicarbonate!
    const grams = (hco3Need / hco3PerG) * volumes.mash
    if (grams > 0.1) additions.baking_soda = Math.round(grams * 10) / 10
  }

  return additions
}
