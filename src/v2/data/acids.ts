export interface AcidDefinition {
  name: string
  formula: string
  molarMass: number
  density: number
  pKa: number[]
  standardConcentrations: number[]
}

export const ACIDS: Record<string, AcidDefinition> = {
  lactic: {
    name: 'Lactic Acid',
    formula: 'C3H6O3',
    molarMass: 90.08,
    density: 1.21,
    pKa: [3.86],
    standardConcentrations: [88, 80]
  },
  phosphoric: {
    name: 'Phosphoric Acid',
    formula: 'H3PO4',
    molarMass: 98.0,
    density: 1.685,
    pKa: [2.12, 7.21, 12.68],
    standardConcentrations: [85, 75, 10]
  },
  sulfuric: {
    name: 'Sulfuric Acid',
    formula: 'H2SO4',
    molarMass: 98.08,
    density: 1.84,
    pKa: [-3, 1.99],
    standardConcentrations: [98, 10]
  },
  hydrochloric: {
    name: 'Hydrochloric Acid',
    formula: 'HCl',
    molarMass: 36.46,
    density: 1.18,
    pKa: [-6.3],
    standardConcentrations: [37, 10]
  }
}

