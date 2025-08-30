import { VolumeMode, Volumes, WaterProfile } from '../../core/types';
import { SALTS, SaltDefinition } from '../../core/constants';

/**
 * Calculate PPM for a given salt addition
 * This is the CRITICAL fix - we calculate based on the correct volume
 * depending on the volume mode setting
 */
export function calculatePPM(
  saltGrams: number,
  ionsPPMPerGram: number,
  volumes: Volumes,
  volumeMode: VolumeMode,
  saltLocation?: 'mash' | 'sparge' | 'boil'
): number {
  let effectiveVolume: number;
  
  switch(volumeMode) {
    case 'mash':
      // Bru'n Water standard - all salts calculated on mash volume
      // This gives higher PPM values that match Bru'n Water
      effectiveVolume = volumes.mash;
      break;
      
    case 'staged':
      // Calculate based on where the salt is added
      if (saltLocation === 'mash') {
        effectiveVolume = volumes.mash;
      } else if (saltLocation === 'sparge') {
        effectiveVolume = volumes.sparge;
      } else {
        // Boil additions affect total volume
        effectiveVolume = volumes.total;
      }
      break;
      
    default: // 'total'
      // All salts calculated on total volume
      // This gives lower PPM values (our old bug)
      effectiveVolume = volumes.total;
  }
  
  // PPM = (grams / liters) * PPM per gram
  return (saltGrams / effectiveVolume) * ionsPPMPerGram;
}

/**
 * Calculate the water profile after salt additions
 */
export function calculateWaterProfileFromSalts(
  sourceWater: WaterProfile,
  saltAdditions: Record<string, number>, // salt name -> grams
  volumes: Volumes,
  volumeMode: VolumeMode = 'mash',
  saltLocations?: Record<string, 'mash' | 'sparge' | 'boil'>
): WaterProfile {
  const result: WaterProfile = { ...sourceWater };
  
  for (const [saltName, grams] of Object.entries(saltAdditions)) {
    if (grams === 0) continue;
    
    const salt = SALTS[saltName];
    if (!salt) {
      console.warn(`Unknown salt: ${saltName}`);
      continue;
    }
    
    const location = saltLocations?.[saltName];
    
    // Add each ion contribution
    for (const [ion, ppmPerGram] of Object.entries(salt.ionsPPMPerGram)) {
      const ppmToAdd = calculatePPM(grams, ppmPerGram, volumes, volumeMode, location);
      
      // Add to the appropriate ion in the water profile
      switch(ion) {
        case 'calcium':
          result.calcium += ppmToAdd;
          break;
        case 'magnesium':
          result.magnesium += ppmToAdd;
          break;
        case 'sodium':
          result.sodium += ppmToAdd;
          break;
        case 'sulfate':
          result.sulfate += ppmToAdd;
          break;
        case 'chloride':
          result.chloride += ppmToAdd;
          break;
        case 'bicarbonate':
          result.bicarbonate += ppmToAdd;
          break;
        case 'carbonate':
          result.carbonate = (result.carbonate || 0) + ppmToAdd;
          break;
      }
    }
  }
  
  return result;
}

/**
 * Calculate residual alkalinity (RA)
 * RA = Alkalinity - (Ca²⁺/1.4 + Mg²⁺/1.7)
 */
export function calculateResidualAlkalinity(water: WaterProfile): number {
  // Convert bicarbonate to alkalinity as CaCO3
  const alkalinity = water.bicarbonate * 50 / 61;
  
  // Calculate RA using Palmer's formula
  const ra = alkalinity - (water.calcium / 1.4 + water.magnesium / 1.7);
  
  return ra;
}

/**
 * Calculate sulfate to chloride ratio
 */
export function calculateSulfateChlorideRatio(water: WaterProfile): number {
  if (water.chloride === 0) return Infinity;
  return water.sulfate / water.chloride;
}

/**
 * Analyze the water profile for brewing suitability
 */
export function analyzeWaterProfile(water: WaterProfile): {
  calciumLevel: 'low' | 'optimal' | 'high';
  flavorProfile: 'hoppy' | 'balanced' | 'malty';
  warnings: string[];
  suggestions: string[];
} {
  const warnings: string[] = [];
  const suggestions: string[] = [];
  
  // Calcium analysis
  let calciumLevel: 'low' | 'optimal' | 'high';
  if (water.calcium < 50) {
    calciumLevel = 'low';
    warnings.push('Calcium is below 50 ppm - may affect enzyme activity and yeast health');
    suggestions.push('Add gypsum or calcium chloride to increase calcium');
  } else if (water.calcium > 150) {
    calciumLevel = 'high';
    warnings.push('Calcium is above 150 ppm - may taste minerally');
  } else {
    calciumLevel = 'optimal';
  }
  
  // Magnesium check
  if (water.magnesium > 30) {
    warnings.push('Magnesium is above 30 ppm - may taste bitter or sour');
  } else if (water.magnesium < 5) {
    suggestions.push('Consider adding Epsom salt for yeast nutrition (5-10 ppm Mg)');
  }
  
  // Sodium check
  if (water.sodium > 150) {
    warnings.push('Sodium is above 150 ppm - may taste salty');
  }
  
  // Sulfate/Chloride ratio for flavor profile
  const ratio = calculateSulfateChlorideRatio(water);
  let flavorProfile: 'hoppy' | 'balanced' | 'malty';
  
  if (ratio > 2) {
    flavorProfile = 'hoppy';
    if (ratio > 5) {
      warnings.push('Very high sulfate:chloride ratio - may be harsh');
    }
  } else if (ratio < 0.5) {
    flavorProfile = 'malty';
    if (ratio < 0.3) {
      warnings.push('Very low sulfate:chloride ratio - may lack hop character');
    }
  } else {
    flavorProfile = 'balanced';
  }
  
  // Bicarbonate check
  if (water.bicarbonate > 200) {
    warnings.push('High bicarbonate - will raise mash pH, use acid');
  }
  
  // Total hardness check
  const totalHardness = water.calcium + water.magnesium;
  if (totalHardness < 50) {
    warnings.push('Very soft water - may need mineral additions');
  } else if (totalHardness > 300) {
    warnings.push('Very hard water - may taste minerally');
  }
  
  return {
    calciumLevel,
    flavorProfile,
    warnings,
    suggestions
  };
}