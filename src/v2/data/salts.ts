export interface SaltDefinition {
  formula: string
  molarMass: number
  ionsPPMPerGram: {
    calcium?: number
    magnesium?: number
    sodium?: number
    sulfate?: number
    chloride?: number
    bicarbonate?: number
    carbonate?: number
  }
}

export const SALTS: Record<string, SaltDefinition> = {
  gypsum: {
    formula: 'CaSO4·2H2O',
    molarMass: 172.17,
    ionsPPMPerGram: { calcium: 232.5, sulfate: 557.7 }
  },
  calcium_chloride: {
    formula: 'CaCl2·2H2O',
    molarMass: 147.01,
    ionsPPMPerGram: { calcium: 272.6, chloride: 482.3 }
  },
  epsom_salt: {
    formula: 'MgSO4·7H2O',
    molarMass: 246.47,
    ionsPPMPerGram: { magnesium: 98.6, sulfate: 389.6 }
  },
  magnesium_chloride: {
    formula: 'MgCl2·6H2O',
    molarMass: 203.30,
    ionsPPMPerGram: { magnesium: 119.5, chloride: 348.7 }
  },
  sodium_chloride: {
    formula: 'NaCl',
    molarMass: 58.44,
    ionsPPMPerGram: { sodium: 393.4, chloride: 606.6 }
  },
  baking_soda: {
    formula: 'NaHCO3',
    molarMass: 84.01,
    ionsPPMPerGram: { sodium: 273.7, bicarbonate: 726.3 }
  },
  calcium_carbonate: {
    formula: 'CaCO3',
    molarMass: 100.09,
    ionsPPMPerGram: { calcium: 400.4, carbonate: 599.6 }
  },
  calcium_hydroxide: {
    formula: 'Ca(OH)2',
    molarMass: 74.09,
    ionsPPMPerGram: { calcium: 541.0 }
  },
  sodium_bicarbonate: {
    formula: 'NaHCO3',
    molarMass: 84.01,
    ionsPPMPerGram: { sodium: 273.7, bicarbonate: 726.3 }
  }
}
