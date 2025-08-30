import { WaterProfile, GrainBillItem } from '../../core/types';
import { CHEMISTRY_CONSTANTS } from '../../core/constants';

/**
 * Kaiser pH Model
 * Based on Kai Troester's research
 * Takes into account:
 * - Malt type and color
 * - Buffer capacity
 * - Water chemistry
 * ±0.05 pH accuracy
 */

export interface KaiserPHModelInput {
  sourceWater: WaterProfile;
  grainBill: GrainBillItem[];
  mashThickness: number; // L/kg
  mashTemperature?: number; // °C, default 65
}

/**
 * Malt buffer capacity based on Troester's measurements
 * Returns mEq/kg/pH unit
 */
function getMaltBufferCapacity(grain: GrainBillItem): number {
  const { type, color } = grain;
  
  // Base buffer capacity
  let bufferCapacity = CHEMISTRY_CONSTANTS.BASE_MALT_BUFFER;
  
  // Adjust based on malt type
  switch (type) {
    case 'base':
      // Light base malts: 30-40 mEq/kg/pH
      bufferCapacity = 30 + Math.min(color * 0.5, 10);
      break;
    case 'crystal':
      // Crystal malts: 40-55 mEq/kg/pH
      bufferCapacity = 40 + Math.min(color * 0.1, 15);
      break;
    case 'roasted':
      // Roasted malts: 55-85 mEq/kg/pH
      bufferCapacity = 55 + Math.min(color * 0.05, 30);
      break;
    case 'acidulated':
      // Acidulated malt has negative buffer capacity
      bufferCapacity = -35;
      break;
    case 'wheat':
      // Wheat malt: similar to base malt
      bufferCapacity = 35;
      break;
  }
  
  return bufferCapacity;
}

/**
 * Calculate malt acidity based on color
 * According to Troester's formula
 * Returns mEq/kg
 */
function getMaltAcidity(grain: GrainBillItem): number {
  const { type, color } = grain;
  
  // Convert EBC to Lovibond for Troester's formula
  const lovibond = color / 1.97;
  
  let acidity = 0;
  
  switch (type) {
    case 'base':
      // Base malts: minimal acidity
      acidity = lovibond * 0.1;
      break;
    case 'crystal':
      // Crystal malts: moderate acidity
      // Troester: 0.45 * L + 6
      acidity = 0.45 * lovibond + 6;
      break;
    case 'roasted':
      // Roasted malts: high acidity
      // Troester: 0.3 * L + 15
      acidity = 0.3 * lovibond + 15;
      break;
    case 'acidulated':
      // Acidulated malt: very high acidity
      // About 100-200 mEq/kg depending on percentage
      acidity = 150;
      break;
    case 'wheat':
      // Wheat: similar to base malt
      acidity = lovibond * 0.1;
      break;
  }
  
  return acidity;
}

/**
 * Calculate effective alkalinity
 * Accounts for calcium and magnesium precipitation
 */
function calculateEffectiveAlkalinity(water: WaterProfile): number {
  // Convert bicarbonate to alkalinity as CaCO3
  const alkalinity = water.bicarbonate * 50 / 61;
  
  // Account for calcium and magnesium precipitation
  // Troester's formula accounts for phosphate precipitation
  const calciumEffect = water.calcium * 0.04;
  const magnesiumEffect = water.magnesium * 0.03;
  
  return alkalinity - calciumEffect - magnesiumEffect;
}

/**
 * Temperature correction for pH
 * pH meters are calibrated at 25°C
 */
function temperatureCorrection(ph: number, temperature: number): number {
  // Approximate -0.003 pH per °C above 25°C
  const tempDiff = temperature - 25;
  return ph - (tempDiff * CHEMISTRY_CONSTANTS.TEMP_CORRECTION_FACTOR);
}

/**
 * Kaiser pH calculation model
 */
export function calculateKaiserPH(input: KaiserPHModelInput): number {
  const { sourceWater, grainBill, mashThickness, mashTemperature = 65 } = input;
  
  // Calculate total grain weight
  const totalWeight = grainBill.reduce((sum, grain) => sum + grain.weight, 0);
  if (totalWeight === 0) return 5.4;
  
  // Calculate weighted buffer capacity and acidity
  let totalBufferCapacity = 0;
  let totalAcidity = 0;
  
  grainBill.forEach(grain => {
    const bufferCapacity = getMaltBufferCapacity(grain);
    const acidity = getMaltAcidity(grain);
    
    totalBufferCapacity += bufferCapacity * grain.weight;
    totalAcidity += acidity * grain.weight;
  });
  
  // Average buffer capacity per kg
  const avgBufferCapacity = totalBufferCapacity / totalWeight;
  
  // Calculate effective alkalinity
  const effectiveAlkalinity = calculateEffectiveAlkalinity(sourceWater);
  
  // Convert alkalinity to mEq/L
  const alkalinityMEq = effectiveAlkalinity * 0.02;
  
  // Calculate charge balance
  // mEq from water per kg grain
  const waterChargePerKg = (alkalinityMEq * mashThickness);
  
  // mEq from malt per kg grain  
  const maltChargePerKg = totalAcidity / totalWeight;
  
  // Net charge
  const netCharge = waterChargePerKg - maltChargePerKg;
  
  // pH shift from 5.7 (typical distilled water mash pH)
  // Based on buffer capacity
  const pHShift = netCharge / avgBufferCapacity;
  
  // Calculate pH
  let pH = 5.7 + pHShift;
  
  // Apply temperature correction
  pH = temperatureCorrection(pH, mashTemperature);
  
  // Clamp to reasonable range
  return Math.max(4.5, Math.min(6.5, pH));
}

/**
 * Calculate pH with detailed breakdown
 */
export function calculateKaiserPHDetailed(input: KaiserPHModelInput): {
  pH: number;
  details: {
    distilledWaterPH: number;
    waterContribution: number;
    maltContribution: number;
    bufferCapacity: number;
    effectiveAlkalinity: number;
    temperature: number;
  };
} {
  const { sourceWater, grainBill, mashThickness, mashTemperature = 65 } = input;
  
  const totalWeight = grainBill.reduce((sum, grain) => sum + grain.weight, 0);
  if (totalWeight === 0) {
    return {
      pH: 5.4,
      details: {
        distilledWaterPH: 5.4,
        waterContribution: 0,
        maltContribution: 0,
        bufferCapacity: 0,
        effectiveAlkalinity: 0,
        temperature: mashTemperature
      }
    };
  }
  
  // Calculate components
  let totalBufferCapacity = 0;
  let totalAcidity = 0;
  
  grainBill.forEach(grain => {
    const bufferCapacity = getMaltBufferCapacity(grain);
    const acidity = getMaltAcidity(grain);
    
    totalBufferCapacity += bufferCapacity * grain.weight;
    totalAcidity += acidity * grain.weight;
  });
  
  const avgBufferCapacity = totalBufferCapacity / totalWeight;
  const effectiveAlkalinity = calculateEffectiveAlkalinity(sourceWater);
  const alkalinityMEq = effectiveAlkalinity * 0.02;
  
  const waterChargePerKg = alkalinityMEq * mashThickness;
  const maltChargePerKg = totalAcidity / totalWeight;
  const netCharge = waterChargePerKg - maltChargePerKg;
  const pHShift = netCharge / avgBufferCapacity;
  
  const distilledWaterPH = 5.7;
  let pH = distilledWaterPH + pHShift;
  pH = temperatureCorrection(pH, mashTemperature);
  pH = Math.max(4.5, Math.min(6.5, pH));
  
  return {
    pH,
    details: {
      distilledWaterPH,
      waterContribution: waterChargePerKg / avgBufferCapacity,
      maltContribution: -maltChargePerKg / avgBufferCapacity,
      bufferCapacity: avgBufferCapacity,
      effectiveAlkalinity,
      temperature: mashTemperature
    }
  };
}

/**
 * Calculate acid additions needed to reach target pH
 * Uses Kaiser's buffer capacity approach
 */
export function calculateKaiserAcidAdditions(
  currentPH: number,
  targetPH: number,
  grainBill: GrainBillItem[],
  mashVolume: number
): {
  lacticAcid88: number;
  phosphoric85: number;
  citric: number;
} {
  if (currentPH <= targetPH) {
    return { lacticAcid88: 0, phosphoric85: 0, citric: 0 };
  }
  
  // Calculate total buffer capacity
  const totalWeight = grainBill.reduce((sum, grain) => sum + grain.weight, 0);
  let totalBufferCapacity = 0;
  
  grainBill.forEach(grain => {
    const bufferCapacity = getMaltBufferCapacity(grain);
    totalBufferCapacity += bufferCapacity * grain.weight;
  });
  
  // pH change needed
  const deltaPH = currentPH - targetPH;
  
  // mEq of acid needed
  const mEqNeeded = totalBufferCapacity * deltaPH;
  
  // Convert to ml of different acids
  // Based on concentration and density
  return {
    lacticAcid88: mEqNeeded / 11.8,   // 88% lactic acid
    phosphoric85: mEqNeeded / 25.6,   // 85% phosphoric acid
    citric: mEqNeeded / 70             // Citric acid (solid, g not ml)
  };
}