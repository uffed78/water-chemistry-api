export interface StyleProfile {
  id: string
  name: string
  description?: string
  targets: {
    calcium: number
    magnesium: number
    sodium?: number
    sulfate: number
    chloride: number
    bicarbonate?: number
    sulfateChlorideRatio?: number
  }
}

// Typical style-oriented targets derived from common brewing guidelines.
// These are not strict; they represent midpoints in recommended ranges.
export const STYLE_PROFILES: StyleProfile[] = [
  {
    id: 'german_pilsner',
    name: 'German Pilsner',
    description: 'Crisp, soft; favor low minerals and modest sulfate',
    targets: { calcium: 50, magnesium: 5, sodium: 5, sulfate: 75, chloride: 50, bicarbonate: 25, sulfateChlorideRatio: 1.5 }
  },
  {
    id: 'american_ipa',
    name: 'American IPA',
    description: 'Assertive hop profile; high sulfate emphasis',
    targets: { calcium: 120, magnesium: 10, sodium: 10, sulfate: 250, chloride: 75, bicarbonate: 50, sulfateChlorideRatio: 3.0 }
  },
  {
    id: 'neipa',
    name: 'New England IPA',
    description: 'Juicy, soft mouthfeel; chloride forward',
    targets: { calcium: 100, magnesium: 10, sodium: 20, sulfate: 100, chloride: 200, bicarbonate: 50, sulfateChlorideRatio: 0.5 }
  },
  {
    id: 'stout',
    name: 'Stout',
    description: 'Dark roast; higher chloride and bicarbonate tolerance',
    targets: { calcium: 100, magnesium: 10, sodium: 20, sulfate: 75, chloride: 100, bicarbonate: 150, sulfateChlorideRatio: 0.75 }
  },
  {
    id: 'helles',
    name: 'Munich Helles',
    description: 'Soft, malt-forward; low sulfate',
    targets: { calcium: 60, magnesium: 5, sodium: 5, sulfate: 50, chloride: 80, bicarbonate: 40, sulfateChlorideRatio: 0.6 }
  },
  {
    id: 'esb',
    name: 'English Bitter / ESB',
    description: 'Balanced to hoppy; moderate sulfate and chloride',
    targets: { calcium: 120, magnesium: 10, sodium: 25, sulfate: 200, chloride: 100, bicarbonate: 75, sulfateChlorideRatio: 2.0 }
  },
  {
    id: 'saison',
    name: 'Saison',
    description: 'Dry, highly attenuated; lean mineral balance',
    targets: { calcium: 80, magnesium: 8, sodium: 10, sulfate: 150, chloride: 75, bicarbonate: 50, sulfateChlorideRatio: 2.0 }
  },
  {
    id: 'amber_ale',
    name: 'Amber Ale',
    description: 'Malty balance; moderate chloride focus',
    targets: { calcium: 100, magnesium: 8, sodium: 15, sulfate: 150, chloride: 100, bicarbonate: 80, sulfateChlorideRatio: 1.5 }
  }
]

