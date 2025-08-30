import type { VercelRequest, VercelResponse } from '@vercel/node'
import waterProfiles from '../src/v2/data/water-profiles.json'
import styleProfiles from '../src/v2/data/style-profiles.json'

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const type = (req.query.type as string) || 'water'
  const id = req.query.id as string | undefined

  if (type === 'water') {
    if (id) {
      const item = (waterProfiles as any)[id]
      return item ? res.status(200).json(item) : res.status(404).json({ error: 'Not found', type, id })
    }
    return res.status(200).json({ type: 'water', profiles: Object.keys(waterProfiles as any) })
  }

  if (type === 'style') {
    if (id) {
      const item = (styleProfiles as any)[id]
      return item ? res.status(200).json(item) : res.status(404).json({ error: 'Not found', type, id })
    }
    return res.status(200).json({ type: 'style', profiles: Object.keys(styleProfiles as any) })
  }

  return res.status(400).json({ error: 'Invalid type', allowed: ['water', 'style'] })
}
