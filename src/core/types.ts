export interface WaterProfile {
  id?: string
  name: string
  calcium: number      // mg/L (ppm)
  magnesium: number
  sodium: number
  sulfate: number
  chloride: number
  bicarbonate: number
  carbonate: number
  ph: number
  alkalinity?: number  // as CaCO3
  residualAlkalinity?: number
  totalDissolvedSolids?: number
  ionBalance?: number
}

export interface GrainBillItem {
  name: string
  amountKg: number
  color: number        // SRM
  distilledWaterPH?: number
  bufferCapacity?: number
  acidity?: number
  grainType: 'base' | 'crystal' | 'roasted' | 'acidulated' | 'other'
}

export interface CalculationRequest {
  sourceWater: WaterProfile
  targetWater?: WaterProfile
  grainBill: GrainBillItem[]
  volumes: {
    total: number
    mash: number
    sparge: number
  }
  targetMashPH?: number
  units: 'metric' | 'imperial'
  mode?: 'simple' | 'guided' | 'expert'
  autoCalculateSalts?: boolean
  manualAdjustments?: {
    salts?: Record<string, number>
    acids?: Record<string, number>
  }
}

export interface CalculationResponse {
  success: boolean
  sourceWater: WaterProfile
  achievedWater: WaterProfile
  adjustments: {
    salts: Array<{
      id: string
      name: string
      amount: number
      unit: string
    }>
    acids: Array<{
      id: string
      name: string
      amount: number
      unit: string
    }>
  }
  predictions: {
    mashPH: number
    finalPH: number
    residualAlkalinity: number
    sulfateChlorideRatio: number
    effectiveHardness: number
  }
  warnings: string[]
  recommendations: string[]
}