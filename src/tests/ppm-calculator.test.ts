import { describe, test, expect } from '@jest/globals';
import { 
  calculatePPM, 
  calculateWaterProfileFromSalts,
  calculateResidualAlkalinity,
  calculateSulfateChlorideRatio 
} from '../models/water/ppm-calculator';
import { VolumeMode, Volumes, WaterProfile } from '../core/types';

describe('PPM Calculations - Critical Fix Validation', () => {
  const testVolumes: Volumes = {
    total: 32.2,
    mash: 17,
    sparge: 15.2
  };
  
  describe('calculatePPM - Volume Mode Comparison', () => {
    test('Mash volume mode matches Bru\'n Water values', () => {
      // Example from Bru'n Water: 1.5g Gypsum in 17L mash water
      // Gypsum provides 232.5 ppm Ca per gram per liter
      const calciumPPM = calculatePPM(
        1.5,           // grams of gypsum
        232.5,         // PPM Ca per gram
        testVolumes,
        'mash'         // Volume mode
      );
      
      // Bru'n Water shows ~20.5 ppm Ca for this addition
      expect(calciumPPM).toBeCloseTo(20.5, 1);
    });
    
    test('Total volume mode gives lower concentration (old bug)', () => {
      // Same 1.5g Gypsum but calculated on total volume
      const calciumPPM = calculatePPM(
        1.5,
        232.5,
        testVolumes,
        'total'
      );
      
      // This would give ~10.8 ppm (about half of Bru'n Water)
      expect(calciumPPM).toBeCloseTo(10.8, 1);
    });
    
    test('Staged mode calculates based on addition location', () => {
      // Mash addition
      const mashPPM = calculatePPM(1.5, 232.5, testVolumes, 'staged', 'mash');
      expect(mashPPM).toBeCloseTo(20.5, 1);
      
      // Sparge addition
      const spargePPM = calculatePPM(1.5, 232.5, testVolumes, 'staged', 'sparge');
      expect(spargePPM).toBeCloseTo(22.9, 1);
      
      // Boil addition
      const boilPPM = calculatePPM(1.5, 232.5, testVolumes, 'staged', 'boil');
      expect(boilPPM).toBeCloseTo(10.8, 1);
    });
  });
  
  describe('Full Water Profile Calculations', () => {
    const roWater: WaterProfile = {
      calcium: 0,
      magnesium: 0,
      sodium: 0,
      sulfate: 0,
      chloride: 0,
      bicarbonate: 0
    };
    
    test('Multiple salt additions match Bru\'n Water profile', () => {
      // Example recipe from Bru'n Water
      const saltAdditions = {
        gypsum: 2.5,              // grams
        calcium_chloride: 1.2,    // grams
        epsom_salt: 0.5          // grams
      };
      
      const result = calculateWaterProfileFromSalts(
        roWater,
        saltAdditions,
        testVolumes,
        'mash'  // Use Bru'n Water standard
      );
      
      // Expected values from Bru'n Water (approximate)
      // Gypsum: 2.5g * 232.5 ppm Ca/g / 17L = 34.2 ppm Ca
      // CaCl2: 1.2g * 272.6 ppm Ca/g / 17L = 19.2 ppm Ca
      // Total Ca: 53.4 ppm ✓
      expect(result.calcium).toBeCloseTo(53.4, 1);
      
      // Gypsum: 2.5g * 557.7 ppm SO4/g / 17L = 82.0 ppm SO4
      // Epsom: 0.5g * 389.6 ppm SO4/g / 17L = 11.5 ppm SO4
      // Total SO4: 93.5 ppm
      expect(result.sulfate).toBeCloseTo(93.5, 1);
      
      // CaCl2: 1.2g * 482.3 ppm Cl/g / 17L = 34.0 ppm Cl
      expect(result.chloride).toBeCloseTo(34.0, 1);
      
      // Epsom: 0.5g * 98.6 ppm Mg/g / 17L = 2.9 ppm Mg
      expect(result.magnesium).toBeCloseTo(2.9, 1);
    });
    
    test('Burton water profile recreation', () => {
      // Recreate Burton-on-Trent from RO water
      const burtonSalts = {
        gypsum: 11.8,            // High sulfate
        calcium_chloride: 1.0,   // Some chloride
        epsom_salt: 3.3,        // Magnesium
        calcium_carbonate: 2.0,  // Alkalinity
        sodium_chloride: 0.5    // Small amount of sodium
      };
      
      const result = calculateWaterProfileFromSalts(
        roWater,
        burtonSalts,
        testVolumes,
        'mash'
      );
      
      // Should approximate Burton's high sulfate profile
      expect(result.calcium).toBeGreaterThan(200);
      expect(result.sulfate).toBeGreaterThan(450); // Adjusted for our volumes
      expect(result.sulfate / result.chloride).toBeGreaterThan(5); // Very hoppy
    });
  });
  
  describe('Residual Alkalinity Calculations', () => {
    test('RA calculation matches standard formula', () => {
      const water: WaterProfile = {
        calcium: 100,
        magnesium: 10,
        sodium: 20,
        sulfate: 150,
        chloride: 50,
        bicarbonate: 120
      };
      
      const ra = calculateResidualAlkalinity(water);
      
      // RA = Alkalinity - (Ca/1.4 + Mg/1.7)
      // Alkalinity = HCO3 * 50/61 = 120 * 0.82 = 98.4
      // RA = 98.4 - (100/1.4 + 10/1.7) = 98.4 - 77.3 = 21.1
      expect(ra).toBeCloseTo(21.0, 0);
    });
    
    test('High RA water (good for dark beers)', () => {
      const dublinWater: WaterProfile = {
        calcium: 118,
        magnesium: 4,
        sodium: 12,
        sulfate: 55,
        chloride: 19,
        bicarbonate: 160  // High bicarbonate
      };
      
      const ra = calculateResidualAlkalinity(dublinWater);
      expect(ra).toBeGreaterThan(40); // High RA suitable for stouts
    });
    
    test('Low RA water (good for pale beers)', () => {
      const pilsenWater: WaterProfile = {
        calcium: 7,
        magnesium: 2,
        sodium: 2,
        sulfate: 5,
        chloride: 5,
        bicarbonate: 15  // Very low bicarbonate
      };
      
      const ra = calculateResidualAlkalinity(pilsenWater);
      expect(ra).toBeLessThan(20); // Low RA suitable for pilsners
    });
  });
  
  describe('Sulfate to Chloride Ratio', () => {
    test('Hoppy profile (high sulfate)', () => {
      const hoppyWater: WaterProfile = {
        calcium: 100,
        magnesium: 10,
        sodium: 20,
        sulfate: 300,
        chloride: 75,
        bicarbonate: 50
      };
      
      const ratio = calculateSulfateChlorideRatio(hoppyWater);
      expect(ratio).toBe(4.0); // 300/75 = 4.0 (very hoppy)
    });
    
    test('Malty profile (high chloride)', () => {
      const maltyWater: WaterProfile = {
        calcium: 100,
        magnesium: 10,
        sodium: 30,
        sulfate: 50,
        chloride: 150,
        bicarbonate: 100
      };
      
      const ratio = calculateSulfateChlorideRatio(maltyWater);
      expect(ratio).toBeCloseTo(0.33, 2); // 50/150 = 0.33 (very malty)
    });
    
    test('Balanced profile', () => {
      const balancedWater: WaterProfile = {
        calcium: 80,
        magnesium: 10,
        sodium: 25,
        sulfate: 100,
        chloride: 100,
        bicarbonate: 75
      };
      
      const ratio = calculateSulfateChlorideRatio(balancedWater);
      expect(ratio).toBe(1.0); // Perfectly balanced
    });
  });
});