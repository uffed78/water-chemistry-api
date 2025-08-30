import { WaterProfile, Volumes, GrainBillItem } from '../types'
import { CHEMISTRY_CONSTANTS } from '../data/constants'

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

// --- Kaiser model (Kai Troester-inspired) ---

function getMaltBufferCapacity(grain: GrainBillItem): number {
  const { type, color } = grain
  let bufferCapacity = CHEMISTRY_CONSTANTS.BASE_MALT_BUFFER
  switch (type) {
    case 'base':
      bufferCapacity = 30 + Math.min(color * 0.5, 10)
      break
    case 'crystal':
      bufferCapacity = 40 + Math.min(color * 0.1, 15)
      break
    case 'roasted':
      bufferCapacity = 55 + Math.min(color * 0.05, 30)
      break
    case 'acidulated':
      bufferCapacity = -35
      break
    case 'wheat':
      bufferCapacity = 35
      break
  }
  return bufferCapacity
}

function getMaltAcidity(grain: GrainBillItem): number {
  const { type, color } = grain
  const lovibond = color / 1.97
  switch (type) {
    case 'base':
      return lovibond * 0.1
    case 'crystal':
      return 0.45 * lovibond + 6
    case 'roasted':
      return 0.3 * lovibond + 15
    case 'acidulated':
      return 150
    case 'wheat':
      return lovibond * 0.1
    default:
      return 0
  }
}

function effectiveAlkalinityAsCaCO3(water: WaterProfile): number {
  const alkalinity = water.bicarbonate * 50 / 61
  const calciumEffect = (water.calcium || 0) * 0.04
  const magnesiumEffect = (water.magnesium || 0) * 0.03
  return alkalinity - calciumEffect - magnesiumEffect
}

function temperatureCorrect(ph: number, temperatureC: number): number {
  const diff = temperatureC - 25
  return ph - diff * CHEMISTRY_CONSTANTS.TEMP_CORRECTION_FACTOR
}

export function calculateMashPH_Kaiser(
  water: WaterProfile,
  grainBill: GrainBillItem[],
  mashThicknessLPerKg: number = 3.0,
  mashTemperatureC: number = 65
): number {
  const totalWeight = grainBill.reduce((s, g) => s + g.weight, 0)
  if (!totalWeight) return 5.4

  let totalBufferCap = 0
  let totalAcidity = 0
  for (const g of grainBill) {
    totalBufferCap += getMaltBufferCapacity(g) * g.weight
    totalAcidity += getMaltAcidity(g) * g.weight
  }
  const avgBufferCap = totalBufferCap / totalWeight
  const effAlk = effectiveAlkalinityAsCaCO3(water)
  const alkalinityMEq = effAlk * 0.02
  const waterChargePerKg = alkalinityMEq * mashThicknessLPerKg
  const maltChargePerKg = totalAcidity / totalWeight
  const netCharge = waterChargePerKg - maltChargePerKg
  const pHShift = netCharge / avgBufferCap
  let pH = 5.7 + pHShift
  pH = temperatureCorrect(pH, mashTemperatureC)
  return Math.max(4.5, Math.min(6.5, pH))
}
