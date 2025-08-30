import { Request, Response } from 'express';
import { ValidationRequest, ValidationResponse, WaterProfile } from '../../core/types';
import { calculateWaterProfileFromSalts, analyzeWaterProfile } from '../../models/water/ppm-calculator';
import { calculateSimplePH } from '../../models/ph/simple';
import { ION_LIMITS, CHEMISTRY_CONSTANTS } from '../../core/constants';

/**
 * Validate a brewing recipe against best practices
 */
export async function validateRecipe(req: Request, res: Response): Promise<void> {
  try {
    const request = req.body as ValidationRequest;
    
    // Validate request
    if (!request.sourceWater || !request.plannedAdditions || !request.grainBill || !request.volumes) {
      res.status(400).json({
        error: 'Missing required fields',
        required: ['sourceWater', 'plannedAdditions', 'grainBill', 'volumes']
      });
      return;
    }
    
    const issues: ValidationResponse['issues'] = [];
    const predictions: ValidationResponse['predictions'] = {};
    
    // Calculate resulting water profile
    const achievedWater = calculateWaterProfileFromSalts(
      request.sourceWater,
      request.plannedAdditions.salts,
      request.volumes,
      'mash' // Default to mash volume mode
    );
    
    // Validate each concern
    if (request.concerns.includes('yeast_health')) {
      validateYeastHealth(achievedWater, issues, predictions);
    }
    
    if (request.concerns.includes('hop_utilization')) {
      validateHopUtilization(achievedWater, issues, predictions);
    }
    
    if (request.concerns.includes('mash_ph')) {
      validateMashPH(request.sourceWater, achievedWater, request.grainBill, issues, predictions);
    }
    
    if (request.concerns.includes('clarity')) {
      validateClarity(achievedWater, issues, predictions);
    }
    
    // General water chemistry validation
    validateGeneralChemistry(achievedWater, issues);
    
    // Check against target profile if provided
    if (request.targetProfile) {
      validateAgainstTarget(achievedWater, request.targetProfile, issues);
    }
    
    // Determine overall validity
    const hasErrors = issues.some(i => i.severity === 'error');
    
    const response: ValidationResponse = {
      valid: !hasErrors,
      issues,
      predictions
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({
      error: 'Validation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Validate water for yeast health
 */
function validateYeastHealth(
  water: WaterProfile,
  issues: ValidationResponse['issues'],
  predictions: ValidationResponse['predictions']
): void {
  // Calcium check
  if (water.calcium < 50) {
    issues.push({
      severity: 'error',
      message: `Calcium too low for yeast health (${water.calcium.toFixed(0)} ppm)`,
      suggestion: 'Add gypsum or calcium chloride to reach at least 50 ppm Ca'
    });
    predictions.fermentation = 'poor';
  } else if (water.calcium < 100) {
    issues.push({
      severity: 'warning',
      message: `Calcium is adequate but not optimal (${water.calcium.toFixed(0)} ppm)`,
      suggestion: 'Consider increasing to 100+ ppm for better yeast flocculation'
    });
    predictions.fermentation = 'good';
  } else {
    predictions.fermentation = 'excellent';
  }
  
  // Magnesium check
  if (water.magnesium < 5) {
    issues.push({
      severity: 'warning',
      message: `Low magnesium for yeast nutrition (${water.magnesium.toFixed(0)} ppm)`,
      suggestion: 'Add 0.5g Epsom salt per 5 gallons for 5-10 ppm Mg'
    });
  } else if (water.magnesium > 30) {
    issues.push({
      severity: 'warning',
      message: `High magnesium may taste bitter (${water.magnesium.toFixed(0)} ppm)`,
      suggestion: 'Keep magnesium below 30 ppm'
    });
  }
  
  // Zinc (not tracked but important)
  issues.push({
    severity: 'info',
    message: 'Consider adding yeast nutrient for zinc (0.2 ppm optimal)',
    suggestion: 'Add yeast nutrient at 10 min in boil'
  });
}

/**
 * Validate water for hop utilization
 */
function validateHopUtilization(
  water: WaterProfile,
  issues: ValidationResponse['issues'],
  predictions: ValidationResponse['predictions']
): void {
  // Sulfate levels
  if (water.sulfate < 50) {
    issues.push({
      severity: 'info',
      message: `Low sulfate for hop expression (${water.sulfate.toFixed(0)} ppm)`,
      suggestion: 'Add gypsum for crisp hop bitterness (target 150-300 ppm SO4)'
    });
  } else if (water.sulfate > 400) {
    issues.push({
      severity: 'warning',
      message: `Very high sulfate may be harsh (${water.sulfate.toFixed(0)} ppm)`,
      suggestion: 'Consider reducing sulfate below 400 ppm'
    });
  }
  
  // Sulfate:Chloride ratio
  const ratio = water.chloride > 0 ? water.sulfate / water.chloride : 999;
  if (ratio < 2) {
    issues.push({
      severity: 'info',
      message: `Low sulfate:chloride ratio for hoppy beer (${ratio.toFixed(1)})`,
      suggestion: 'Increase ratio to 2:1 or higher for hop-forward beers'
    });
  } else if (ratio > 7) {
    issues.push({
      severity: 'warning',
      message: `Very high sulfate:chloride ratio may be unbalanced (${ratio.toFixed(1)})`,
      suggestion: 'Consider adding some chloride for balance'
    });
  }
}

/**
 * Validate mash pH
 */
function validateMashPH(
  sourceWater: WaterProfile,
  achievedWater: WaterProfile,
  grainBill: any[],
  issues: ValidationResponse['issues'],
  predictions: ValidationResponse['predictions']
): void {
  // Calculate predicted pH
  const predictedPH = calculateSimplePH({
    sourceWater: achievedWater,
    grainBill,
    mashThickness: 3.0
  });
  
  if (predictedPH < CHEMISTRY_CONSTANTS.OPTIMAL_MASH_PH_MIN) {
    issues.push({
      severity: 'warning',
      message: `Predicted mash pH too low (${predictedPH.toFixed(2)})`,
      suggestion: 'Add baking soda or reduce acid additions'
    });
  } else if (predictedPH > CHEMISTRY_CONSTANTS.OPTIMAL_MASH_PH_MAX) {
    issues.push({
      severity: 'error',
      message: `Predicted mash pH too high (${predictedPH.toFixed(2)})`,
      suggestion: 'Add lactic or phosphoric acid to lower pH'
    });
  } else {
    issues.push({
      severity: 'info',
      message: `Predicted mash pH in range (${predictedPH.toFixed(2)})`
    });
  }
  
  // Check alkalinity
  if (achievedWater.bicarbonate > 200) {
    issues.push({
      severity: 'warning',
      message: `High alkalinity will raise mash pH (${achievedWater.bicarbonate.toFixed(0)} ppm)`,
      suggestion: 'Use acid to neutralize alkalinity'
    });
  }
}

/**
 * Validate for beer clarity
 */
function validateClarity(
  water: WaterProfile,
  issues: ValidationResponse['issues'],
  predictions: ValidationResponse['predictions']
): void {
  // Calcium for protein coagulation
  if (water.calcium < 50) {
    issues.push({
      severity: 'warning',
      message: `Low calcium for protein coagulation (${water.calcium.toFixed(0)} ppm)`,
      suggestion: 'Increase calcium to 50+ ppm for better hot break'
    });
    predictions.clarity = 'cloudy';
  } else if (water.calcium < 100) {
    predictions.clarity = 'clear';
  } else {
    predictions.clarity = 'brilliant';
  }
  
  // High sodium can affect clarity
  if (water.sodium > 150) {
    issues.push({
      severity: 'info',
      message: `High sodium may affect clarity (${water.sodium.toFixed(0)} ppm)`,
      suggestion: 'Keep sodium below 150 ppm'
    });
  }
}

/**
 * General water chemistry validation
 */
function validateGeneralChemistry(
  water: WaterProfile,
  issues: ValidationResponse['issues']
): void {
  // Total dissolved solids
  const tds = water.calcium + water.magnesium + water.sodium + 
              water.sulfate + water.chloride + water.bicarbonate;
  
  if (tds < 50) {
    issues.push({
      severity: 'warning',
      message: `Very soft water (${tds.toFixed(0)} ppm TDS)`,
      suggestion: 'May need mineral additions for most styles'
    });
  } else if (tds > 1000) {
    issues.push({
      severity: 'error',
      message: `Excessive minerals (${tds.toFixed(0)} ppm TDS)`,
      suggestion: 'Dilute with RO or distilled water'
    });
  }
  
  // Ion balance
  const cations = water.calcium * 2 + water.magnesium * 2 + water.sodium;
  const anions = water.sulfate * 2 + water.chloride + water.bicarbonate;
  const balance = Math.abs(cations - anions);
  
  if (balance > 100) {
    issues.push({
      severity: 'warning',
      message: 'Significant ion imbalance detected',
      suggestion: 'Verify water report accuracy'
    });
  }
  
  // Individual ion limits
  const ions = ['calcium', 'magnesium', 'sodium', 'sulfate', 'chloride', 'bicarbonate'] as const;
  for (const ion of ions) {
    const value = water[ion];
    const limits = ION_LIMITS[ion];
    
    if (limits) {
      if (value > limits.max) {
        issues.push({
          severity: 'warning',
          message: `${ion} exceeds recommended maximum (${value.toFixed(0)} > ${limits.max} ppm)`
        });
      }
    }
  }
}

/**
 * Validate against target profile
 */
function validateAgainstTarget(
  achieved: WaterProfile,
  targetName: string,
  issues: ValidationResponse['issues']
): void {
  // This would load the target profile and compare
  // For now, just add a note
  issues.push({
    severity: 'info',
    message: `Comparing against ${targetName} profile`,
    suggestion: 'Use auto-calculation for optimal salt additions'
  });
}