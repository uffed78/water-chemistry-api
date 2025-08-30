import { Request, Response } from 'express';
import { 
  CalculationRequest, 
  CalculationResponse,
  WaterProfile,
  PHModel 
} from '../../core/types';
import { 
  calculateWaterProfileFromSalts,
  calculateResidualAlkalinity,
  calculateSulfateChlorideRatio,
  analyzeWaterProfile 
} from '../../models/water/ppm-calculator';
import { 
  distributeSalts, 
  distributeAcids,
  validateVolumes 
} from '../../models/water/volume-modes';
import { optimizeBalanced } from '../../models/optimization/balanced';
import { calculateSimplePH, calculateAcidNeeded } from '../../models/ph/simple';
import { calculateKaiserPH, calculateKaiserAcidAdditions } from '../../models/ph/kaiser';

/**
 * Auto calculation endpoint
 * Automatically calculates salt and acid additions to reach target profile
 */
export async function handleAutoCalculation(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const request = req.body as CalculationRequest;
    
    // Validate request
    const validation = validateRequest(request);
    if (!validation.valid) {
      res.status(400).json({
        error: 'Invalid request',
        details: validation.errors
      });
      return;
    }
    
    // Validate volumes
    const volumeValidation = validateVolumes(request.volumes);
    if (!volumeValidation.valid) {
      res.status(400).json({
        error: 'Invalid volumes',
        details: volumeValidation.errors
      });
      return;
    }
    
    // Determine target water profile
    let targetWater = request.targetWater;
    if (!targetWater && request.style) {
      // TODO: Load style-specific water profile
      // For now, use a default balanced profile
      targetWater = {
        calcium: 80,
        magnesium: 10,
        sodium: 25,
        sulfate: 150,
        chloride: 100,
        bicarbonate: 50
      };
    }
    
    if (!targetWater) {
      res.status(400).json({
        error: 'Target water profile or style is required'
      });
      return;
    }
    
    // Optimize salt additions
    const optimization = optimizeBalanced({
      sourceWater: request.sourceWater,
      targetWater,
      maxSalts: 4,
      tolerance: 0.1,
      preferredStyle: determineStyleFromProfile(targetWater)
    });
    
    // Calculate achieved water profile
    const achievedWater = calculateWaterProfileFromSalts(
      request.sourceWater,
      optimization.salts,
      request.volumes,
      request.options.volumeMode
    );
    
    // Calculate pH and acid additions
    const phResult = calculatePH(
      request.sourceWater,
      achievedWater,
      request.grainBill,
      request.options.phModel,
      request.volumes.mash
    );
    
    // Distribute salts and acids based on volume mode
    const saltDistribution = distributeSalts(
      optimization.salts,
      request.options.volumeMode
    );
    
    const acidDistribution = distributeAcids(
      phResult.acids,
      request.options.volumeMode
    );
    
    // Calculate water chemistry metrics
    const residualAlkalinity = calculateResidualAlkalinity(achievedWater);
    const sulfateChlorideRatio = calculateSulfateChlorideRatio(achievedWater);
    
    // Analyze water profile
    const analysis = analyzeWaterProfile(achievedWater);
    
    // Build response
    const response: CalculationResponse = {
      adjustments: {
        salts: [...saltDistribution.mash, ...saltDistribution.sparge, ...saltDistribution.boil],
        acids: [...acidDistribution.mash, ...acidDistribution.sparge],
        mash: {
          salts: saltDistribution.mash,
          acids: acidDistribution.mash
        },
        sparge: {
          salts: saltDistribution.sparge,
          acids: acidDistribution.sparge
        },
        boil: {
          salts: saltDistribution.boil
        }
      },
      achievedWater,
      predictions: {
        mashPH: phResult.finalPH,
        basePH: phResult.basePH,
        sourcePH: phResult.sourcePH,
        afterSaltsPH: phResult.afterSaltsPH,
        finalPH: phResult.finalPH,
        sulfateChlorideRatio,
        residualAlkalinity
      },
      analysis: {
        ...analysis,
        matchPercentage: optimization.matchPercentage
      }
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Auto calculation error:', error);
    res.status(500).json({
      error: 'Calculation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Calculate pH based on selected model
 */
function calculatePH(
  sourceWater: WaterProfile,
  achievedWater: WaterProfile,
  grainBill: any[],
  phModel: PHModel,
  mashVolume: number
): {
  basePH: number;
  sourcePH: number;
  afterSaltsPH: number;
  finalPH: number;
  acids: Record<string, number>;
} {
  const targetPH = 5.4; // Default target mash pH
  
  let afterSaltsPH: number;
  let acids: Record<string, number> = {};
  
  // Calculate pH based on selected model
  switch (phModel) {
    case 'kaiser':
      afterSaltsPH = calculateKaiserPH({
        sourceWater: achievedWater,
        grainBill,
        mashThickness: 3.0 // Default L/kg
      });
      
      if (afterSaltsPH > targetPH) {
        const acidNeeded = calculateKaiserAcidAdditions(
          afterSaltsPH,
          targetPH,
          grainBill,
          mashVolume
        );
        acids = { lactic_88: Math.round(acidNeeded.lacticAcid88 * 10) / 10 };
      }
      break;
      
    case 'simple':
    default:
      afterSaltsPH = calculateSimplePH({
        sourceWater: achievedWater,
        grainBill,
        mashThickness: 3.0
      });
      
      if (afterSaltsPH > targetPH) {
        const acidNeeded = calculateAcidNeeded(
          afterSaltsPH,
          targetPH,
          achievedWater.bicarbonate,
          mashVolume
        );
        acids = { lactic_88: Math.round(acidNeeded.lacticAcid88 * 10) / 10 };
      }
      break;
  }
  
  // Calculate base and source pH for reference
  const basePH = calculateSimplePH({
    sourceWater: { calcium: 0, magnesium: 0, sodium: 0, sulfate: 0, chloride: 0, bicarbonate: 0 },
    grainBill,
    mashThickness: 3.0
  });
  
  const sourcePH = calculateSimplePH({
    sourceWater,
    grainBill,
    mashThickness: 3.0
  });
  
  return {
    basePH,
    sourcePH,
    afterSaltsPH,
    finalPH: acids.lactic_88 > 0 ? targetPH : afterSaltsPH,
    acids
  };
}

/**
 * Determine style preference from water profile
 */
function determineStyleFromProfile(water: WaterProfile): 'hoppy' | 'balanced' | 'malty' {
  const ratio = water.chloride > 0 ? water.sulfate / water.chloride : 999;
  
  if (ratio > 2) return 'hoppy';
  if (ratio < 0.5) return 'malty';
  return 'balanced';
}

/**
 * Validate the auto calculation request
 */
function validateRequest(request: CalculationRequest): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // Check required fields
  if (!request.sourceWater) {
    errors.push('Source water profile is required');
  }
  
  if (!request.targetWater && !request.style) {
    errors.push('Either target water profile or style is required');
  }
  
  if (!request.volumes) {
    errors.push('Volumes are required');
  }
  
  if (!request.grainBill || request.grainBill.length === 0) {
    errors.push('Grain bill is required');
  }
  
  if (!request.options) {
    errors.push('Calculation options are required');
  } else {
    if (!request.options.volumeMode) {
      errors.push('Volume mode is required');
    }
    if (!request.options.phModel) {
      errors.push('pH model is required');
    }
  }
  
  // Validate water profile ions are non-negative
  if (request.sourceWater) {
    const ions = ['calcium', 'magnesium', 'sodium', 'sulfate', 'chloride', 'bicarbonate'];
    for (const ion of ions) {
      const value = (request.sourceWater as any)[ion];
      if (value < 0) {
        errors.push(`Source water ${ion} cannot be negative`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}