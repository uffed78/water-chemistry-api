import { Request, Response } from 'express';
import * as beerStyles from '../../profiles/styles/beer-styles.json';

export interface StyleProfile {
  id: string;
  name: string;
  category: string;
  og: number[];
  fg: number[];
  ibu: number[];
  srm: number[];
  abv: number[];
  targetWater: {
    calcium: number[];
    magnesium: number[];
    sodium: number[];
    sulfate: number[];
    chloride: number[];
    bicarbonate: number[];
  };
  sulfateChlorideRatio: number[];
  targetMashPH: number[];
  notes: {
    water: string;
    salts: string;
    ph: string;
  };
}

/**
 * Get all style profiles
 */
export async function getStyleProfiles(req: Request, res: Response): Promise<void> {
  try {
    const profiles = Object.values(beerStyles).filter(p => p.id);
    
    const summaries = profiles.map(profile => ({
      id: profile.id,
      name: profile.name,
      category: profile.category,
      targetWater: profile.targetWater,
      sulfateChlorideRatio: profile.sulfateChlorideRatio,
      targetMashPH: profile.targetMashPH
    }));
    
    res.json({
      styles: summaries,
      count: summaries.length
    });
  } catch (error) {
    console.error('Error fetching style profiles:', error);
    res.status(500).json({
      error: 'Failed to fetch style profiles',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get a specific style profile
 */
export async function getStyleProfile(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    
    const profile = (beerStyles as any)[id];
    
    if (!profile) {
      res.status(404).json({
        error: 'Style profile not found',
        id
      });
      return;
    }
    
    res.json(profile);
  } catch (error) {
    console.error('Error fetching style profile:', error);
    res.status(500).json({
      error: 'Failed to fetch style profile',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get recommended water adjustments for a style
 */
export async function getStyleWaterRecommendations(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { sourceWater } = req.body;
    
    const style = (beerStyles as any)[id];
    
    if (!style) {
      res.status(404).json({
        error: 'Style profile not found',
        id
      });
      return;
    }
    
    // Generate recommendations based on style targets
    const recommendations: string[] = [];
    const warnings: string[] = [];
    
    // Check calcium
    const [caMin, caMax] = style.targetWater.calcium;
    if (sourceWater) {
      if (sourceWater.calcium < caMin) {
        recommendations.push(`Increase calcium to ${caMin}-${caMax} ppm (currently ${sourceWater.calcium} ppm)`);
        recommendations.push('Add gypsum or calcium chloride');
      } else if (sourceWater.calcium > caMax) {
        warnings.push(`Calcium is high for style (${sourceWater.calcium} ppm, target ${caMin}-${caMax} ppm)`);
        warnings.push('Consider dilution with RO water');
      }
      
      // Check sulfate:chloride ratio
      const ratio = sourceWater.chloride > 0 ? sourceWater.sulfate / sourceWater.chloride : 999;
      const [ratioMin, ratioMax] = style.sulfateChlorideRatio;
      
      if (ratio < ratioMin) {
        recommendations.push(`Increase sulfate:chloride ratio (currently ${ratio.toFixed(1)}, target ${ratioMin}-${ratioMax})`);
        recommendations.push('Add gypsum to increase sulfate');
      } else if (ratio > ratioMax) {
        recommendations.push(`Decrease sulfate:chloride ratio (currently ${ratio.toFixed(1)}, target ${ratioMin}-${ratioMax})`);
        recommendations.push('Add calcium chloride to increase chloride');
      }
      
      // Check bicarbonate
      const [hco3Min, hco3Max] = style.targetWater.bicarbonate;
      if (sourceWater.bicarbonate < hco3Min && style.category === 'Dark') {
        recommendations.push(`Increase alkalinity for dark malts (currently ${sourceWater.bicarbonate} ppm, target ${hco3Min}-${hco3Max} ppm)`);
        recommendations.push('Add baking soda or calcium carbonate');
      } else if (sourceWater.bicarbonate > hco3Max && style.category !== 'Dark') {
        warnings.push(`High alkalinity for pale beer (${sourceWater.bicarbonate} ppm, target ${hco3Min}-${hco3Max} ppm)`);
        warnings.push('Use acid to neutralize alkalinity');
      }
    }
    
    // Build response
    res.json({
      style: {
        id: style.id,
        name: style.name,
        category: style.category
      },
      targetWater: style.targetWater,
      sulfateChlorideRatio: style.sulfateChlorideRatio,
      targetMashPH: style.targetMashPH,
      notes: style.notes,
      recommendations,
      warnings
    });
  } catch (error) {
    console.error('Error generating style recommendations:', error);
    res.status(500).json({
      error: 'Failed to generate recommendations',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Find styles matching water profile
 */
export async function findStylesForWater(req: Request, res: Response): Promise<void> {
  try {
    const { waterProfile } = req.body;
    
    if (!waterProfile) {
      res.status(400).json({
        error: 'Water profile is required'
      });
      return;
    }
    
    const profiles = Object.values(beerStyles).filter(p => p.id);
    const matches: Array<{ style: any; matchScore: number; notes: string[] }> = [];
    
    for (const style of profiles) {
      let score = 100;
      const notes: string[] = [];
      
      // Check calcium
      const [caMin, caMax] = style.targetWater.calcium;
      if (waterProfile.calcium < caMin || waterProfile.calcium > caMax) {
        const deviation = waterProfile.calcium < caMin ? 
          (caMin - waterProfile.calcium) / caMin :
          (waterProfile.calcium - caMax) / caMax;
        score -= deviation * 20;
        if (deviation > 0.5) {
          notes.push(`Calcium outside range (${waterProfile.calcium} vs ${caMin}-${caMax} ppm)`);
        }
      }
      
      // Check sulfate:chloride ratio
      const ratio = waterProfile.chloride > 0 ? waterProfile.sulfate / waterProfile.chloride : 999;
      const [ratioMin, ratioMax] = style.sulfateChlorideRatio;
      
      if (ratio < ratioMin || ratio > ratioMax) {
        const targetRatio = (ratioMin + ratioMax) / 2;
        const deviation = Math.abs(ratio - targetRatio) / targetRatio;
        score -= deviation * 30;
        if (deviation > 0.5) {
          notes.push(`SO4:Cl ratio mismatch (${ratio.toFixed(1)} vs ${ratioMin}-${ratioMax})`);
        }
      }
      
      // Check bicarbonate
      const [hco3Min, hco3Max] = style.targetWater.bicarbonate;
      if (waterProfile.bicarbonate < hco3Min || waterProfile.bicarbonate > hco3Max) {
        const deviation = waterProfile.bicarbonate < hco3Min ?
          (hco3Min - waterProfile.bicarbonate) / (hco3Min + 1) :
          (waterProfile.bicarbonate - hco3Max) / (hco3Max + 1);
        score -= deviation * 15;
        if (deviation > 0.5) {
          notes.push(`Alkalinity mismatch (${waterProfile.bicarbonate} vs ${hco3Min}-${hco3Max} ppm)`);
        }
      }
      
      if (score > 50) {
        matches.push({
          style: {
            id: style.id,
            name: style.name,
            category: style.category
          },
          matchScore: Math.round(score),
          notes
        });
      }
    }
    
    // Sort by match score
    matches.sort((a, b) => b.matchScore - a.matchScore);
    
    res.json({
      waterProfile,
      matches: matches.slice(0, 10), // Top 10 matches
      bestMatch: matches[0] || null
    });
  } catch (error) {
    console.error('Error finding styles for water:', error);
    res.status(500).json({
      error: 'Failed to find matching styles',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}