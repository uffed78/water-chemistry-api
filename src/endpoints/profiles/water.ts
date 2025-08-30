import { Request, Response } from 'express';
import * as classicProfiles from '../../profiles/water/classic-profiles.json';

export interface WaterProfileData {
  id: string;
  name: string;
  country: string;
  calcium: number;
  magnesium: number;
  sodium: number;
  sulfate: number;
  chloride: number;
  bicarbonate: number;
  carbonate: number;
  ph: number;
  description: string;
  history: string;
  goodFor: string[];
  avoidFor: string[];
}

/**
 * Get all water profiles
 */
export async function getWaterProfiles(req: Request, res: Response): Promise<void> {
  try {
    const profiles = Object.values(classicProfiles).filter(p => p.id); // Filter out default export
    
    // Create summary list
    const summaries = profiles.map(profile => ({
      id: profile.id,
      name: profile.name,
      country: profile.country,
      description: profile.description,
      goodFor: profile.goodFor,
      ions: {
        calcium: profile.calcium,
        magnesium: profile.magnesium,
        sodium: profile.sodium,
        sulfate: profile.sulfate,
        chloride: profile.chloride,
        bicarbonate: profile.bicarbonate
      }
    }));
    
    res.json({
      profiles: summaries,
      count: summaries.length
    });
  } catch (error) {
    console.error('Error fetching water profiles:', error);
    res.status(500).json({
      error: 'Failed to fetch water profiles',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get a specific water profile by ID
 */
export async function getWaterProfile(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    
    const profile = (classicProfiles as any)[id];
    
    if (!profile) {
      res.status(404).json({
        error: 'Profile not found',
        id
      });
      return;
    }
    
    res.json(profile);
  } catch (error) {
    console.error('Error fetching water profile:', error);
    res.status(500).json({
      error: 'Failed to fetch water profile',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get recommended water profiles for a beer style
 */
export async function getProfilesForStyle(req: Request, res: Response): Promise<void> {
  try {
    const { style } = req.params;
    
    const profiles = Object.values(classicProfiles).filter(p => p.id);
    
    // Find profiles good for this style
    const recommended = profiles.filter(profile => 
      profile.goodFor.some(good => 
        good.toLowerCase().includes(style.toLowerCase())
      )
    );
    
    // Find profiles to avoid for this style
    const notRecommended = profiles.filter(profile =>
      profile.avoidFor.some(avoid =>
        avoid.toLowerCase().includes(style.toLowerCase())
      )
    );
    
    if (recommended.length === 0 && notRecommended.length === 0) {
      res.status(404).json({
        error: 'No profiles found for style',
        style
      });
      return;
    }
    
    res.json({
      style,
      recommended: recommended.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description
      })),
      avoid: notRecommended.map(p => ({
        id: p.id,
        name: p.name,
        reason: `High in minerals not suitable for ${style}`
      }))
    });
  } catch (error) {
    console.error('Error fetching profiles for style:', error);
    res.status(500).json({
      error: 'Failed to fetch profiles for style',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}