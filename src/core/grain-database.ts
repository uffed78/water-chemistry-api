// Grain database with pH and acidity values from Bru'n Water

export interface GrainData {
  name: string
  colorSRM: number
  diWaterPH: number
  bufferCapacity: number  // mEq/kg
  acidity: number         // mEq/kg
  grainType: 'base' | 'crystal' | 'roasted' | 'acidulated' | 'other'
}

export const GRAIN_DATABASE: Record<string, GrainData> = {
  // Base Malts
  'pilsner': {
    name: 'Pilsner Malt',
    colorSRM: 1.8,
    diWaterPH: 5.72,
    bufferCapacity: 35.4,
    acidity: 0,
    grainType: 'base'
  },
  'pale_ale': {
    name: 'Pale Ale Malt',
    colorSRM: 3.0,
    diWaterPH: 5.68,
    bufferCapacity: 37.2,
    acidity: 0,
    grainType: 'base'
  },
  'maris_otter': {
    name: 'Maris Otter',
    colorSRM: 3.5,
    diWaterPH: 5.65,
    bufferCapacity: 38.1,
    acidity: 0,
    grainType: 'base'
  },
  'vienna': {
    name: 'Vienna Malt',
    colorSRM: 4.0,
    diWaterPH: 5.58,
    bufferCapacity: 36.8,
    acidity: 0,
    grainType: 'base'
  },
  'munich': {
    name: 'Munich Malt',
    colorSRM: 8.5,
    diWaterPH: 5.54,
    bufferCapacity: 38.5,
    acidity: 0,
    grainType: 'base'
  },
  'wheat': {
    name: 'Wheat Malt',
    colorSRM: 2.0,
    diWaterPH: 5.95,
    bufferCapacity: 31.2,
    acidity: 0,
    grainType: 'base'
  },
  
  // Crystal/Caramel Malts
  'crystal_20': {
    name: 'Crystal 20L',
    colorSRM: 20,
    diWaterPH: 4.65,
    bufferCapacity: 45.2,
    acidity: 62,
    grainType: 'crystal'
  },
  'crystal_40': {
    name: 'Crystal 40L',
    colorSRM: 40,
    diWaterPH: 4.58,
    bufferCapacity: 48.5,
    acidity: 72,
    grainType: 'crystal'
  },
  'crystal_60': {
    name: 'Crystal 60L',
    colorSRM: 60,
    diWaterPH: 4.52,
    bufferCapacity: 51.2,
    acidity: 85,
    grainType: 'crystal'
  },
  'crystal_80': {
    name: 'Crystal 80L',
    colorSRM: 80,
    diWaterPH: 4.48,
    bufferCapacity: 53.8,
    acidity: 95,
    grainType: 'crystal'
  },
  'crystal_120': {
    name: 'Crystal 120L',
    colorSRM: 120,
    diWaterPH: 4.42,
    bufferCapacity: 58.4,
    acidity: 112,
    grainType: 'crystal'
  },
  
  // Roasted Malts
  'chocolate': {
    name: 'Chocolate Malt',
    colorSRM: 400,
    diWaterPH: 4.31,
    bufferCapacity: 71.5,
    acidity: 165,
    grainType: 'roasted'
  },
  'roasted_barley': {
    name: 'Roasted Barley',
    colorSRM: 500,
    diWaterPH: 4.24,
    bufferCapacity: 85.2,
    acidity: 215,
    grainType: 'roasted'
  },
  'black_malt': {
    name: 'Black Malt',
    colorSRM: 550,
    diWaterPH: 4.18,
    bufferCapacity: 92.4,
    acidity: 245,
    grainType: 'roasted'
  },
  
  // Acidulated Malt
  'acidulated': {
    name: 'Acidulated Malt',
    colorSRM: 2.0,
    diWaterPH: 3.8,
    bufferCapacity: 35.0,
    acidity: 180,
    grainType: 'acidulated'
  }
}

// Helper function to find grain data by name or estimate from color
export function lookupGrainData(grainName: string, colorSRM?: number): GrainData {
  // Try exact name match first
  const normalizedName = grainName.toLowerCase().replace(/[^a-z0-9]/g, '_')
  
  // Check for exact matches
  if (GRAIN_DATABASE[normalizedName]) {
    return GRAIN_DATABASE[normalizedName]
  }
  
  // Try fuzzy matching
  for (const [key, grain] of Object.entries(GRAIN_DATABASE)) {
    if (grain.name.toLowerCase().includes(grainName.toLowerCase()) ||
        grainName.toLowerCase().includes(grain.name.toLowerCase())) {
      return grain
    }
  }
  
  // If we have color, estimate properties
  if (colorSRM !== undefined) {
    return estimateGrainFromColor(grainName, colorSRM)
  }
  
  // Default to pale ale malt
  return {
    name: grainName,
    colorSRM: colorSRM || 3,
    diWaterPH: 5.68,
    bufferCapacity: 37.2,
    acidity: 0,
    grainType: 'base'
  }
}

// Estimate grain properties from color (based on Bru'n Water correlations)
function estimateGrainFromColor(name: string, colorSRM: number): GrainData {
  let diWaterPH: number
  let bufferCapacity: number
  let acidity: number
  let grainType: 'base' | 'crystal' | 'roasted' | 'acidulated' | 'other'
  
  if (colorSRM <= 10) {
    // Base malt
    diWaterPH = 5.8 - (colorSRM * 0.02)
    bufferCapacity = 35 + (colorSRM * 0.5)
    acidity = 0
    grainType = 'base'
  } else if (colorSRM <= 150) {
    // Crystal/Caramel malt
    diWaterPH = 4.8 - (colorSRM * 0.003)
    bufferCapacity = 40 + (colorSRM * 0.15)
    acidity = 20 + (colorSRM * 0.8)
    grainType = 'crystal'
  } else {
    // Roasted malt
    diWaterPH = 4.5 - (colorSRM * 0.0008)
    bufferCapacity = 60 + (colorSRM * 0.08)
    acidity = 100 + (colorSRM * 0.3)
    grainType = 'roasted'
  }
  
  return {
    name,
    colorSRM,
    diWaterPH: Math.max(3.8, diWaterPH),
    bufferCapacity: Math.max(30, bufferCapacity),
    acidity: Math.max(0, acidity),
    grainType
  }
}