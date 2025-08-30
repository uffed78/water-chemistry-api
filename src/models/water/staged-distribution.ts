import { WaterProfile, SaltAddition, AcidAddition, Volumes } from '../../core/types';
import { SALTS, ION_LIMITS } from '../../core/constants';
import { calculateWaterProfileFromSalts } from './ppm-calculator';

/**
 * Advanced staged volume mode
 * Intelligently distributes salts and acids across mash, sparge, and boil
 * Based on brewing best practices and chemical requirements
 */

export interface StagedDistributionOptions {
  targetMashPH?: number;
  targetSpargePH?: number;
  spargeAcidification?: boolean;
  calciumMinimum?: number;
  avoidBoilMinerals?: boolean;
}

export interface StagedDistributionResult {
  mash: {
    salts: Record<string, number>;
    acids: Record<string, number>;
    waterProfile: WaterProfile;
    estimatedPH?: number;
  };
  sparge: {
    salts: Record<string, number>;
    acids: Record<string, number>;
    waterProfile: WaterProfile;
    estimatedPH?: number;
  };
  boil: {
    salts: Record<string, number>;
  };
  rationale: string[];
}

/**
 * Determine optimal distribution strategy based on water and grain
 */
export function determineDistributionStrategy(
  sourceWater: WaterProfile,
  targetWater: WaterProfile,
  volumes: Volumes,
  options: StagedDistributionOptions = {}
): StagedDistributionResult {
  const rationale: string[] = [];
  const result: StagedDistributionResult = {
    mash: {
      salts: {},
      acids: {},
      waterProfile: { ...sourceWater }
    },
    sparge: {
      salts: {},
      acids: {},
      waterProfile: { ...sourceWater }
    },
    boil: {
      salts: {}
    },
    rationale
  };

  // Calculate needed additions
  const needed = {
    calcium: targetWater.calcium - sourceWater.calcium,
    magnesium: targetWater.magnesium - sourceWater.magnesium,
    sodium: targetWater.sodium - sourceWater.sodium,
    sulfate: targetWater.sulfate - sourceWater.sulfate,
    chloride: targetWater.chloride - sourceWater.chloride,
    bicarbonate: targetWater.bicarbonate - sourceWater.bicarbonate
  };

  // Priority 1: Ensure minimum calcium in mash for enzyme activity
  const calciumMin = options.calciumMinimum || 50;
  if (sourceWater.calcium < calciumMin) {
    const calciumNeeded = calciumMin - sourceWater.calcium;
    rationale.push(`Adding calcium to mash to reach ${calciumMin} ppm minimum for enzyme activity`);
    
    // Decide between gypsum and calcium chloride based on sulfate:chloride target
    const sulfateChlorideRatio = targetWater.sulfate / targetWater.chloride;
    if (sulfateChlorideRatio > 2) {
      // Use gypsum for hoppy profile
      const gypsumNeeded = (calciumNeeded / SALTS.gypsum.ionsPPMPerGram.calcium!) * volumes.mash;
      result.mash.salts.gypsum = Math.round(gypsumNeeded * 10) / 10;
      rationale.push('Using gypsum for calcium (hoppy profile)');
    } else {
      // Use calcium chloride for balanced/malty profile
      const calciumChlorideNeeded = (calciumNeeded / SALTS.calcium_chloride.ionsPPMPerGram.calcium!) * volumes.mash;
      result.mash.salts.calcium_chloride = Math.round(calciumChlorideNeeded * 10) / 10;
      rationale.push('Using calcium chloride for calcium (balanced/malty profile)');
    }
  }

  // Priority 2: pH-affecting salts go to mash
  if (needed.bicarbonate > 0) {
    // Add alkalinity to mash for dark beers
    const bakingSodaNeeded = (needed.bicarbonate / SALTS.baking_soda.ionsPPMPerGram.bicarbonate!) * volumes.mash;
    result.mash.salts.baking_soda = Math.round(bakingSodaNeeded * 10) / 10;
    rationale.push('Adding baking soda to mash for alkalinity (dark beer)');
  }

  // Priority 3: Sulfate and chloride for flavor
  const remainingSulfate = Math.max(0, needed.sulfate - (result.mash.salts.gypsum || 0) * SALTS.gypsum.ionsPPMPerGram.sulfate! / volumes.mash);
  const remainingChloride = Math.max(0, needed.chloride - (result.mash.salts.calcium_chloride || 0) * SALTS.calcium_chloride.ionsPPMPerGram.chloride! / volumes.mash);

  if (remainingSulfate > 50) {
    // Split sulfate additions between mash and boil
    if (volumes.sparge > 0 && !options.avoidBoilMinerals) {
      const epsomSaltNeeded = (remainingSulfate / SALTS.epsom_salt.ionsPPMPerGram.sulfate!) * volumes.total;
      result.boil.salts.epsom_salt = Math.round(epsomSaltNeeded * 0.5 * 10) / 10;
      rationale.push('Adding Epsom salt to boil for sulfate (won\'t affect mash pH)');
    } else {
      const gypsumExtra = (remainingSulfate / SALTS.gypsum.ionsPPMPerGram.sulfate!) * volumes.mash;
      result.mash.salts.gypsum = (result.mash.salts.gypsum || 0) + Math.round(gypsumExtra * 10) / 10;
      rationale.push('Adding extra gypsum to mash for sulfate');
    }
  }

  if (remainingChloride > 25) {
    if (!options.avoidBoilMinerals) {
      const sodiumChlorideNeeded = (remainingChloride / SALTS.sodium_chloride.ionsPPMPerGram.chloride!) * volumes.total;
      result.boil.salts.sodium_chloride = Math.round(sodiumChlorideNeeded * 0.5 * 10) / 10;
      rationale.push('Adding salt to boil for chloride (won\'t affect mash pH)');
    } else {
      const cacl2Extra = (remainingChloride / SALTS.calcium_chloride.ionsPPMPerGram.chloride!) * volumes.mash;
      result.mash.salts.calcium_chloride = (result.mash.salts.calcium_chloride || 0) + Math.round(cacl2Extra * 10) / 10;
      rationale.push('Adding extra calcium chloride to mash for chloride');
    }
  }

  // Priority 4: Sparge water treatment
  if (volumes.sparge > 0) {
    // Add minimal calcium to sparge water
    if (sourceWater.calcium < 50) {
      const spargeCalciumNeeded = (50 - sourceWater.calcium) / SALTS.gypsum.ionsPPMPerGram.calcium! * volumes.sparge;
      result.sparge.salts.gypsum = Math.round(spargeCalciumNeeded * 10) / 10;
      rationale.push('Adding minimal gypsum to sparge for calcium');
    }

    // Sparge acidification
    if (options.spargeAcidification && options.targetSpargePH) {
      // Estimate acid needed for sparge pH
      const alkalinity = sourceWater.bicarbonate;
      if (alkalinity > 50) {
        // Rough estimate: 1ml 88% lactic per 10L for 50ppm alkalinity reduction
        const lacticNeeded = (alkalinity / 50) * (volumes.sparge / 10);
        result.sparge.acids.lactic_88 = Math.round(lacticNeeded * 10) / 10;
        rationale.push(`Acidifying sparge water to pH ${options.targetSpargePH}`);
      }
    }
  }

  // Calculate resulting water profiles
  result.mash.waterProfile = calculateWaterProfileFromSalts(
    sourceWater,
    result.mash.salts,
    { total: volumes.mash, mash: volumes.mash, sparge: 0 },
    'mash'
  );

  if (volumes.sparge > 0) {
    result.sparge.waterProfile = calculateWaterProfileFromSalts(
      sourceWater,
      result.sparge.salts,
      { total: volumes.sparge, mash: volumes.sparge, sparge: 0 },
      'mash'
    );
  }

  return result;
}

/**
 * Validate staged distribution
 */
export function validateStagedDistribution(
  distribution: StagedDistributionResult,
  targetWater: WaterProfile
): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check mash calcium
  if (distribution.mash.waterProfile.calcium < 50) {
    errors.push('Mash calcium below 50 ppm - enzyme activity may be affected');
  } else if (distribution.mash.waterProfile.calcium < 100) {
    warnings.push('Mash calcium below 100 ppm - consider increasing for better enzyme activity');
  }

  // Check if we're achieving target
  const finalCalcium = distribution.mash.waterProfile.calcium;
  const targetCalcium = targetWater.calcium;
  if (Math.abs(finalCalcium - targetCalcium) / targetCalcium > 0.2) {
    warnings.push(`Calcium deviation >20% from target (${finalCalcium} vs ${targetCalcium} ppm)`);
  }

  // Check total mineral content
  const totalMinerals = 
    distribution.mash.waterProfile.calcium +
    distribution.mash.waterProfile.magnesium +
    distribution.mash.waterProfile.sodium +
    distribution.mash.waterProfile.sulfate +
    distribution.mash.waterProfile.chloride;

  if (totalMinerals > 1000) {
    warnings.push('Very high total mineral content (>1000 ppm) - may taste minerally');
  } else if (totalMinerals < 100) {
    warnings.push('Very low total mineral content (<100 ppm) - may lack character');
  }

  // Check sparge water
  if (distribution.sparge.waterProfile.bicarbonate > 100 && !distribution.sparge.acids.lactic_88) {
    warnings.push('High sparge water alkalinity without acidification - risk of tannin extraction');
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors
  };
}

/**
 * Merge staged distribution back to single addition list
 * (for compatibility with existing code)
 */
export function mergeStagedToSingle(
  distribution: StagedDistributionResult
): {
  salts: SaltAddition[];
  acids: AcidAddition[];
} {
  const salts: SaltAddition[] = [];
  const acids: AcidAddition[] = [];

  // Add mash salts
  for (const [name, amount] of Object.entries(distribution.mash.salts)) {
    salts.push({ name, amount, targetVolume: 'mash' });
  }

  // Add sparge salts
  for (const [name, amount] of Object.entries(distribution.sparge.salts)) {
    salts.push({ name, amount, targetVolume: 'sparge' });
  }

  // Add boil salts
  for (const [name, amount] of Object.entries(distribution.boil.salts)) {
    salts.push({ name, amount, targetVolume: 'boil' });
  }

  // Add mash acids
  for (const [name, amount] of Object.entries(distribution.mash.acids)) {
    const concentration = name.includes('_') ? parseInt(name.split('_')[1]) : 88;
    acids.push({ 
      name: name.replace(/_\d+$/, ''), 
      amount, 
      concentration,
      targetVolume: 'mash' 
    });
  }

  // Add sparge acids
  for (const [name, amount] of Object.entries(distribution.sparge.acids)) {
    const concentration = name.includes('_') ? parseInt(name.split('_')[1]) : 88;
    acids.push({ 
      name: name.replace(/_\d+$/, ''), 
      amount, 
      concentration,
      targetVolume: 'sparge' 
    });
  }

  return { salts, acids };
}