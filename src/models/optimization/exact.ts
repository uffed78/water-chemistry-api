import { WaterProfile } from '../../core/types';
import { SALTS } from '../../core/constants';

/**
 * Exact optimization strategy
 * Attempts to match target profile as closely as possible
 * Uses iterative approach to find best combination
 * Warns for impossible combinations
 */

export interface ExactOptimizationInput {
  sourceWater: WaterProfile;
  targetWater: WaterProfile;
  maxIterations?: number;
  tolerance?: number; // PPM tolerance
  allowedSalts?: string[];
  maxSaltAmount?: number; // Max grams per salt
}

export interface ExactOptimizationResult {
  salts: Record<string, number>;
  achievedProfile: WaterProfile;
  deviations: Record<string, number>;
  totalDeviation: number;
  iterations: number;
  warnings: string[];
  impossible?: boolean;
}

/**
 * Matrix representation for salt contributions
 */
interface SaltMatrix {
  saltName: string;
  calcium: number;
  magnesium: number;
  sodium: number;
  sulfate: number;
  chloride: number;
  bicarbonate: number;
}

/**
 * Build matrix of salt contributions per gram
 */
function buildSaltMatrix(allowedSalts?: string[]): SaltMatrix[] {
  const matrix: SaltMatrix[] = [];
  const saltsToUse = allowedSalts || Object.keys(SALTS);
  
  for (const saltName of saltsToUse) {
    const salt = SALTS[saltName];
    if (!salt) continue;
    
    matrix.push({
      saltName,
      calcium: salt.ionsPPMPerGram.calcium || 0,
      magnesium: salt.ionsPPMPerGram.magnesium || 0,
      sodium: salt.ionsPPMPerGram.sodium || 0,
      sulfate: salt.ionsPPMPerGram.sulfate || 0,
      chloride: salt.ionsPPMPerGram.chloride || 0,
      bicarbonate: salt.ionsPPMPerGram.bicarbonate || 0
    });
  }
  
  return matrix;
}

/**
 * Calculate water profile from salt amounts
 */
function calculateProfile(
  sourceWater: WaterProfile,
  saltAmounts: Record<string, number>,
  saltMatrix: SaltMatrix[]
): WaterProfile {
  const result = { ...sourceWater };
  
  for (const salt of saltMatrix) {
    const amount = saltAmounts[salt.saltName] || 0;
    if (amount === 0) continue;
    
    result.calcium += amount * salt.calcium;
    result.magnesium += amount * salt.magnesium;
    result.sodium += amount * salt.sodium;
    result.sulfate += amount * salt.sulfate;
    result.chloride += amount * salt.chloride;
    result.bicarbonate += amount * salt.bicarbonate;
  }
  
  return result;
}

/**
 * Calculate total deviation from target
 */
function calculateDeviation(
  achieved: WaterProfile,
  target: WaterProfile
): { deviations: Record<string, number>; total: number } {
  const deviations: Record<string, number> = {};
  let total = 0;
  
  const ions = ['calcium', 'magnesium', 'sodium', 'sulfate', 'chloride', 'bicarbonate'] as const;
  
  for (const ion of ions) {
    const diff = achieved[ion] - target[ion];
    deviations[ion] = diff;
    total += Math.abs(diff);
  }
  
  return { deviations, total };
}

/**
 * Exact optimization using iterative refinement
 */
export function optimizeExact(input: ExactOptimizationInput): ExactOptimizationResult {
  const {
    sourceWater,
    targetWater,
    maxIterations = 100,
    tolerance = 5,
    allowedSalts,
    maxSaltAmount = 10
  } = input;
  
  const warnings: string[] = [];
  const saltMatrix = buildSaltMatrix(allowedSalts);
  
  // Check if target is achievable
  const needed = {
    calcium: targetWater.calcium - sourceWater.calcium,
    magnesium: targetWater.magnesium - sourceWater.magnesium,
    sodium: targetWater.sodium - sourceWater.sodium,
    sulfate: targetWater.sulfate - sourceWater.sulfate,
    chloride: targetWater.chloride - sourceWater.chloride,
    bicarbonate: targetWater.bicarbonate - sourceWater.bicarbonate
  };
  
  // Check for impossible targets
  if (needed.calcium < 0 || needed.sulfate < 0 || needed.chloride < 0) {
    warnings.push('Cannot reduce ions below source water levels - dilution needed');
  }
  
  // Initialize salt amounts
  const saltAmounts: Record<string, number> = {};
  for (const salt of saltMatrix) {
    saltAmounts[salt.saltName] = 0;
  }
  
  // Iterative optimization
  let bestAmounts = { ...saltAmounts };
  let bestDeviation = Infinity;
  let iterations = 0;
  
  // Step 1: Quick initial approximation
  for (const salt of saltMatrix) {
    let maxContribution = 0;
    let limitingIon = '';
    
    // Find which ion limits this salt
    const ions = ['calcium', 'magnesium', 'sodium', 'sulfate', 'chloride', 'bicarbonate'] as const;
    for (const ion of ions) {
      const saltContribution = (salt as any)[ion];
      if (saltContribution > 0 && needed[ion] > 0) {
        const possibleAmount = needed[ion] / saltContribution;
        if (maxContribution === 0 || possibleAmount < maxContribution) {
          maxContribution = possibleAmount;
          limitingIon = ion;
        }
      }
    }
    
    if (maxContribution > 0) {
      // Start with 50% of max to avoid overshooting
      saltAmounts[salt.saltName] = Math.min(maxContribution * 0.5, maxSaltAmount);
    }
  }
  
  // Step 2: Refine with iterations
  const stepSizes = [1.0, 0.5, 0.2, 0.1, 0.05];
  
  for (const stepSize of stepSizes) {
    for (let iter = 0; iter < maxIterations / stepSizes.length; iter++) {
      iterations++;
      
      // Try adjusting each salt
      for (const salt of saltMatrix) {
        // Try increasing
        const testAmounts = { ...saltAmounts };
        testAmounts[salt.saltName] = Math.min(
          saltAmounts[salt.saltName] + stepSize,
          maxSaltAmount
        );
        
        const testProfile = calculateProfile(sourceWater, testAmounts, saltMatrix);
        const testDev = calculateDeviation(testProfile, targetWater);
        
        if (testDev.total < bestDeviation) {
          bestDeviation = testDev.total;
          bestAmounts = { ...testAmounts };
          saltAmounts[salt.saltName] = testAmounts[salt.saltName];
        }
        
        // Try decreasing
        if (saltAmounts[salt.saltName] > stepSize) {
          testAmounts[salt.saltName] = saltAmounts[salt.saltName] - stepSize;
          const testProfile2 = calculateProfile(sourceWater, testAmounts, saltMatrix);
          const testDev2 = calculateDeviation(testProfile2, targetWater);
          
          if (testDev2.total < bestDeviation) {
            bestDeviation = testDev2.total;
            bestAmounts = { ...testAmounts };
            saltAmounts[salt.saltName] = testAmounts[salt.saltName];
          }
        }
      }
      
      // Check if we're close enough
      if (bestDeviation < tolerance * 6) { // 6 ions * tolerance
        break;
      }
    }
  }
  
  // Round amounts to 0.1g
  for (const salt in bestAmounts) {
    bestAmounts[salt] = Math.round(bestAmounts[salt] * 10) / 10;
    if (bestAmounts[salt] < 0.1) {
      delete bestAmounts[salt];
    }
  }
  
  // Calculate final profile and deviations
  const achievedProfile = calculateProfile(sourceWater, bestAmounts, saltMatrix);
  const finalDev = calculateDeviation(achievedProfile, targetWater);
  
  // Generate warnings
  if (finalDev.total > tolerance * 12) {
    warnings.push('Could not achieve exact match - consider adjusting targets');
  }
  
  if (Object.keys(bestAmounts).length > 5) {
    warnings.push(`Using ${Object.keys(bestAmounts).length} different salts - consider simplifying`);
  }
  
  for (const [salt, amount] of Object.entries(bestAmounts)) {
    if (amount > 5) {
      warnings.push(`High amount of ${salt} (${amount}g) - may affect flavor`);
    }
  }
  
  // Check for ion imbalances
  const cationCharge = achievedProfile.calcium * 2 + achievedProfile.magnesium * 2 + achievedProfile.sodium;
  const anionCharge = achievedProfile.sulfate * 2 + achievedProfile.chloride + achievedProfile.bicarbonate;
  const chargeBalance = Math.abs(cationCharge - anionCharge);
  
  if (chargeBalance > 50) {
    warnings.push('Significant ion imbalance detected - verify water analysis');
  }
  
  return {
    salts: bestAmounts,
    achievedProfile,
    deviations: finalDev.deviations,
    totalDeviation: finalDev.total,
    iterations,
    warnings,
    impossible: finalDev.total > tolerance * 20
  };
}

/**
 * Find salt combination for exact ion target
 */
export function findExactCombination(
  targetIon: keyof WaterProfile,
  targetValue: number,
  sourceValue: number,
  allowedSalts?: string[]
): {
  combinations: Array<{ salts: Record<string, number>; exact: boolean }>;
  bestCombination: Record<string, number>;
} {
  const needed = targetValue - sourceValue;
  if (needed <= 0) {
    return {
      combinations: [],
      bestCombination: {}
    };
  }
  
  const saltMatrix = buildSaltMatrix(allowedSalts);
  const combinations: Array<{ salts: Record<string, number>; exact: boolean }> = [];
  
  // Find single salt solutions
  for (const salt of saltMatrix) {
    const contribution = (salt as any)[targetIon];
    if (contribution > 0) {
      const amount = needed / contribution;
      if (amount <= 10) {
        combinations.push({
          salts: { [salt.saltName]: Math.round(amount * 10) / 10 },
          exact: true
        });
      }
    }
  }
  
  // Find two-salt combinations if needed
  if (combinations.length === 0) {
    for (let i = 0; i < saltMatrix.length; i++) {
      for (let j = i + 1; j < saltMatrix.length; j++) {
        const salt1 = saltMatrix[i];
        const salt2 = saltMatrix[j];
        const contrib1 = (salt1 as any)[targetIon];
        const contrib2 = (salt2 as any)[targetIon];
        
        if (contrib1 > 0 && contrib2 > 0) {
          // Try different ratios
          for (let ratio = 0.2; ratio <= 0.8; ratio += 0.2) {
            const amount1 = (needed * ratio) / contrib1;
            const amount2 = (needed * (1 - ratio)) / contrib2;
            
            if (amount1 <= 5 && amount2 <= 5) {
              combinations.push({
                salts: {
                  [salt1.saltName]: Math.round(amount1 * 10) / 10,
                  [salt2.saltName]: Math.round(amount2 * 10) / 10
                },
                exact: false
              });
            }
          }
        }
      }
    }
  }
  
  // Select best combination (prefer single salt)
  const bestCombination = combinations.length > 0 ? combinations[0].salts : {};
  
  return {
    combinations,
    bestCombination
  };
}