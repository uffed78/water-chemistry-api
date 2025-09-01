import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SALTS } from '../src/v2/data/salts'
import type { VolumeMode, WaterProfile, Volumes, GrainBillItem } from '../src/v2/types'
import { calculateSaltContribution } from '../src/v2/calculations/ppm'
import { optimizeWaterSimple, optimizeWaterBalanced, optimizeWaterExact } from '../src/v2/calculations/optimize'
import { calculateMashPH_Simple, calculateMashPH_Kaiser } from '../src/v2/calculations/ph'

type Mode = 'manual' | 'auto'

// --- Helpers for acid handling (simple, robust approximations) ---
// mEq per ml for common acids at standard concentrations
const MEQ_PER_ML: Record<string, number> = {
  lactic_88: 11.8,
  phosphoric_85: 25.6,
}

function estimateHCO3ReductionFromAcids(acids: Record<string, number> | undefined, mashVolumeL: number): number {
  if (!acids || mashVolumeL <= 0) return 0
  let mEqTotal = 0
  for (const [k, v] of Object.entries(acids)) {
    if (!v) continue
    const key = k as keyof typeof MEQ_PER_ML
    const factor = MEQ_PER_ML[key]
    if (factor) mEqTotal += v * factor // ml * (mEq/ml)
  }
  const mEqPerL = mEqTotal / mashVolumeL
  // 1 mEq/L ≈ 50 ppm as CaCO3; convert to HCO3⁻ as 61/50
  const hco3Drop = mEqPerL * 61
  return hco3Drop
}

function recommendAcidsForTarget(currentPH: number, targetPH: number, bicarbonatePPM: number, mashVolumeL: number) {
  if (!(targetPH < currentPH)) return { lactic_88: 0, phosphoric_85: 0, estimatedHCO3Drop: 0 }
  const alkalinityCaCO3 = bicarbonatePPM * 50 / 61
  const phDrop = currentPH - targetPH
  // Approximate mEq needed considering alkalinity + pH drop demand (simple model)
  const mEqNeeded = (alkalinityCaCO3 * 0.02 + phDrop * 50) * mashVolumeL
  const lactic_88 = mEqNeeded / MEQ_PER_ML.lactic_88
  const estimatedHCO3Drop = (mEqNeeded / mashVolumeL) * 61
  return { lactic_88, phosphoric_85: 0, estimatedHCO3Drop }
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const {
      sourceWater,
      targetWater,
      grainBill,
      volumes,
      mode = 'manual',
      volumeMode = 'mash',
      additions,
      targetMashPH,
      assumeCarbonateDissolution
    } = req.body as {
      sourceWater: WaterProfile
      targetWater?: WaterProfile
      grainBill: GrainBillItem[]
      volumes: Volumes
      mode?: Mode
      volumeMode?: VolumeMode
      additions?: { salts: Record<string, number>; acids?: Record<string, number> }
      phModel?: 'simple' | 'kaiser'
      assumeCarbonateDissolution?: boolean
      optimization?: 'simple' | 'balanced' | 'exact'
      targetMashPH?: number
    }

    if (!sourceWater || !grainBill || !volumes) {
      return res.status(400).json({ error: 'Missing required fields: sourceWater, grainBill, volumes' })
    }

    if (mode === 'manual') {
      if (!additions?.salts) return res.status(400).json({ error: 'Missing additions.salts for manual mode' })

      const achieved: WaterProfile = { ...sourceWater }
      for (const [saltId, grams] of Object.entries(additions.salts)) {
        const salt = (SALTS as any)[saltId]
        if (!salt || !grams) continue
        const c = calculateSaltContribution(salt, grams, volumes, volumeMode, undefined, { assumeCarbonateDissolution })
        achieved.calcium += c.calcium
        achieved.magnesium += c.magnesium
        achieved.sodium += c.sodium
        achieved.sulfate += c.sulfate
        achieved.chloride += c.chloride
        achieved.bicarbonate += c.bicarbonate
      }

      const phModel = (req.body?.phModel as 'simple' | 'kaiser') || 'simple'
      const mashThickness = (() => {
        const totalGrainKg = Math.max(0.0001, grainBill.reduce((s, g) => s + g.weight, 0))
        return Math.max(0.1, volumes.mash / totalGrainKg)
      })()
      const beforeAcidPH = phModel === 'kaiser'
        ? calculateMashPH_Kaiser(achieved, grainBill, mashThickness, 65)
        : calculateMashPH_Simple(
            achieved,
            grainBill.map(g => ({ color: g.color, weight: g.weight })),
            volumes
          )

      // Apply manual acids if provided
      let finalWater: WaterProfile = { ...achieved }
      let appliedAcids: Record<string, number> | undefined = undefined
      if (additions.acids && Object.keys(additions.acids).length > 0) {
        const drop = estimateHCO3ReductionFromAcids(additions.acids, volumes.mash)
        finalWater.bicarbonate = Math.max(0, finalWater.bicarbonate - drop)
        appliedAcids = additions.acids
      }

      // If targetMashPH is provided and no manual acids, recommend simple lactic dose
      let suggestedAcids: Record<string, number> | undefined
      if ((!appliedAcids || Object.keys(appliedAcids).length === 0) && typeof targetMashPH === 'number') {
        const rec = recommendAcidsForTarget(beforeAcidPH, targetMashPH, finalWater.bicarbonate, volumes.mash)
        if (rec.lactic_88 > 0) {
          const drop = rec.estimatedHCO3Drop
          finalWater.bicarbonate = Math.max(0, finalWater.bicarbonate - drop)
          suggestedAcids = { lactic_88: Math.round(rec.lactic_88 * 10) / 10 }
        }
      }

      const mashPH = phModel === 'kaiser'
        ? calculateMashPH_Kaiser(finalWater, grainBill, mashThickness, 65)
        : calculateMashPH_Simple(
            finalWater,
            grainBill.map(g => ({ color: g.color, weight: g.weight })),
            volumes
          )

      return res.status(200).json({
        achieved: finalWater,
        predictions: { mashPH, beforeAcidPH },
        suggestedAcids,
        volumeMode,
        volumeUsed: volumeMode === 'mash' ? volumes.mash : volumeMode === 'total' ? volumes.total : undefined
      })
    }

    // Auto mode
    if (!targetWater) return res.status(400).json({ error: 'Missing targetWater for auto mode' })

    const optimization = (req.body?.optimization as 'simple' | 'balanced' | 'exact') || 'simple'
    const salts = optimization === 'balanced'
      ? optimizeWaterBalanced(sourceWater, targetWater, volumes, volumeMode, { assumeCarbonateDissolution })
      : optimization === 'exact'
        ? optimizeWaterExact(sourceWater, targetWater, volumes, volumeMode, { assumeCarbonateDissolution })
        : optimizeWaterSimple(sourceWater, targetWater, volumes, volumeMode)
    const achieved: WaterProfile = { ...sourceWater }
    for (const [saltId, grams] of Object.entries(salts)) {
      const salt = (SALTS as any)[saltId]
      if (!salt || !grams) continue
      const c = calculateSaltContribution(salt, grams, volumes, volumeMode, undefined, { assumeCarbonateDissolution })
      achieved.calcium += c.calcium
      achieved.magnesium += c.magnesium
      achieved.sodium += c.sodium
      achieved.sulfate += c.sulfate
      achieved.chloride += c.chloride
      achieved.bicarbonate += c.bicarbonate
    }

    const phModel = (req.body?.phModel as 'simple' | 'kaiser') || 'simple'
    const totalGrainKg = Math.max(0.0001, grainBill.reduce((s, g) => s + g.weight, 0))
    const mashThickness = Math.max(0.1, volumes.mash / totalGrainKg)
    const beforeAcidPH = phModel === 'kaiser'
      ? calculateMashPH_Kaiser(achieved, grainBill, mashThickness, 65)
      : calculateMashPH_Simple(
          achieved,
          grainBill.map(g => ({ color: g.color, weight: g.weight })),
          volumes
        )

    // Optional auto acid suggestion if user supplies targetMashPH
    let finalWater: WaterProfile = { ...achieved }
    let suggestedAcids: Record<string, number> | undefined
    if (typeof targetMashPH === 'number' && beforeAcidPH > targetMashPH) {
      const rec = recommendAcidsForTarget(beforeAcidPH, targetMashPH, finalWater.bicarbonate, volumes.mash)
      if (rec.lactic_88 > 0) {
        const drop = rec.estimatedHCO3Drop
        finalWater.bicarbonate = Math.max(0, finalWater.bicarbonate - drop)
        suggestedAcids = { lactic_88: Math.round(rec.lactic_88 * 10) / 10 }
      }
    }

    const mashPH = phModel === 'kaiser'
      ? calculateMashPH_Kaiser(finalWater, grainBill, mashThickness, 65)
      : calculateMashPH_Simple(
          finalWater,
          grainBill.map(g => ({ color: g.color, weight: g.weight })),
          volumes
        )

    return res.status(200).json({ additions: salts, achieved: finalWater, suggestedAcids, predictions: { mashPH, beforeAcidPH }, volumeMode })
  } catch (error) {
    console.error('Calculation error:', error)
    return res.status(500).json({ error: 'Calculation failed', message: error instanceof Error ? error.message : 'Unknown error' })
  }
}
