import { WaterProfile } from '../../core/types';
import { SALTS, ION_LIMITS } from '../../core/constants';

/**
 * Minimal optimization strategy
 * Uses the least amount of salts possible
 * Only addresses critical ions:
 * - Calcium for enzymes (min 50 ppm)
 * - Sulfate OR Chloride for flavor
 * Max 2-3 salts total
 */

export interface MinimalOptimizationInput {
  sourceWater: WaterProfile;
  targetStyle: 'hoppy' | 'balanced' | 'malty';
  ensureCalcium?: boolean;
  maxSalts?: number;
}

export interface MinimalOptimizationResult {
  salts: Record<string, number>;
  achievedProfile: WaterProfile;
  totalSalts: number;
  totalWeight: number;
  rationale: string[];
}

/**
 * Calculate minimal salt additions
 */
export function optimizeMinimal(input: MinimalOptimizationInput): MinimalOptimizationResult {
  const {
    sourceWater,
    targetStyle,
    ensureCalcium = true,
    maxSalts = 2
  } = input;

  const salts: Record<string, number> = {};
  const rationale: string[] = [];
  let currentWater = { ...sourceWater };

  // Step 1: Ensure minimum calcium if needed
  if (ensureCalcium && sourceWater.calcium < ION_LIMITS.calcium.min) {
    const calciumNeeded = ION_LIMITS.calcium.min - sourceWater.calcium;
    
    // Choose salt based on style
    if (targetStyle === 'hoppy') {
      // Use gypsum for hoppy styles (adds sulfate)
      const gypsumAmount = calciumNeeded / SALTS.gypsum.ionsPPMPerGram.calcium!;
      salts.gypsum = Math.round(gypsumAmount * 10) / 10;
      
      // Update water profile
      currentWater.calcium += gypsumAmount * SALTS.gypsum.ionsPPMPerGram.calcium!;
      currentWater.sulfate += gypsumAmount * SALTS.gypsum.ionsPPMPerGram.sulfate!;
      
      rationale.push(`Added ${salts.gypsum}g gypsum for minimum calcium (50 ppm) and hop character`);
    } else {
      // Use calcium chloride for balanced/malty styles
      const cacl2Amount = calciumNeeded / SALTS.calcium_chloride.ionsPPMPerGram.calcium!;
      salts.calcium_chloride = Math.round(cacl2Amount * 10) / 10;
      
      // Update water profile
      currentWater.calcium += cacl2Amount * SALTS.calcium_chloride.ionsPPMPerGram.calcium!;
      currentWater.chloride += cacl2Amount * SALTS.calcium_chloride.ionsPPMPerGram.chloride!;
      
      rationale.push(`Added ${salts.calcium_chloride}g calcium chloride for minimum calcium (50 ppm)`);
    }
  }

  // Step 2: Adjust sulfate:chloride ratio if we have salt budget left
  const saltsUsed = Object.keys(salts).length;
  if (saltsUsed < maxSalts) {
    const currentRatio = currentWater.chloride > 0 ? currentWater.sulfate / currentWater.chloride : 999;
    
    switch (targetStyle) {
      case 'hoppy':
        // Target ratio 3:1 or higher
        if (currentRatio < 3) {
          // Add more sulfate
          const sulfateNeeded = (currentWater.chloride * 3) - currentWater.sulfate;
          if (sulfateNeeded > 50) {
            // Use gypsum if not already added
            if (!salts.gypsum) {
              const gypsumAmount = Math.min(sulfateNeeded / SALTS.gypsum.ionsPPMPerGram.sulfate!, 5);
              salts.gypsum = Math.round(gypsumAmount * 10) / 10;
              currentWater.calcium += gypsumAmount * SALTS.gypsum.ionsPPMPerGram.calcium!;
              currentWater.sulfate += gypsumAmount * SALTS.gypsum.ionsPPMPerGram.sulfate!;
              rationale.push(`Added ${salts.gypsum}g gypsum for hoppy character (3:1 sulfate:chloride)`);
            }
          }
        }
        break;
        
      case 'malty':
        // Target ratio 0.5:1 or lower
        if (currentRatio > 0.5) {
          // Add more chloride
          const chlorideNeeded = (currentWater.sulfate * 2) - currentWater.chloride;
          if (chlorideNeeded > 30) {
            // Use sodium chloride (table salt) - minimal addition
            const saltAmount = Math.min(chlorideNeeded / SALTS.sodium_chloride.ionsPPMPerGram.chloride!, 2);
            salts.sodium_chloride = Math.round(saltAmount * 10) / 10;
            currentWater.sodium += saltAmount * SALTS.sodium_chloride.ionsPPMPerGram.sodium!;
            currentWater.chloride += saltAmount * SALTS.sodium_chloride.ionsPPMPerGram.chloride!;
            rationale.push(`Added ${salts.sodium_chloride}g salt for malty character (0.5:1 sulfate:chloride)`);
          }
        }
        break;
        
      case 'balanced':
        // Target ratio around 1:1
        if (currentRatio > 1.5) {
          // Need more chloride
          const chlorideNeeded = currentWater.sulfate - currentWater.chloride;
          if (chlorideNeeded > 30 && saltsUsed < maxSalts) {
            const saltAmount = Math.min(chlorideNeeded / SALTS.sodium_chloride.ionsPPMPerGram.chloride!, 1);
            salts.sodium_chloride = Math.round(saltAmount * 10) / 10;
            currentWater.sodium += saltAmount * SALTS.sodium_chloride.ionsPPMPerGram.sodium!;
            currentWater.chloride += saltAmount * SALTS.sodium_chloride.ionsPPMPerGram.chloride!;
            rationale.push(`Added ${salts.sodium_chloride}g salt for balanced character`);
          }
        } else if (currentRatio < 0.67) {
          // Need more sulfate
          if (!salts.gypsum && saltsUsed < maxSalts) {
            const sulfateNeeded = currentWater.chloride - currentWater.sulfate;
            const gypsumAmount = Math.min(sulfateNeeded / SALTS.gypsum.ionsPPMPerGram.sulfate!, 2);
            salts.gypsum = Math.round(gypsumAmount * 10) / 10;
            currentWater.calcium += gypsumAmount * SALTS.gypsum.ionsPPMPerGram.calcium!;
            currentWater.sulfate += gypsumAmount * SALTS.gypsum.ionsPPMPerGram.sulfate!;
            rationale.push(`Added ${salts.gypsum}g gypsum for balanced character`);
          }
        }
        break;
    }
  }

  // Calculate total weight
  const totalWeight = Object.values(salts).reduce((sum, amount) => sum + amount, 0);

  // If no salts needed
  if (Object.keys(salts).length === 0) {
    rationale.push('Source water is adequate - no salt additions needed');
  }

  return {
    salts,
    achievedProfile: currentWater,
    totalSalts: Object.keys(salts).length,
    totalWeight: Math.round(totalWeight * 10) / 10,
    rationale
  };
}

/**
 * Get minimal additions for a specific water deficiency
 */
export function getMinimalCorrection(
  sourceWater: WaterProfile,
  deficiency: 'calcium' | 'sulfate' | 'chloride' | 'alkalinity'
): {
  salt: string;
  amount: number;
  rationale: string;
} {
  switch (deficiency) {
    case 'calcium':
      const calciumNeeded = Math.max(0, 50 - sourceWater.calcium);
      if (calciumNeeded > 0) {
        const gypsumAmount = calciumNeeded / SALTS.gypsum.ionsPPMPerGram.calcium!;
        return {
          salt: 'gypsum',
          amount: Math.round(gypsumAmount * 10) / 10,
          rationale: `Add ${Math.round(gypsumAmount * 10) / 10}g gypsum to reach 50 ppm calcium minimum`
        };
      }
      break;
      
    case 'sulfate':
      const sulfateNeeded = Math.max(0, 50 - sourceWater.sulfate);
      if (sulfateNeeded > 0) {
        const gypsumAmount = sulfateNeeded / SALTS.gypsum.ionsPPMPerGram.sulfate!;
        return {
          salt: 'gypsum',
          amount: Math.round(gypsumAmount * 10) / 10,
          rationale: `Add ${Math.round(gypsumAmount * 10) / 10}g gypsum for sulfate`
        };
      }
      break;
      
    case 'chloride':
      const chlorideNeeded = Math.max(0, 50 - sourceWater.chloride);
      if (chlorideNeeded > 0) {
        const cacl2Amount = chlorideNeeded / SALTS.calcium_chloride.ionsPPMPerGram.chloride!;
        return {
          salt: 'calcium_chloride',
          amount: Math.round(cacl2Amount * 10) / 10,
          rationale: `Add ${Math.round(cacl2Amount * 10) / 10}g calcium chloride for chloride`
        };
      }
      break;
      
    case 'alkalinity':
      const alkalinityNeeded = Math.max(0, 50 - sourceWater.bicarbonate);
      if (alkalinityNeeded > 0) {
        const sodaAmount = alkalinityNeeded / SALTS.baking_soda.ionsPPMPerGram.bicarbonate!;
        return {
          salt: 'baking_soda',
          amount: Math.round(sodaAmount * 10) / 10,
          rationale: `Add ${Math.round(sodaAmount * 10) / 10}g baking soda for alkalinity`
        };
      }
      break;
  }
  
  return {
    salt: 'none',
    amount: 0,
    rationale: 'No correction needed'
  };
}

/**
 * Check if water needs any corrections
 */
export function assessWaterDeficiencies(water: WaterProfile): {
  needsCorrection: boolean;
  deficiencies: string[];
  recommendations: string[];
} {
  const deficiencies: string[] = [];
  const recommendations: string[] = [];
  
  // Check calcium
  if (water.calcium < ION_LIMITS.calcium.min) {
    deficiencies.push(`Calcium too low (${water.calcium} ppm, need 50+)`);
    recommendations.push('Add gypsum or calcium chloride');
  }
  
  // Check if water is too soft
  const totalHardness = water.calcium + water.magnesium;
  if (totalHardness < 50) {
    deficiencies.push(`Very soft water (${totalHardness} ppm total hardness)`);
    recommendations.push('Consider minimal salt additions for yeast health');
  }
  
  // Check sulfate + chloride
  const flavorIons = water.sulfate + water.chloride;
  if (flavorIons < 50) {
    deficiencies.push('Low flavor ions (sulfate + chloride < 50 ppm)');
    recommendations.push('Add gypsum for hoppy or calcium chloride for malty character');
  }
  
  // Check for excessive minerals
  const totalMinerals = water.calcium + water.magnesium + water.sodium + water.sulfate + water.chloride;
  if (totalMinerals > 500) {
    deficiencies.push(`High mineral content (${totalMinerals} ppm) - consider dilution`);
    recommendations.push('Dilute with RO or distilled water');
  }
  
  return {
    needsCorrection: deficiencies.length > 0,
    deficiencies,
    recommendations
  };
}