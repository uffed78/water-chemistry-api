export const CHEMISTRY_CONSTANTS = {
  CARBONIC_ACID_PKA1: 6.35,
  CARBONIC_ACID_PKA2: 10.33,
  PHOSPHORIC_ACID_PKA1: 2.12,
  PHOSPHORIC_ACID_PKA2: 7.21,
  PHOSPHORIC_ACID_PKA3: 12.68,
  LACTIC_ACID_PKA: 3.86,

  IONIC_STRENGTH_FACTOR: 0.5,
  TEMP_CORRECTION_FACTOR: 0.003,

  BASE_MALT_BUFFER: 35,
  CRYSTAL_MALT_BUFFER: 45,
  ROASTED_MALT_BUFFER: 70,
  ACIDULATED_MALT_BUFFER: -35,

  OPTIMAL_MASH_PH_MIN: 5.2,
  OPTIMAL_MASH_PH_MAX: 5.6,
  OPTIMAL_SPARGE_PH_MAX: 5.8
}

export const ION_LIMITS = {
  calcium: { min: 50, max: 150, optimal: { min: 50, max: 100 } },
  magnesium: { min: 0, max: 30, optimal: { min: 5, max: 15 } },
  sodium: { min: 0, max: 150, optimal: { min: 0, max: 50 } },
  sulfate: { min: 0, max: 400, optimal: { min: 50, max: 350 } },
  chloride: { min: 0, max: 200, optimal: { min: 25, max: 100 } },
  bicarbonate: { min: 0, max: 250, optimal: { min: 0, max: 100 } }
}

export const SULFATE_CHLORIDE_RATIOS = {
  hoppy: { min: 2, max: 5, target: 3 },
  balanced: { min: 0.8, max: 1.5, target: 1 },
  malty: { min: 0.3, max: 0.8, target: 0.5 }
}

