import { WaterProfile } from '../core/types'

export type WaterProfileEntry = WaterProfile & { id: string; name: string }

export const STANDARD_PROFILES: WaterProfileEntry[] = [
  {
    id: 'pilsen',
    name: 'Pilsen',
    calcium: 7,
    magnesium: 2,
    sodium: 2,
    sulfate: 5,
    chloride: 5,
    bicarbonate: 35,
    carbonate: 0,
    ph: 7.0
  },
  {
    id: 'burton',
    name: 'Burton on Trent',
    calcium: 352,
    magnesium: 24,
    sodium: 54,
    sulfate: 820,
    chloride: 16,
    bicarbonate: 320,
    carbonate: 0,
    ph: 7.9
  },
  {
    id: 'dublin',
    name: 'Dublin',
    calcium: 118,
    magnesium: 4,
    sodium: 12,
    sulfate: 55,
    chloride: 19,
    bicarbonate: 319,
    carbonate: 0,
    ph: 7.8
  },
  {
    id: 'london',
    name: 'London',
    calcium: 52,
    magnesium: 32,
    sodium: 86,
    sulfate: 32,
    chloride: 34,
    bicarbonate: 104,
    carbonate: 0,
    ph: 7.4
  },
  {
    id: 'munich',
    name: 'Munich',
    calcium: 75,
    magnesium: 18,
    sodium: 2,
    sulfate: 18,
    chloride: 2,
    bicarbonate: 152,
    carbonate: 0,
    ph: 7.4
  },
  {
    id: 'vienna',
    name: 'Vienna',
    calcium: 200,
    magnesium: 60,
    sodium: 8,
    sulfate: 125,
    chloride: 12,
    bicarbonate: 120,
    carbonate: 0,
    ph: 7.6
  }
]
