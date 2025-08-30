import { VolumeMode, Volumes, SaltAddition, AcidAddition } from '../../core/types';

/**
 * Volume mode handlers for different calculation approaches
 */

export interface VolumeDistribution {
  mash: {
    salts: string[];
    acids: string[];
  };
  sparge: {
    salts: string[];
    acids: string[];
  };
  boil: {
    salts: string[];
  };
}

/**
 * Get default distribution of salts and acids based on volume mode
 */
export function getDefaultDistribution(volumeMode: VolumeMode): VolumeDistribution {
  switch (volumeMode) {
    case 'mash':
      // All additions go to mash water (Bru'n Water standard)
      return {
        mash: {
          salts: ['all'],
          acids: ['all']
        },
        sparge: {
          salts: [],
          acids: []
        },
        boil: {
          salts: []
        }
      };
      
    case 'staged':
      // Intelligent distribution based on best practices
      return {
        mash: {
          // Salts that affect mash pH and enzyme activity
          salts: ['gypsum', 'calcium_chloride', 'calcium_carbonate', 'calcium_hydroxide'],
          // All mash acids
          acids: ['all']
        },
        sparge: {
          // Salts that can be added to sparge water
          salts: ['gypsum', 'calcium_chloride'],
          // Sparge acidification
          acids: ['lactic', 'phosphoric']
        },
        boil: {
          // Flavor salts that don't need to be in mash
          salts: ['sodium_chloride', 'epsom_salt']
        }
      };
      
    case 'total':
    default:
      // All additions calculated on total volume
      // Not recommended but included for compatibility
      return {
        mash: {
          salts: ['all'],
          acids: ['all']
        },
        sparge: {
          salts: [],
          acids: []
        },
        boil: {
          salts: []
        }
      };
  }
}

/**
 * Calculate effective volume for a given addition based on volume mode
 */
export function getEffectiveVolume(
  volumes: Volumes,
  volumeMode: VolumeMode,
  location: 'mash' | 'sparge' | 'boil'
): number {
  switch (volumeMode) {
    case 'mash':
      // Everything calculated on mash volume regardless of where it's added
      return volumes.mash;
      
    case 'staged':
      // Calculate based on actual location
      switch (location) {
        case 'mash':
          return volumes.mash;
        case 'sparge':
          return volumes.sparge;
        case 'boil':
          return volumes.total;
        default:
          return volumes.total;
      }
      
    case 'total':
    default:
      // Everything calculated on total volume
      return volumes.total;
  }
}

/**
 * Distribute salt additions across mash/sparge/boil based on volume mode
 */
export function distributeSalts(
  salts: Record<string, number>,
  volumeMode: VolumeMode,
  customDistribution?: VolumeDistribution
): {
  mash: SaltAddition[];
  sparge: SaltAddition[];
  boil: SaltAddition[];
} {
  const distribution = customDistribution || getDefaultDistribution(volumeMode);
  const result = {
    mash: [] as SaltAddition[],
    sparge: [] as SaltAddition[],
    boil: [] as SaltAddition[]
  };
  
  for (const [saltName, amount] of Object.entries(salts)) {
    if (amount === 0) continue;
    
    // Determine where this salt should go
    let targetLocation: 'mash' | 'sparge' | 'boil' = 'mash'; // default
    
    if (volumeMode === 'staged') {
      // Check each location's salt list
      if (distribution.mash.salts.includes(saltName) || distribution.mash.salts.includes('all')) {
        targetLocation = 'mash';
      } else if (distribution.sparge.salts.includes(saltName)) {
        targetLocation = 'sparge';
      } else if (distribution.boil.salts.includes(saltName)) {
        targetLocation = 'boil';
      }
    }
    
    // Add to appropriate location
    const addition: SaltAddition = {
      name: saltName,
      amount,
      targetVolume: targetLocation
    };
    
    switch (targetLocation) {
      case 'mash':
        result.mash.push(addition);
        break;
      case 'sparge':
        result.sparge.push(addition);
        break;
      case 'boil':
        result.boil.push(addition);
        break;
    }
  }
  
  return result;
}

/**
 * Distribute acid additions across mash/sparge based on volume mode
 */
export function distributeAcids(
  acids: Record<string, number>,
  volumeMode: VolumeMode,
  customDistribution?: VolumeDistribution
): {
  mash: AcidAddition[];
  sparge: AcidAddition[];
} {
  const distribution = customDistribution || getDefaultDistribution(volumeMode);
  const result = {
    mash: [] as AcidAddition[],
    sparge: [] as AcidAddition[]
  };
  
  for (const [acidName, amount] of Object.entries(acids)) {
    if (amount === 0) continue;
    
    // Extract concentration from acid name (e.g., "lactic_88" -> 88)
    const concentrationMatch = acidName.match(/_(\d+)$/);
    const concentration = concentrationMatch ? parseInt(concentrationMatch[1]) : 88;
    const baseAcidName = acidName.replace(/_\d+$/, '');
    
    // Determine where this acid should go
    let targetLocation: 'mash' | 'sparge' = 'mash'; // default
    
    if (volumeMode === 'staged' && distribution.sparge.acids.length > 0) {
      // In staged mode, check if this acid type can go to sparge
      if (distribution.sparge.acids.includes(baseAcidName) || distribution.sparge.acids.includes('all')) {
        // For staged mode, we might split acids between mash and sparge
        // For now, keep it simple - all to mash unless specified
        targetLocation = 'mash';
      }
    }
    
    // Add to appropriate location
    const addition: AcidAddition = {
      name: baseAcidName,
      amount,
      concentration,
      targetVolume: targetLocation
    };
    
    if (targetLocation === 'mash') {
      result.mash.push(addition);
    } else {
      result.sparge.push(addition);
    }
  }
  
  return result;
}

/**
 * Get explanation text for a volume mode
 */
export function getVolumeModeExplanation(volumeMode: VolumeMode): string {
  switch (volumeMode) {
    case 'mash':
      return 'All salt and acid additions are calculated based on mash volume. This is the standard method used by Bru\'n Water and gives higher ion concentrations.';
      
    case 'staged':
      return 'Salts and acids are distributed intelligently across mash, sparge, and boil based on their purpose. Calcium salts go to mash for enzyme activity, flavor salts can be added to boil.';
      
    case 'total':
      return 'All additions are calculated based on total water volume. This gives lower ion concentrations and is generally not recommended.';
      
    default:
      return 'Unknown volume mode';
  }
}

/**
 * Validate volumes for consistency
 */
export function validateVolumes(volumes: Volumes): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (volumes.mash <= 0) {
    errors.push('Mash volume must be greater than 0');
  }
  
  if (volumes.sparge < 0) {
    errors.push('Sparge volume cannot be negative');
  }
  
  if (volumes.total <= 0) {
    errors.push('Total volume must be greater than 0');
  }
  
  const calculatedTotal = volumes.mash + volumes.sparge;
  if (Math.abs(calculatedTotal - volumes.total) > 0.1) {
    errors.push(`Total volume (${volumes.total}L) should equal mash (${volumes.mash}L) + sparge (${volumes.sparge}L) = ${calculatedTotal}L`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}