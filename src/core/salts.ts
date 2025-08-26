interface IonsPPM {
  calcium?: number
  magnesium?: number
  sodium?: number
  sulfate?: number
  chloride?: number
  bicarbonate?: number
  hydroxide?: number
}

interface SaltDefinition {
  id: string
  name: string
  formula: string
  molarMass: number
  ionsPPMPerGram: IonsPPM
  solubilityLimit?: number
}

export const SALT_DEFINITIONS: Record<string, SaltDefinition> = {
  gypsum: {
    id: 'gypsum',
    name: 'Gypsum',
    formula: 'CaSO₄·2H₂O',
    molarMass: 172.17,
    ionsPPMPerGram: {
      calcium: 232.5,
      sulfate: 557.7
    }
  },
  calcium_chloride: {
    id: 'calcium_chloride',
    name: 'Calcium Chloride',
    formula: 'CaCl₂·2H₂O',
    molarMass: 147.01,
    ionsPPMPerGram: {
      calcium: 272.0,
      chloride: 482.0
    }
  },
  epsom_salt: {
    id: 'epsom_salt',
    name: 'Epsom Salt',
    formula: 'MgSO₄·7H₂O',
    molarMass: 246.47,
    ionsPPMPerGram: {
      magnesium: 98.6,
      sulfate: 389.5
    }
  },
  magnesium_chloride: {
    id: 'magnesium_chloride',
    name: 'Magnesium Chloride',
    formula: 'MgCl₂·6H₂O',
    molarMass: 203.30,
    ionsPPMPerGram: {
      magnesium: 119.5,
      chloride: 348.5
    }
  },
  sodium_chloride: {
    id: 'sodium_chloride',
    name: 'Table Salt',
    formula: 'NaCl',
    molarMass: 58.44,
    ionsPPMPerGram: {
      sodium: 393.3,
      chloride: 606.7
    }
  },
  baking_soda: {
    id: 'baking_soda',
    name: 'Baking Soda',
    formula: 'NaHCO₃',
    molarMass: 84.01,
    ionsPPMPerGram: {
      sodium: 273.6,
      bicarbonate: 726.4
    }
  },
  calcium_carbonate: {
    id: 'calcium_carbonate',
    name: 'Chalk',
    formula: 'CaCO₃',
    molarMass: 100.09,
    ionsPPMPerGram: {
      calcium: 400.4,
      bicarbonate: 1219.2
    },
    solubilityLimit: 0.015
  },
  calcium_hydroxide: {
    id: 'calcium_hydroxide',
    name: 'Pickling Lime',
    formula: 'Ca(OH)₂',
    molarMass: 74.09,
    ionsPPMPerGram: {
      calcium: 540.8,
      hydroxide: 459.2
    },
    solubilityLimit: 1.85
  }
}