import { WaterProfile, GrainBillItem } from '../../core/types';
import { calculateResidualAlkalinity } from '../water/ppm-calculator';

/**
 * Simple pH Model
 * Linear approximation based on residual alkalinity
 * Fast calculation with ±0.1 pH accuracy
 * Good for quick estimates
 */

export interface SimplePHModelInput {
  sourceWater: WaterProfile;
  grainBill: GrainBillItem[];
  mashThickness?: number; // L/kg, default 3.0
}

export interface PHPrediction {
  distilledWaterPH: number;  // pH with distilled water
  sourcePH: number;           // pH with source water (no salts)
  afterSaltsPH: number;       // pH after salt additions
  finalPH: number;            // Final pH after acid additions
}

/**
 * Calculate the base pH from grain bill only (distilled water mash)
 */
export function calculateDistilledWaterPH(grainBill: GrainBillItem[]): number {
  const totalWeight = grainBill.reduce((sum, grain) => sum + grain.weight, 0);
  if (totalWeight === 0) return 5.7; // Default for base malts
  
  // Calculate weighted average color
  const weightedColor = grainBill.reduce((sum, grain) => {
    return sum + (grain.color * grain.weight / totalWeight);
  }, 0);
  
  // Base pH for pale malts
  let basePH = 5.72;
  
  // Adjust for grain types
  grainBill.forEach(grain => {
    const proportion = grain.weight / totalWeight;
    
    switch (grain.type) {
      case 'roasted':
        // Roasted malts lower pH significantly
        basePH -= proportion * 0.3;
        break;
      case 'crystal':
        // Crystal malts lower pH moderately
        basePH -= proportion * 0.15;
        break;
      case 'acidulated':
        // Acidulated malt lowers pH (about 0.1 per 1%)
        basePH -= proportion * 1.0;
        break;
      case 'wheat':
        // Wheat raises pH slightly
        basePH += proportion * 0.05;
        break;
    }
  });
  
  // Additional color adjustment (darker = lower pH)
  // Approximately -0.02 pH per EBC
  basePH -= weightedColor * 0.002;
  
  return Math.max(4.5, Math.min(6.5, basePH));
}

/**
 * Calculate pH change from residual alkalinity
 * Based on Palmer's simplified formula
 */
export function calculateRAPHShift(
  residualAlkalinity: number,
  mashThickness: number = 3.0
): number {
  // Higher RA raises pH
  // Thicker mash (lower L/kg) = more buffering = less pH change
  // Approximately 0.003 pH per ppm RA at 3 L/kg
  const thicknessAdjustment = 3.0 / mashThickness;
  return residualAlkalinity * 0.003 * thicknessAdjustment;
}

/**
 * Simple pH calculation model
 */
export function calculateSimplePH(
  input: SimplePHModelInput
): number {
  const { sourceWater, grainBill, mashThickness = 3.0 } = input;
  
  // Step 1: Calculate base pH from grain bill
  const distilledWaterPH = calculateDistilledWaterPH(grainBill);
  
  // Step 2: Calculate residual alkalinity
  const ra = calculateResidualAlkalinity(sourceWater);
  
  // Step 3: Calculate pH shift from RA
  const raShift = calculateRAPHShift(ra, mashThickness);
  
  // Step 4: Final pH
  const finalPH = distilledWaterPH + raShift;
  
  return Math.max(4.5, Math.min(6.5, finalPH));
}

/**
 * Calculate full pH progression
 */
export function calculatePHProgression(
  sourceWater: WaterProfile,
  waterAfterSalts: WaterProfile,
  grainBill: GrainBillItem[],
  mashThickness: number = 3.0
): PHPrediction {
  // pH with distilled water
  const distilledWaterPH = calculateDistilledWaterPH(grainBill);
  
  // pH with source water (before salts)
  const sourceRA = calculateResidualAlkalinity(sourceWater);
  const sourceShift = calculateRAPHShift(sourceRA, mashThickness);
  const sourcePH = distilledWaterPH + sourceShift;
  
  // pH after salt additions
  const saltsRA = calculateResidualAlkalinity(waterAfterSalts);
  const saltsShift = calculateRAPHShift(saltsRA, mashThickness);
  const afterSaltsPH = distilledWaterPH + saltsShift;
  
  // For simple model, final pH is same as after salts
  // (acid calculations would be done separately)
  const finalPH = afterSaltsPH;
  
  return {
    distilledWaterPH,
    sourcePH,
    afterSaltsPH,
    finalPH
  };
}

/**
 * Calculate acid needed to reach target pH
 * Simplified calculation based on alkalinity
 */
export function calculateAcidNeeded(
  currentPH: number,
  targetPH: number,
  alkalinity: number,
  mashVolume: number
): {
  lacticAcid88: number;  // ml
  phosphoric85: number;  // ml
} {
  if (currentPH <= targetPH) {
    return { lacticAcid88: 0, phosphoric85: 0 };
  }
  
  // pH units to reduce
  const phDrop = currentPH - targetPH;
  
  // Approximate mEq of acid needed
  // Based on alkalinity and pH drop
  const mEqNeeded = (alkalinity * 0.02 + phDrop * 50) * mashVolume;
  
  // Convert to ml of acid
  // Lactic acid 88%: ~11.8 mEq/ml
  // Phosphoric acid 85%: ~25.6 mEq/ml
  
  return {
    lacticAcid88: mEqNeeded / 11.8,
    phosphoric85: mEqNeeded / 25.6
  };
}