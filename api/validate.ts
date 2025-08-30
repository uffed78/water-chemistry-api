import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { WaterProfile, Volumes, GrainBillItem } from '../src/v2/types'
import { calculateSaltContribution } from '../src/v2/calculations/ppm'
import { calculateMashPH_Simple } from '../src/v2/calculations/ph'
import { SALTS } from '../src/v2/data/salts'
import { ION_LIMITS } from '../src/v2/data/constants'

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { plannedAdditions, sourceWater, grainBill, volumes } = req.body as {
      plannedAdditions: { salts: Record<string, number> }
      sourceWater: WaterProfile
      grainBill: GrainBillItem[]
      volumes: Volumes
    }

    if (!plannedAdditions || !sourceWater || !grainBill || !volumes) {
      return res.status(400).json({ error: 'Missing required fields', required: ['plannedAdditions', 'sourceWater', 'grainBill', 'volumes'] })
    }

    // Compute achieved water using mash mode
    const achieved: WaterProfile = { ...sourceWater }
    for (const [saltId, grams] of Object.entries(plannedAdditions.salts || {})) {
      const salt = (SALTS as any)[saltId]
      if (!salt || !grams) continue
      const c = calculateSaltContribution(salt, grams, volumes, 'mash')
      achieved.calcium += c.calcium
      achieved.magnesium += c.magnesium
      achieved.sodium += c.sodium
      achieved.sulfate += c.sulfate
      achieved.chloride += c.chloride
      achieved.bicarbonate += c.bicarbonate
    }

    // Simple predictions
    const mashPH = calculateMashPH_Simple(
      achieved,
      grainBill.map(g => ({ color: g.color, weight: g.weight })),
      volumes
    )

    // Issues
    const issues: { severity: 'error' | 'warning' | 'info'; message: string; suggestion?: string }[] = []

    if (achieved.calcium < ION_LIMITS.calcium.min) {
      issues.push({ severity: 'error', message: `Calcium too low (${achieved.calcium.toFixed(0)} ppm)`, suggestion: 'Add gypsum or calcium chloride' })
    } else if (achieved.calcium > ION_LIMITS.calcium.max) {
      issues.push({ severity: 'warning', message: `Calcium high (${achieved.calcium.toFixed(0)} ppm)` })
    }

    const ratio = achieved.chloride > 0 ? achieved.sulfate / achieved.chloride : 999
    if (ratio < 0.5) issues.push({ severity: 'info', message: `Low sulfate:chloride ratio (${ratio.toFixed(1)}) → malty` })
    if (ratio > 2.0) issues.push({ severity: 'info', message: `High sulfate:chloride ratio (${ratio.toFixed(1)}) → hoppy` })

    if (mashPH < 5.2) issues.push({ severity: 'warning', message: `Predicted mash pH low (${mashPH.toFixed(2)})`, suggestion: 'Reduce acid or add baking soda' })
    if (mashPH > 5.6) issues.push({ severity: 'error', message: `Predicted mash pH high (${mashPH.toFixed(2)})`, suggestion: 'Add lactic or phosphoric acid' })

    return res.status(200).json({
      valid: !issues.some(i => i.severity === 'error'),
      issues,
      predictions: { mashPH }
    })
  } catch (error) {
    console.error('Validate error:', error)
    return res.status(500).json({ error: 'Validation failed', message: error instanceof Error ? error.message : 'Unknown error' })
  }
}
