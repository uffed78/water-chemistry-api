import { WaterProfile, Volumes } from '../types'

export function calculateMashPH_Simple(
  water: WaterProfile,
  grains: { color: number; weight: number }[],
  _volumes: Volumes
): number {
  const RA = (water.bicarbonate * 0.82) - (water.calcium / 1.4) - (water.magnesium / 1.7)
  const totalW = grains.reduce((s, g) => s + g.weight, 0) || 1
  const avgColor = grains.reduce((s, g) => s + g.color * g.weight, 0) / totalW
  const basePH = 5.8
  const RAEffect = RA * -0.003
  const colorEffect = avgColor * -0.02
  const ph = basePH + RAEffect + colorEffect
  return Math.max(4.5, Math.min(6.5, ph))
}

