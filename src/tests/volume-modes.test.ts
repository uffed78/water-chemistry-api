import { describe, test, expect } from '@jest/globals';
import {
  getEffectiveVolume,
  distributeSalts,
  distributeAcids,
  validateVolumes,
  getDefaultDistribution
} from '../models/water/volume-modes';
import { Volumes } from '../core/types';

describe('Volume Modes', () => {
  const testVolumes: Volumes = {
    total: 30,
    mash: 18,
    sparge: 12
  };
  
  describe('getEffectiveVolume', () => {
    test('Mash mode always returns mash volume', () => {
      expect(getEffectiveVolume(testVolumes, 'mash', 'mash')).toBe(18);
      expect(getEffectiveVolume(testVolumes, 'mash', 'sparge')).toBe(18);
      expect(getEffectiveVolume(testVolumes, 'mash', 'boil')).toBe(18);
    });
    
    test('Total mode always returns total volume', () => {
      expect(getEffectiveVolume(testVolumes, 'total', 'mash')).toBe(30);
      expect(getEffectiveVolume(testVolumes, 'total', 'sparge')).toBe(30);
      expect(getEffectiveVolume(testVolumes, 'total', 'boil')).toBe(30);
    });
    
    test('Staged mode returns location-specific volume', () => {
      expect(getEffectiveVolume(testVolumes, 'staged', 'mash')).toBe(18);
      expect(getEffectiveVolume(testVolumes, 'staged', 'sparge')).toBe(12);
      expect(getEffectiveVolume(testVolumes, 'staged', 'boil')).toBe(30);
    });
  });
  
  describe('distributeSalts', () => {
    const testSalts = {
      gypsum: 2.0,
      calcium_chloride: 1.5,
      epsom_salt: 0.5,
      sodium_chloride: 0.3
    };
    
    test('Mash mode puts all salts in mash', () => {
      const result = distributeSalts(testSalts, 'mash');
      
      expect(result.mash).toHaveLength(4);
      expect(result.sparge).toHaveLength(0);
      expect(result.boil).toHaveLength(0);
      
      expect(result.mash.find(s => s.name === 'gypsum')?.amount).toBe(2.0);
    });
    
    test('Staged mode distributes salts intelligently', () => {
      const result = distributeSalts(testSalts, 'staged');
      
      // Calcium salts should go to mash
      expect(result.mash.find(s => s.name === 'gypsum')).toBeDefined();
      expect(result.mash.find(s => s.name === 'calcium_chloride')).toBeDefined();
      
      // Flavor salts can go to boil
      expect(result.boil.find(s => s.name === 'epsom_salt')).toBeDefined();
      expect(result.boil.find(s => s.name === 'sodium_chloride')).toBeDefined();
    });
    
    test('Zero amounts are filtered out', () => {
      const saltsWithZero = {
        gypsum: 2.0,
        calcium_chloride: 0,
        epsom_salt: 0.5
      };
      
      const result = distributeSalts(saltsWithZero, 'mash');
      expect(result.mash).toHaveLength(2); // Only non-zero salts
    });
  });
  
  describe('distributeAcids', () => {
    const testAcids = {
      lactic_88: 3.5,
      phosphoric_85: 2.0
    };
    
    test('Extracts concentration from acid name', () => {
      const result = distributeAcids(testAcids, 'mash');
      
      const lacticAcid = result.mash.find(a => a.name === 'lactic');
      expect(lacticAcid?.concentration).toBe(88);
      
      const phosphoricAcid = result.mash.find(a => a.name === 'phosphoric');
      expect(phosphoricAcid?.concentration).toBe(85);
    });
    
    test('Mash mode puts all acids in mash', () => {
      const result = distributeAcids(testAcids, 'mash');
      
      expect(result.mash).toHaveLength(2);
      expect(result.sparge).toHaveLength(0);
    });
    
    test('Handles acids without concentration suffix', () => {
      const acids = {
        lactic: 2.0,  // No concentration suffix
        phosphoric_85: 1.5
      };
      
      const result = distributeAcids(acids, 'mash');
      
      const lacticAcid = result.mash.find(a => a.name === 'lactic');
      expect(lacticAcid?.concentration).toBe(88); // Default concentration
    });
  });
  
  describe('validateVolumes', () => {
    test('Valid volumes pass validation', () => {
      const valid: Volumes = {
        total: 30,
        mash: 18,
        sparge: 12
      };
      
      const result = validateVolumes(valid);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    test('Negative mash volume fails', () => {
      const invalid: Volumes = {
        total: 30,
        mash: -5,
        sparge: 35
      };
      
      const result = validateVolumes(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Mash volume must be greater than 0');
    });
    
    test('Mismatched total fails', () => {
      const invalid: Volumes = {
        total: 25,  // Should be 30
        mash: 18,
        sparge: 12
      };
      
      const result = validateVolumes(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('should equal');
    });
    
    test('No-sparge setup is valid', () => {
      const noSparge: Volumes = {
        total: 25,
        mash: 25,
        sparge: 0
      };
      
      const result = validateVolumes(noSparge);
      expect(result.valid).toBe(true);
    });
  });
  
  describe('getDefaultDistribution', () => {
    test('Mash mode puts everything in mash', () => {
      const dist = getDefaultDistribution('mash');
      
      expect(dist.mash.salts).toContain('all');
      expect(dist.mash.acids).toContain('all');
      expect(dist.sparge.salts).toHaveLength(0);
      expect(dist.sparge.acids).toHaveLength(0);
    });
    
    test('Staged mode has intelligent distribution', () => {
      const dist = getDefaultDistribution('staged');
      
      // Calcium salts in mash
      expect(dist.mash.salts).toContain('gypsum');
      expect(dist.mash.salts).toContain('calcium_chloride');
      
      // Sparge can have some salts
      expect(dist.sparge.salts.length).toBeGreaterThan(0);
      
      // Flavor salts in boil
      expect(dist.boil.salts).toContain('sodium_chloride');
      expect(dist.boil.salts).toContain('epsom_salt');
    });
  });
});