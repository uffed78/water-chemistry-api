import { SALTS, SaltDefinition } from '../data/salts'
import { WaterProfile, Volumes, VolumeMode } from '../types'
import { calculateSaltContribution } from './ppm'

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

// Balanced optimizer with per-gram contributions and light iteration
export interface BalancedOptions {
  maxSalts?: number
  allowedSalts?: string[]
  tolerancePPM?: number
  assumeCarbonateDissolution?: boolean
}

type IonKey = keyof Pick<WaterProfile, 'calcium' | 'magnesium' | 'sodium' | 'sulfate' | 'chloride' | 'bicarbonate'>
const IONS: IonKey[] = ['calcium', 'magnesium', 'sodium', 'sulfate', 'chloride', 'bicarbonate']

export function optimizeWaterBalanced(
  source: WaterProfile,
  target: WaterProfile,
  volumes: Volumes,
  mode: VolumeMode = 'mash',
  opts: BalancedOptions = {}
): SaltAdditions {
  const {
    maxSalts = 5,
    allowedSalts = [
      'gypsum',
      'calcium_chloride',
      'epsom_salt',
      'magnesium_chloride',
      'sodium_chloride',
      'baking_soda',
      'calcium_carbonate',
      'calcium_hydroxide'
    ],
    tolerancePPM = 120,
    assumeCarbonateDissolution = true
  } = opts

  // Per-gram contributions using current PPM logic
  const perGram: Record<string, WaterProfile> = {}
  for (const saltName of allowedSalts) {
    const salt = (SALTS as any)[saltName] as SaltDefinition | undefined
    if (!salt) continue
    perGram[saltName] = calculateSaltContribution(
      salt,
      1,
      volumes,
      mode,
      'mash',
      { assumeCarbonateDissolution }
    )
  }

  const clone = (w: WaterProfile): WaterProfile => ({ ...w })
  const current = clone(source)
  const additions: SaltAdditions = {}

  const totalDeviation = (w: WaterProfile) =>
    IONS.reduce((s, ion) => s + Math.abs((w as any)[ion] - (target as any)[ion]), 0)

  const applySalt = (w: WaterProfile, saltName: string, grams: number) => {
    const contrib = perGram[saltName]
    if (!contrib || grams <= 0) return
    IONS.forEach((ion) => {
      ;(w as any)[ion] += (contrib as any)[ion] * grams
    })
  }

  const bestImmediateAmount = (saltName: string, w: WaterProfile) => {
    const contrib = perGram[saltName]
    if (!contrib) return 0
    let max = Infinity
    IONS.forEach((ion) => {
      const needed = (target as any)[ion] - (w as any)[ion]
      const perG = (contrib as any)[ion]
      if (needed > 0 && perG > 0) {
        max = Math.min(max, needed / perG)
      }
    })
    if (!isFinite(max) || max <= 0) return 0
    return Math.max(0, Math.min(max * 0.8, 10))
  }

  for (let used = 0; used < maxSalts; used++) {
    let bestSalt: string | null = null
    let bestGrams = 0
    let bestScore = totalDeviation(current)

    for (const saltName of Object.keys(perGram)) {
      const grams = bestImmediateAmount(saltName, current)
      if (grams <= 0) continue
      const test = clone(current)
      applySalt(test, saltName, grams)
      const score = totalDeviation(test)
      if (score + 1e-6 < bestScore) {
        bestScore = score
        bestSalt = saltName
        bestGrams = grams
      }
    }

    if (!bestSalt || bestGrams <= 0) break

    additions[bestSalt] = Math.round(((additions[bestSalt] || 0) + bestGrams) * 10) / 10
    applySalt(current, bestSalt, bestGrams)

    if (totalDeviation(current) <= tolerancePPM) break
  }

  const steps = [0.5, 0.2, 0.1]
  for (const step of steps) {
    let improved = false
    for (const saltName of Object.keys(additions)) {
      const tryAdjust = (delta: number) => {
        const test = clone(current)
        applySalt(test, saltName, delta)
        const score = totalDeviation(test)
        const baseline = totalDeviation(current)
        if (score + 1e-6 < baseline) {
          additions[saltName] = Math.round((additions[saltName] + delta) * 10) / 10
          applySalt(current, saltName, delta)
          return true
        }
        return false
      }
      if (tryAdjust(step)) { improved = true; continue }
      if (additions[saltName] > step && tryAdjust(-step)) { improved = true }
    }
    if (!improved || totalDeviation(current) <= tolerancePPM) break
  }

  for (const k of Object.keys(additions)) {
    if (additions[k] < 0.1) delete additions[k]
  }

  return additions
}

// -------------------- Exact Optimizer (v2) --------------------
export interface ExactOptions {
  allowedSalts?: string[]
  tolerancePPM?: number
  maxIterations?: number
  maxSaltAmount?: number // max grams per salt
  assumeCarbonateDissolution?: boolean
}

export function optimizeWaterExact(
  source: WaterProfile,
  target: WaterProfile,
  volumes: Volumes,
  mode: VolumeMode = 'mash',
  opts: ExactOptions = {}
): SaltAdditions {
  const {
    allowedSalts = [
      'gypsum',
      'calcium_chloride',
      'epsom_salt',
      'magnesium_chloride',
      'sodium_chloride',
      'baking_soda',
      'calcium_carbonate',
      'calcium_hydroxide'
    ],
    tolerancePPM = 60, // tighter than balanced
    maxIterations = 150,
    maxSaltAmount = 12,
    assumeCarbonateDissolution = true
  } = opts

  // Precompute 1 g contributions for each allowed salt
  const perGram: Record<string, WaterProfile> = {}
  for (const name of allowedSalts) {
    const salt = (SALTS as any)[name] as SaltDefinition | undefined
    if (!salt) continue
    perGram[name] = calculateSaltContribution(
      salt,
      1,
      volumes,
      mode,
      'mash',
      { assumeCarbonateDissolution }
    )
  }

  const current: WaterProfile = { ...source }
  const additions: SaltAdditions = {}

  const deviation = (w: WaterProfile) => IONS.reduce((s, k) => s + Math.abs((w as any)[k] - (target as any)[k]), 0)
  const baseDev = deviation(current)
  if (baseDev <= tolerancePPM) return {}

  const apply = (w: WaterProfile, salt: string, grams: number) => {
    const contrib = perGram[salt]
    if (!contrib) return
    IONS.forEach((ion) => {
      ;(w as any)[ion] += (contrib as any)[ion] * grams
    })
  }

  // Initial guess: for each salt, compute limiting ion grams and take 50%
  for (const salt of Object.keys(perGram)) {
    const contrib = perGram[salt]
    let max = Infinity
    IONS.forEach((ion) => {
      const need = (target as any)[ion] - (current as any)[ion]
      const perG = (contrib as any)[ion]
      if (need > 0 && perG > 0) max = Math.min(max, need / perG)
    })
    if (max > 0 && isFinite(max)) {
      const g = Math.min(max * 0.5, maxSaltAmount)
      if (g > 0.05) {
        additions[salt] = Math.round(g * 10) / 10
        apply(current, salt, additions[salt])
      }
    }
  }

  // Iterative refinement with decreasing step sizes
  const steps = [1.0, 0.5, 0.2, 0.1]
  let iters = 0
  for (const step of steps) {
    for (let i = 0; i < Math.ceil(maxIterations / steps.length); i++) {
      iters++
      let improved = false

      for (const salt of Object.keys(perGram)) {
        const tryDelta = (delta: number) => {
          const test: WaterProfile = { ...current }
          const newAmount = Math.max(0, (additions[salt] || 0) + delta)
          if (newAmount > maxSaltAmount) return false
          apply(test, salt, delta)
          const s = deviation(test)
          const b = deviation(current)
          if (s + 1e-6 < b) {
            additions[salt] = Math.round(newAmount * 10) / 10
            Object.assign(current, test)
            return true
          }
          return false
        }

        if (tryDelta(step)) { improved = true; continue }
        if ((additions[salt] || 0) > step && tryDelta(-step)) improved = true
      }

      if (!improved || deviation(current) <= tolerancePPM) break
    }
    if (deviation(current) <= tolerancePPM) break
  }

  // Clean small entries
  for (const k of Object.keys(additions)) {
    if (additions[k] < 0.1) delete additions[k]
  }

  return additions
}
