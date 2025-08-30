import { WaterProfile, SaltAddition } from '../../core/types';
import { SALTS, ION_LIMITS, SULFATE_CHLORIDE_RATIOS } from '../../core/constants';

/**
 * Balanced optimization strategy
 * Prioritizes:
 * 1. Calcium 50-150 ppm (enzyme function)
 * 2. SO4:Cl ratio (flavor balance)
 * 3. Residual alkalinity (pH control)
 * Allows ±10% deviation
 * Max 4 different salts
 */

export interface BalancedOptimizationInput {
  sourceWater: WaterProfile;
  targetWater: WaterProfile;
  maxSalts?: number;
  tolerance?: number; // Percentage, default 10%
  preferredStyle?: 'hoppy' | 'balanced' | 'malty';
}

export interface OptimizationResult {
  salts: Record<string, number>; // salt name -> grams
  achievedProfile: WaterProfile;
  matchPercentage: number;
  deviations: Record<string, number>;
}

/**
 * Calculate the difference between two water profiles
 */
function calculateWaterDifference(
  source: WaterProfile,
  target: WaterProfile
): WaterProfile {
  return {
    calcium: target.calcium - source.calcium,
    magnesium: target.magnesium - source.magnesium,
    sodium: target.sodium - source.sodium,
    sulfate: target.sulfate - source.sulfate,
    chloride: target.chloride - source.chloride,
    bicarbonate: target.bicarbonate - source.bicarbonate
  };
}

/**
 * Score a water profile based on brewing requirements
 */
function scoreWaterProfile(
  water: WaterProfile,
  target: WaterProfile,
  preferredStyle: 'hoppy' | 'balanced' | 'malty' = 'balanced'
): number {
  let score = 100;
  
  // Calcium is critical (weight: 30%)
  if (water.calcium < ION_LIMITS.calcium.min) {
    score -= 30 * (1 - water.calcium / ION_LIMITS.calcium.min);
  } else if (water.calcium > ION_LIMITS.calcium.max) {
    score -= 15 * ((water.calcium - ION_LIMITS.calcium.max) / ION_LIMITS.calcium.max);
  }
  
  // Sulfate:Chloride ratio (weight: 25%)
  const ratio = water.chloride > 0 ? water.sulfate / water.chloride : 999;
  const targetRatio = SULFATE_CHLORIDE_RATIOS[preferredStyle].target;
  const ratioDiff = Math.abs(ratio - targetRatio) / targetRatio;
  score -= 25 * Math.min(ratioDiff, 1);
  
  // Ion matching (weight: 45%)
  const ions = ['calcium', 'magnesium', 'sodium', 'sulfate', 'chloride', 'bicarbonate'] as const;
  ions.forEach(ion => {
    const actual = water[ion];
    const goal = target[ion];
    if (goal > 0) {
      const diff = Math.abs(actual - goal) / goal;
      score -= 7.5 * Math.min(diff, 1);
    }
  });
  
  return Math.max(0, score);
}

/**
 * Simple optimization using greedy approach
 */
export function optimizeBalanced(input: BalancedOptimizationInput): OptimizationResult {
  const {
    sourceWater,
    targetWater,
    maxSalts = 4,
    tolerance = 0.1,
    preferredStyle = 'balanced'
  } = input;
  
  // Calculate what we need to add
  const needed = calculateWaterDifference(sourceWater, targetWater);
  
  // Initialize result
  const saltAdditions: Record<string, number> = {};
  let currentWater = { ...sourceWater };
  
  // Priority salts for balanced approach
  const prioritySalts = [
    'gypsum',           // Ca + SO4
    'calcium_chloride', // Ca + Cl
    'epsom_salt',      // Mg + SO4
    'sodium_chloride', // Na + Cl
    'baking_soda',     // Na + HCO3
    'calcium_carbonate' // Ca + alkalinity
  ];
  
  // Try to add salts to meet targets
  let saltsUsed = 0;
  
  for (const saltName of prioritySalts) {
    if (saltsUsed >= maxSalts) break;
    
    const salt = SALTS[saltName];
    if (!salt) continue;
    
    // Check if this salt helps
    let helpfulIons = 0;
    let maxAmount = 0;
    
    for (const [ion, ppmPerGram] of Object.entries(salt.ionsPPMPerGram)) {
      const ionKey = ion as keyof WaterProfile;
      const need = needed[ionKey];
      
      if (need && need > 0 && ppmPerGram > 0) {
        helpfulIons++;
        // Calculate amount needed for this ion (per liter of mash volume)
        const amountForIon = (need / ppmPerGram) * 18; // multiply by mash volume
        maxAmount = maxAmount === 0 ? amountForIon : Math.min(maxAmount, amountForIon);
      }
    }
    
    if (helpfulIons > 0 && maxAmount > 0.1) {
      // Add this salt (limited amount to avoid overshooting)
      const amount = Math.min(maxAmount * 0.8, 10); // Max 10g per salt
      saltAdditions[saltName] = Math.round(amount * 10) / 10; // Round to 0.1g
      saltsUsed++;
      
      // Update current water and needed
      for (const [ion, ppmPerGram] of Object.entries(salt.ionsPPMPerGram)) {
        const ionKey = ion as keyof WaterProfile;
        const added = amount * ppmPerGram;
        currentWater[ionKey] = (currentWater[ionKey] || 0) + added;
        needed[ionKey] = (needed[ionKey] || 0) - added;
      }
    }
  }
  
  // Calculate match percentage
  const score = scoreWaterProfile(currentWater, targetWater, preferredStyle);
  
  // Calculate deviations
  const deviations: Record<string, number> = {};
  const ions = ['calcium', 'magnesium', 'sodium', 'sulfate', 'chloride', 'bicarbonate'] as const;
  ions.forEach(ion => {
    const actual = currentWater[ion];
    const goal = targetWater[ion];
    deviations[ion] = actual - goal;
  });
  
  return {
    salts: saltAdditions,
    achievedProfile: currentWater,
    matchPercentage: score,
    deviations
  };
}

/**
 * Optimize for a specific sulfate:chloride ratio
 */
export function optimizeForRatio(
  sourceWater: WaterProfile,
  targetRatio: number,
  totalMinerals: number = 300
): Record<string, number> {
  const salts: Record<string, number> = {};
  
  // Calculate needed sulfate and chloride
  const targetSulfate = (totalMinerals * targetRatio) / (1 + targetRatio);
  const targetChloride = totalMinerals / (1 + targetRatio);
  
  const neededSulfate = Math.max(0, targetSulfate - sourceWater.sulfate);
  const neededChloride = Math.max(0, targetChloride - sourceWater.chloride);
  
  // Add gypsum for sulfate
  if (neededSulfate > 0) {
    salts.gypsum = neededSulfate / SALTS.gypsum.ionsPPMPerGram.sulfate!;
  }
  
  // Add calcium chloride for chloride
  if (neededChloride > 0) {
    salts.calcium_chloride = neededChloride / SALTS.calcium_chloride.ionsPPMPerGram.chloride!;
  }
  
  // Round to 0.1g
  Object.keys(salts).forEach(key => {
    salts[key] = Math.round(salts[key] * 10) / 10;
  });
  
  return salts;
}