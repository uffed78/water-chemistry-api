import { describe, test, expect } from '@jest/globals';
import { 
  calculateDistilledWaterPH,
  calculateSimplePH,
  calculateRAPHShift
} from '../models/ph/simple';
import {
  calculateKaiserPH,
  calculateKaiserPHDetailed
} from '../models/ph/kaiser';
import { GrainBillItem, WaterProfile } from '../core/types';

describe('pH Models', () => {
  const baseGrainBill: GrainBillItem[] = [
    {
      name: 'Pilsner Malt',
      weight: 5.0,
      color: 3,
      type: 'base'
    }
  ];
  
  const mixedGrainBill: GrainBillItem[] = [
    {
      name: 'Pale Malt',
      weight: 4.5,
      color: 5,
      type: 'base'
    },
    {
      name: 'Crystal 60',
      weight: 0.5,
      color: 120,
      type: 'crystal'
    },
    {
      name: 'Chocolate Malt',
      weight: 0.2,
      color: 800,
      type: 'roasted'
    }
  ];
  
  const roWater: WaterProfile = {
    calcium: 0,
    magnesium: 0,
    sodium: 0,
    sulfate: 0,
    chloride: 0,
    bicarbonate: 0
  };
  
  const moderateWater: WaterProfile = {
    calcium: 50,
    magnesium: 10,
    sodium: 20,
    sulfate: 100,
    chloride: 50,
    bicarbonate: 100
  };
  
  describe('Simple pH Model', () => {
    test('Distilled water pH for base malts', () => {
      const ph = calculateDistilledWaterPH(baseGrainBill);
      expect(ph).toBeCloseTo(5.7, 1); // Base malts typically 5.6-5.8
    });
    
    test('Distilled water pH with dark malts', () => {
      const ph = calculateDistilledWaterPH(mixedGrainBill);
      expect(ph).toBeLessThanOrEqual(5.61); // Dark malts lower pH
    });
    
    test('RA effect on pH', () => {
      // Positive RA raises pH
      const shift1 = calculateRAPHShift(50, 3.0);
      expect(shift1).toBeGreaterThan(0);
      
      // Negative RA lowers pH
      const shift2 = calculateRAPHShift(-50, 3.0);
      expect(shift2).toBeLessThan(0);
    });
    
    test('Simple pH calculation with RO water', () => {
      const ph = calculateSimplePH({
        sourceWater: roWater,
        grainBill: baseGrainBill,
        mashThickness: 3.0
      });
      
      expect(ph).toBeCloseTo(5.7, 1); // Should be close to distilled water pH
    });
    
    test('Simple pH calculation with moderate alkalinity', () => {
      const ph = calculateSimplePH({
        sourceWater: moderateWater,
        grainBill: baseGrainBill,
        mashThickness: 3.0
      });
      
      expect(ph).toBeGreaterThan(5.7); // Alkalinity raises pH
      expect(ph).toBeLessThan(6.0); // But should stay reasonable
    });
  });
  
  describe('Kaiser pH Model', () => {
    test('Kaiser pH with RO water', () => {
      const ph = calculateKaiserPH({
        sourceWater: roWater,
        grainBill: baseGrainBill,
        mashThickness: 3.0,
        mashTemperature: 65
      });
      
      expect(ph).toBeCloseTo(5.6, 1); // Close to theoretical distilled water pH
    });
    
    test('Kaiser pH with alkaline water', () => {
      const ph = calculateKaiserPH({
        sourceWater: moderateWater,
        grainBill: baseGrainBill,
        mashThickness: 3.0,
        mashTemperature: 65
      });
      
      expect(ph).toBeGreaterThan(5.5);
      expect(ph).toBeLessThan(6.0);
    });
    
    test('Kaiser pH with mixed grain bill', () => {
      const ph = calculateKaiserPH({
        sourceWater: roWater,
        grainBill: mixedGrainBill,
        mashThickness: 3.0,
        mashTemperature: 65
      });
      
      // Dark malts should lower pH
      expect(ph).toBeLessThan(5.7);
      expect(ph).toBeGreaterThan(5.0);
    });
    
    test('Kaiser detailed calculation provides all components', () => {
      const result = calculateKaiserPHDetailed({
        sourceWater: moderateWater,
        grainBill: baseGrainBill,
        mashThickness: 3.0,
        mashTemperature: 65
      });
      
      expect(result.pH).toBeDefined();
      expect(result.details.distilledWaterPH).toBeCloseTo(5.7, 1);
      expect(result.details.bufferCapacity).toBeGreaterThan(0);
      expect(result.details.effectiveAlkalinity).toBeGreaterThan(0);
      expect(result.details.waterContribution).toBeDefined();
      expect(result.details.maltContribution).toBeDefined();
    });
    
    test('Mash thickness affects pH', () => {
      const thickPH = calculateKaiserPH({
        sourceWater: moderateWater,
        grainBill: baseGrainBill,
        mashThickness: 2.0, // Thick mash
        mashTemperature: 65
      });
      
      const thinPH = calculateKaiserPH({
        sourceWater: moderateWater,
        grainBill: baseGrainBill,
        mashThickness: 4.0, // Thin mash
        mashTemperature: 65
      });
      
      // Thicker mash should have more buffering
      expect(Math.abs(thickPH - 5.7)).toBeLessThan(Math.abs(thinPH - 5.7));
    });
  });
  
  describe('pH Model Comparison', () => {
    test('Simple and Kaiser models give similar results for basic scenarios', () => {
      const simplePH = calculateSimplePH({
        sourceWater: moderateWater,
        grainBill: baseGrainBill,
        mashThickness: 3.0
      });
      
      const kaiserPH = calculateKaiserPH({
        sourceWater: moderateWater,
        grainBill: baseGrainBill,
        mashThickness: 3.0,
        mashTemperature: 65
      });
      
      // Should be within 0.2 pH units
      expect(Math.abs(simplePH - kaiserPH)).toBeLessThan(0.2);
    });
    
    test('Models handle extreme water profiles', () => {
      const highAlkalinityWater: WaterProfile = {
        calcium: 100,
        magnesium: 20,
        sodium: 50,
        sulfate: 200,
        chloride: 100,
        bicarbonate: 300 // Very high
      };
      
      const simplePH = calculateSimplePH({
        sourceWater: highAlkalinityWater,
        grainBill: baseGrainBill,
        mashThickness: 3.0
      });
      
      const kaiserPH = calculateKaiserPH({
        sourceWater: highAlkalinityWater,
        grainBill: baseGrainBill,
        mashThickness: 3.0,
        mashTemperature: 65
      });
      
      // Both should show elevated pH
      expect(simplePH).toBeGreaterThan(5.8);
      expect(kaiserPH).toBeGreaterThan(5.8);
      
      // But should stay in reasonable range
      expect(simplePH).toBeLessThan(6.5);
      expect(kaiserPH).toBeLessThan(6.5);
    });
  });
});