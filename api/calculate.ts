import type { VercelRequest, VercelResponse } from '@vercel/node'
import { CalculationRequest, CalculationResponse } from '../src/core/types'
import { WaterChemistryEngine } from '../src/core/calculations'

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  
  try {
    const request = req.body as CalculationRequest
    
    // Validate required fields
    if (!request.sourceWater || !request.grainBill || !request.volumes) {
      return res.status(400).json({ error: 'Missing required fields' })
    }
    
    // Perform calculations
    const engine = new WaterChemistryEngine()
    const result = engine.calculate(request)
    
    return res.status(200).json(result)
  } catch (error) {
    console.error('Calculation error:', error)
    return res.status(500).json({ 
      error: 'Calculation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}