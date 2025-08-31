import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SALTS } from '../src/v2/data/salts'
import type { VolumeMode, WaterProfile, Volumes, GrainBillItem } from '../src/v2/types'
import { calculateSaltContribution } from '../src/v2/calculations/ppm'
import { optimizeWaterSimple } from '../src/v2/calculations/optimize'
import { calculateMashPH_Simple, calculateMashPH_Kaiser } from '../src/v2/calculations/ph'

type Mode = 'manual' | 'auto'

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
      assumeCarbonateDissolution
    } = req.body as {
      sourceWater: WaterProfile
      targetWater?: WaterProfile
      grainBill: GrainBillItem[]
      volumes: Volumes
      mode?: Mode
      volumeMode?: VolumeMode
      additions?: { salts: Record<string, number> }
      phModel?: 'simple' | 'kaiser'
      assumeCarbonateDissolution?: boolean
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
      const mashPH = phModel === 'kaiser'
        ? calculateMashPH_Kaiser(achieved, grainBill, mashThickness, 65)
        : calculateMashPH_Simple(
            achieved,
            grainBill.map(g => ({ color: g.color, weight: g.weight })),
            volumes
          )

      return res.status(200).json({
        achieved,
        predictions: { mashPH },
        volumeMode,
        volumeUsed: volumeMode === 'mash' ? volumes.mash : volumeMode === 'total' ? volumes.total : undefined
      })
    }

    // Auto mode
    if (!targetWater) return res.status(400).json({ error: 'Missing targetWater for auto mode' })

    const salts = optimizeWaterSimple(sourceWater, targetWater, volumes, volumeMode)
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
    const mashPH = phModel === 'kaiser'
      ? calculateMashPH_Kaiser(achieved, grainBill, mashThickness, 65)
      : calculateMashPH_Simple(
          achieved,
          grainBill.map(g => ({ color: g.color, weight: g.weight })),
          volumes
        )

    return res.status(200).json({ additions: salts, achieved, predictions: { mashPH }, volumeMode })
  } catch (error) {
    console.error('Calculation error:', error)
    return res.status(500).json({ error: 'Calculation failed', message: error instanceof Error ? error.message : 'Unknown error' })
  }
}
