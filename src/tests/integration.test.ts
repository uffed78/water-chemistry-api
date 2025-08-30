import { describe, test, expect } from '@jest/globals';
import { 
  calculateWaterProfileFromSalts,
  calculateResidualAlkalinity 
} from '../models/water/ppm-calculator';
import { optimizeBalanced } from '../models/optimization/balanced';
import { optimizeMinimal } from '../models/optimization/minimal';
import { optimizeExact } from '../models/optimization/exact';
import { calculateSimplePH } from '../models/ph/simple';
import { calculateKaiserPH } from '../models/ph/kaiser';
import { calculateAdvancedPH } from '../models/ph/advanced';
import { WaterProfile, GrainBillItem, Volumes } from '../core/types';

describe('Integration Tests - Full Calculation Flow', () => {
  const roWater: WaterProfile = {
    calcium: 0,
    magnesium: 0,
    sodium: 0,
    sulfate: 0,
    chloride: 0,
    bicarbonate: 0
  };
  
  const softWater: WaterProfile = {
    calcium: 20,
    magnesium: 5,
    sodium: 10,
    sulfate: 15,
    chloride: 10,
    bicarbonate: 30
  };
  
  const hardWater: WaterProfile = {
    calcium: 150,
    magnesium: 30,
    sodium: 50,
    sulfate: 200,
    chloride: 100,
    bicarbonate: 250
  };
  
  const volumes: Volumes = {
    total: 30,
    mash: 18,
    sparge: 12
  };
  
  const paleGrainBill: GrainBillItem[] = [
    { name: 'Pilsner', weight: 4.5, color: 3, type: 'base' },
    { name: 'Munich', weight: 0.5, color: 20, type: 'base' }
  ];
  
  const darkGrainBill: GrainBillItem[] = [
    { name: 'Pale Malt', weight: 4.0, color: 5, type: 'base' },
    { name: 'Crystal 80', weight: 0.5, color: 160, type: 'crystal' },
    { name: 'Chocolate', weight: 0.3, color: 800, type: 'roasted' }
  ];
  
  describe('Complete IPA Water Build', () => {
    const ipaTarget: WaterProfile = {
      calcium: 125,
      magnesium: 10,
      sodium: 25,
      sulfate: 300,
      chloride: 75,
      bicarbonate: 30
    };
    
    test('Build IPA water from RO using balanced optimizer', () => {
      // Optimize salts
      const optimization = optimizeBalanced({
        sourceWater: roWater,
        targetWater: ipaTarget,
        preferredStyle: 'hoppy'
      });
      
      // Calculate achieved water
      const achieved = calculateWaterProfileFromSalts(
        roWater,
        optimization.salts,
        volumes,
        'mash'
      );
      
      // Check key parameters
      expect(achieved.calcium).toBeGreaterThan(50); // Minimum for enzymes
      expect(achieved.sulfate / achieved.chloride).toBeGreaterThan(2); // Hoppy ratio
      expect(optimization.matchPercentage).toBeGreaterThan(60);
    });
    
    test('Calculate pH for IPA with all three models', () => {
      const salts = { gypsum: 8, calcium_chloride: 2 };
      const waterWithSalts = calculateWaterProfileFromSalts(
        roWater,
        salts,
        volumes,
        'mash'
      );
      
      const simplePH = calculateSimplePH({
        sourceWater: waterWithSalts,
        grainBill: paleGrainBill,
        mashThickness: 3.0
      });
      
      const kaiserPH = calculateKaiserPH({
        sourceWater: waterWithSalts,
        grainBill: paleGrainBill,
        mashThickness: 3.0,
        mashTemperature: 65
      });
      
      const advancedPH = calculateAdvancedPH({
        sourceWater: waterWithSalts,
        grainBill: paleGrainBill,
        mashThickness: 3.0,
        mashTemperature: 65
      });
      
      // All should be in reasonable range
      expect(simplePH).toBeGreaterThanOrEqual(5.0);
      expect(simplePH).toBeLessThanOrEqual(6.0);
      expect(kaiserPH).toBeGreaterThanOrEqual(5.0);
      expect(kaiserPH).toBeLessThanOrEqual(6.0);
      expect(advancedPH).toBeGreaterThanOrEqual(5.0);
      expect(advancedPH).toBeLessThanOrEqual(6.0);
      
      // Models should agree within 0.3 pH
      expect(Math.abs(simplePH - kaiserPH)).toBeLessThan(0.3);
      expect(Math.abs(kaiserPH - advancedPH)).toBeLessThan(0.3);
    });
  });
  
  describe('Complete Stout Water Build', () => {
    const stoutTarget: WaterProfile = {
      calcium: 120,
      magnesium: 10,
      sodium: 30,
      sulfate: 80,
      chloride: 50,
      bicarbonate: 150
    };
    
    test('Build stout water with alkalinity', () => {
      const optimization = optimizeBalanced({
        sourceWater: softWater,
        targetWater: stoutTarget,
        preferredStyle: 'malty'
      });
      
      const achieved = calculateWaterProfileFromSalts(
        softWater,
        optimization.salts,
        volumes,
        'mash'
      );
      
      // Check alkalinity for dark malts
      const ra = calculateResidualAlkalinity(achieved);
      expect(ra).toBeGreaterThan(0); // Positive RA for dark beers
      
      // Check malty ratio
      const ratio = achieved.sulfate / achieved.chloride;
      expect(ratio).toBeLessThan(2); // Malty profile
    });
    
    test('pH calculation for dark grains', () => {
      const waterWithAlkalinity: WaterProfile = {
        ...softWater,
        bicarbonate: 150
      };
      
      const simplePH = calculateSimplePH({
        sourceWater: waterWithAlkalinity,
        grainBill: darkGrainBill,
        mashThickness: 3.0
      });
      
      const kaiserPH = calculateKaiserPH({
        sourceWater: waterWithAlkalinity,
        grainBill: darkGrainBill,
        mashThickness: 3.0,
        mashTemperature: 65
      });
      
      // Dark grains should lower pH despite alkalinity
      expect(simplePH).toBeLessThan(5.8);
      expect(kaiserPH).toBeLessThan(5.8);
    });
  });
  
  describe('Optimizer Comparison', () => {
    const target: WaterProfile = {
      calcium: 100,
      magnesium: 10,
      sodium: 20,
      sulfate: 150,
      chloride: 100,
      bicarbonate: 50
    };
    
    test('Minimal optimizer uses fewer salts', () => {
      const minimal = optimizeMinimal({
        sourceWater: roWater,
        targetStyle: 'balanced',
        maxSalts: 2
      });
      
      expect(minimal.totalSalts).toBeLessThanOrEqual(2);
      expect(minimal.achievedProfile.calcium).toBeGreaterThanOrEqual(50);
    });
    
    test('Exact optimizer achieves closest match', () => {
      const exact = optimizeExact({
        sourceWater: roWater,
        targetWater: target,
        tolerance: 5,
        maxIterations: 100
      });
      
      // Should achieve very close match
      expect(exact.totalDeviation).toBeLessThan(100); // Total PPM deviation
      expect(exact.deviations.calcium).toBeLessThan(20);
      expect(exact.deviations.sulfate).toBeLessThan(30);
    });
    
    test('Balanced optimizer provides practical solution', () => {
      const balanced = optimizeBalanced({
        sourceWater: roWater,
        targetWater: target,
        preferredStyle: 'balanced'
      });
      
      // Should use 3-4 salts typically
      const saltCount = Object.keys(balanced.salts).length;
      expect(saltCount).toBeGreaterThanOrEqual(2);
      expect(saltCount).toBeLessThanOrEqual(4);
      
      // Should achieve reasonable match
      expect(balanced.matchPercentage).toBeGreaterThan(60);
    });
  });
  
  describe('Edge Cases and Validation', () => {
    test('Handle very soft water (near RO)', () => {
      const verySoftWater: WaterProfile = {
        calcium: 2,
        magnesium: 1,
        sodium: 2,
        sulfate: 3,
        chloride: 2,
        bicarbonate: 5
      };
      
      const optimization = optimizeMinimal({
        sourceWater: verySoftWater,
        targetStyle: 'hoppy',
        ensureCalcium: true
      });
      
      // Should add calcium
      expect(optimization.salts.gypsum).toBeGreaterThan(0);
      expect(optimization.achievedProfile.calcium).toBeGreaterThanOrEqual(50);
    });
    
    test('Handle very hard water', () => {
      const optimization = optimizeBalanced({
        sourceWater: hardWater,
        targetWater: {
          calcium: 100,
          magnesium: 10,
          sodium: 20,
          sulfate: 150,
          chloride: 50,
          bicarbonate: 50
        },
        preferredStyle: 'balanced'
      });
      
      // Should recognize dilution is needed
      expect(optimization.matchPercentage).toBeLessThan(80);
      
      // pH should still be calculable
      const ph = calculateSimplePH({
        sourceWater: hardWater,
        grainBill: paleGrainBill,
        mashThickness: 3.0
      });
      
      expect(ph).toBeGreaterThanOrEqual(5.0);
      expect(ph).toBeLessThanOrEqual(6.5);
    });
    
    test('Volume mode affects concentrations correctly', () => {
      const salts = { gypsum: 5 };
      
      const mashMode = calculateWaterProfileFromSalts(
        roWater,
        salts,
        volumes,
        'mash'
      );
      
      const totalMode = calculateWaterProfileFromSalts(
        roWater,
        salts,
        volumes,
        'total'
      );
      
      // Mash mode should give higher concentration
      expect(mashMode.calcium).toBeGreaterThan(totalMode.calcium);
      
      // Ratio should match volume ratio
      const volumeRatio = volumes.total / volumes.mash;
      const calciumRatio = mashMode.calcium / totalMode.calcium;
      expect(calciumRatio).toBeCloseTo(volumeRatio, 1);
    });
  });
  
  describe('Real-World Recipes', () => {
    test('American Pale Ale - Full calculation', () => {
      const source = softWater;
      const grainBill: GrainBillItem[] = [
        { name: 'Pale 2-row', weight: 4.5, color: 3, type: 'base' },
        { name: 'Crystal 40', weight: 0.5, color: 80, type: 'crystal' }
      ];
      
      // Target balanced-hoppy water
      const target: WaterProfile = {
        calcium: 100,
        magnesium: 10,
        sodium: 25,
        sulfate: 175,
        chloride: 75,
        bicarbonate: 40
      };
      
      // Optimize
      const optimization = optimizeBalanced({
        sourceWater: source,
        targetWater: target,
        preferredStyle: 'hoppy'
      });
      
      // Calculate water
      const achieved = calculateWaterProfileFromSalts(
        source,
        optimization.salts,
        volumes,
        'mash'
      );
      
      // Calculate pH
      const ph = calculateKaiserPH({
        sourceWater: achieved,
        grainBill,
        mashThickness: 3.0,
        mashTemperature: 65
      });
      
      // Validate results
      expect(achieved.calcium).toBeGreaterThanOrEqual(70);
      expect(achieved.calcium).toBeLessThanOrEqual(130);
      expect(achieved.sulfate / achieved.chloride).toBeGreaterThanOrEqual(1.5);
      expect(achieved.sulfate / achieved.chloride).toBeLessThanOrEqual(3);
      expect(ph).toBeGreaterThanOrEqual(5.2);
      expect(ph).toBeLessThanOrEqual(5.5);
      expect(optimization.matchPercentage).toBeGreaterThan(65);
    });
    
    test('German Pilsner - Soft water requirement', () => {
      const pilsnerTarget: WaterProfile = {
        calcium: 50,
        magnesium: 5,
        sodium: 5,
        sulfate: 30,
        chloride: 30,
        bicarbonate: 20
      };
      
      const grainBill: GrainBillItem[] = [
        { name: 'Pilsner', weight: 5.0, color: 2, type: 'base' }
      ];
      
      // Start with soft water
      const optimization = optimizeMinimal({
        sourceWater: softWater,
        targetStyle: 'balanced',
        ensureCalcium: true,
        maxSalts: 2
      });
      
      const achieved = calculateWaterProfileFromSalts(
        softWater,
        optimization.salts,
        volumes,
        'mash'
      );
      
      // Should maintain soft character
      const tds = achieved.calcium + achieved.magnesium + achieved.sodium +
                  achieved.sulfate + achieved.chloride + achieved.bicarbonate;
      expect(tds).toBeLessThan(200); // Keep TDS low for pilsner
      
      // pH should be appropriate for pale lager
      const ph = calculateSimplePH({
        sourceWater: achieved,
        grainBill,
        mashThickness: 3.0
      });
      
      expect(ph).toBeGreaterThanOrEqual(5.2);
      expect(ph).toBeLessThanOrEqual(5.5);
    });
  });
});