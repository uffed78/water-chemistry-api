export const CHEMISTRY_CONSTANTS = {
  // Acid dissociation constants (pKa)
  CARBONIC_ACID_PKA1: 6.35,
  CARBONIC_ACID_PKA2: 10.33,
  PHOSPHORIC_ACID_PKA1: 2.12,
  PHOSPHORIC_ACID_PKA2: 7.21,
  PHOSPHORIC_ACID_PKA3: 12.68,
  LACTIC_ACID_PKA: 3.86,
  
  // Ionic strength factors
  IONIC_STRENGTH_FACTOR: 0.5,
  
  // Temperature correction
  TEMP_CORRECTION_FACTOR: 0.003,
  
  // Buffer capacity (mEq/kg)
  BASE_MALT_BUFFER: 35,
  CRYSTAL_MALT_BUFFER: 45,
  ROASTED_MALT_BUFFER: 70,
  ACIDULATED_MALT_BUFFER: -35,
  
  // pH targets
  OPTIMAL_MASH_PH_MIN: 5.2,
  OPTIMAL_MASH_PH_MAX: 5.6,
  OPTIMAL_SPARGE_PH_MAX: 5.8,
};

export interface SaltDefinition {
  formula: string;
  molarMass: number;
  ionsPPMPerGram: {
    calcium?: number;
    magnesium?: number;
    sodium?: number;
    sulfate?: number;
    chloride?: number;
    bicarbonate?: number;
    carbonate?: number;
  };
}

export const SALTS: Record<string, SaltDefinition> = {
  gypsum: {
    formula: 'CaSO4·2H2O',
    molarMass: 172.17,
    ionsPPMPerGram: {
      calcium: 232.5,
      sulfate: 557.7
    }
  },
  calcium_chloride: {
    formula: 'CaCl2·2H2O',
    molarMass: 147.01,
    ionsPPMPerGram: {
      calcium: 272.6,
      chloride: 482.3
    }
  },
  epsom_salt: {
    formula: 'MgSO4·7H2O',
    molarMass: 246.47,
    ionsPPMPerGram: {
      magnesium: 98.6,
      sulfate: 389.6
    }
  },
  magnesium_chloride: {
    formula: 'MgCl2·6H2O',
    molarMass: 203.30,
    ionsPPMPerGram: {
      magnesium: 119.5,
      chloride: 348.7
    }
  },
  sodium_chloride: {
    formula: 'NaCl',
    molarMass: 58.44,
    ionsPPMPerGram: {
      sodium: 393.4,
      chloride: 606.6
    }
  },
  baking_soda: {
    formula: 'NaHCO3',
    molarMass: 84.01,
    ionsPPMPerGram: {
      sodium: 273.7,
      bicarbonate: 726.3
    }
  },
  calcium_carbonate: {
    formula: 'CaCO3',
    molarMass: 100.09,
    ionsPPMPerGram: {
      calcium: 400.4,
      carbonate: 599.6
    }
  },
  calcium_hydroxide: {
    formula: 'Ca(OH)2',
    molarMass: 74.09,
    ionsPPMPerGram: {
      calcium: 541.0,
      // Note: Ca(OH)2 increases alkalinity but doesn't directly add carbonate/bicarbonate
      // It reacts with CO2 in water to form bicarbonate
    }
  },
  sodium_bicarbonate: {
    formula: 'NaHCO3',
    molarMass: 84.01,
    ionsPPMPerGram: {
      sodium: 273.7,
      bicarbonate: 726.3
    }
  }
};

export interface AcidDefinition {
  name: string;
  formula: string;
  molarMass: number;
  density: number; // g/ml at standard concentration
  pKa: number[];
  standardConcentrations: number[]; // Common commercial concentrations in %
}

export const ACIDS: Record<string, AcidDefinition> = {
  lactic: {
    name: 'Lactic Acid',
    formula: 'C3H6O3',
    molarMass: 90.08,
    density: 1.21, // for 88% solution
    pKa: [3.86],
    standardConcentrations: [88, 80]
  },
  phosphoric: {
    name: 'Phosphoric Acid',
    formula: 'H3PO4',
    molarMass: 98.00,
    density: 1.685, // for 85% solution
    pKa: [2.12, 7.21, 12.68],
    standardConcentrations: [85, 75, 10]
  },
  sulfuric: {
    name: 'Sulfuric Acid',
    formula: 'H2SO4',
    molarMass: 98.08,
    density: 1.84, // for 98% solution
    pKa: [-3, 1.99], // Strong acid, first dissociation essentially complete
    standardConcentrations: [98, 10]
  },
  hydrochloric: {
    name: 'Hydrochloric Acid',
    formula: 'HCl',
    molarMass: 36.46,
    density: 1.18, // for 37% solution
    pKa: [-6.3], // Strong acid
    standardConcentrations: [37, 10]
  },
  citric: {
    name: 'Citric Acid',
    formula: 'C6H8O7',
    molarMass: 192.12,
    density: 1.665, // solid, usually dissolved
    pKa: [3.13, 4.76, 6.40],
    standardConcentrations: [100] // Usually used as solid
  }
};

// Water ion limits for brewing
export const ION_LIMITS = {
  calcium: {
    min: 50,
    max: 150,
    optimal: { min: 50, max: 100 }
  },
  magnesium: {
    min: 0,
    max: 30,
    optimal: { min: 5, max: 15 }
  },
  sodium: {
    min: 0,
    max: 150,
    optimal: { min: 0, max: 50 }
  },
  sulfate: {
    min: 0,
    max: 400,
    optimal: { min: 50, max: 350 } // Depends on style
  },
  chloride: {
    min: 0,
    max: 200,
    optimal: { min: 25, max: 100 }
  },
  bicarbonate: {
    min: 0,
    max: 250,
    optimal: { min: 0, max: 100 } // Lower for pale beers
  }
};

// Style-specific sulfate:chloride ratios
export const SULFATE_CHLORIDE_RATIOS = {
  hoppy: { min: 2, max: 5, target: 3 },
  balanced: { min: 0.8, max: 1.5, target: 1 },
  malty: { min: 0.3, max: 0.8, target: 0.5 }
};