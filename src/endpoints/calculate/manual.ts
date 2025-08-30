import { Request, Response } from 'express';
import { 
  ManualCalculationRequest, 
  CalculationResponse,
  WaterProfile 
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

/**
 * Manual calculation endpoint
 * User provides salt/acid amounts, API calculates resulting water profile
 */
export async function handleManualCalculation(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const request = req.body as ManualCalculationRequest;
    
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
    
    // Calculate achieved water profile
    const achievedWater = calculateWaterProfileFromSalts(
      request.sourceWater,
      request.additions.salts,
      request.volumes,
      request.options.volumeMode
    );
    
    // Distribute salts and acids based on volume mode
    const saltDistribution = distributeSalts(
      request.additions.salts,
      request.options.volumeMode
    );
    
    const acidDistribution = distributeAcids(
      request.additions.acids,
      request.options.volumeMode
    );
    
    // Calculate water chemistry metrics
    const residualAlkalinity = calculateResidualAlkalinity(achievedWater);
    const sulfateChlorideRatio = calculateSulfateChlorideRatio(achievedWater);
    
    // Analyze water profile
    const analysis = analyzeWaterProfile(achievedWater);
    
    // Calculate pH predictions (simplified for now - will be expanded with pH models)
    const predictions = {
      mashPH: calculateSimpleMashPH(
        request.sourceWater,
        achievedWater,
        request.grainBill,
        residualAlkalinity
      ),
      sulfateChlorideRatio,
      residualAlkalinity
    };
    
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
      predictions,
      analysis
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Manual calculation error:', error);
    res.status(500).json({
      error: 'Calculation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Validate the manual calculation request
 */
function validateRequest(request: ManualCalculationRequest): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // Check required fields
  if (!request.sourceWater) {
    errors.push('Source water profile is required');
  }
  
  if (!request.additions) {
    errors.push('Additions (salts and acids) are required');
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
  
  // Validate salt amounts are non-negative
  if (request.additions?.salts) {
    for (const [salt, amount] of Object.entries(request.additions.salts)) {
      if (amount < 0) {
        errors.push(`Salt amount for ${salt} cannot be negative`);
      }
    }
  }
  
  // Validate acid amounts are non-negative
  if (request.additions?.acids) {
    for (const [acid, amount] of Object.entries(request.additions.acids)) {
      if (amount < 0) {
        errors.push(`Acid amount for ${acid} cannot be negative`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Simple mash pH calculation
 * This is a placeholder - will be replaced with proper pH models
 */
function calculateSimpleMashPH(
  sourceWater: WaterProfile,
  achievedWater: WaterProfile,
  grainBill: any[],
  residualAlkalinity: number
): number {
  // Base pH from distilled water mash (typical for base malts)
  let basePH = 5.7;
  
  // Adjust for grain bill darkness
  const totalWeight = grainBill.reduce((sum, grain) => sum + grain.weight, 0);
  const weightedColor = grainBill.reduce((sum, grain) => {
    return sum + (grain.color * grain.weight / totalWeight);
  }, 0);
  
  // Darker grains lower pH
  basePH -= weightedColor * 0.001;
  
  // Adjust for residual alkalinity
  // Higher RA raises pH
  basePH += residualAlkalinity * 0.003;
  
  // Clamp to reasonable range
  return Math.max(4.5, Math.min(6.5, basePH));
}