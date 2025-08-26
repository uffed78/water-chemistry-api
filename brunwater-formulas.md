# Bru'n Water Complete Formulas and Calculations

## Overview
This document contains ALL formulas and calculations from Bru'n Water 1.25, extracted and verified for implementation in the water chemistry API.

---

## 1. ION CONTRIBUTIONS FROM SALTS

### Ion contribution formula
```
PPM increase = (grams_of_salt / liters_of_water) * ion_contribution_factor
```

### Salt Ion Contribution Factors (mg/L per gram in 1L)

| Salt | Formula | Ca²⁺ | Mg²⁺ | Na⁺ | SO₄²⁻ | Cl⁻ | HCO₃⁻ |
|------|---------|------|------|-----|-------|-----|--------|
| Gypsum | CaSO₄·2H₂O | 232.5 | 0 | 0 | 557.7 | 0 | 0 |
| Calcium Chloride (dihydrate) | CaCl₂·2H₂O | 272.0 | 0 | 0 | 0 | 482.0 | 0 |
| Epsom Salt | MgSO₄·7H₂O | 0 | 98.6 | 0 | 389.5 | 0 | 0 |
| Magnesium Chloride | MgCl₂·6H₂O | 0 | 119.5 | 0 | 0 | 348.5 | 0 |
| Table Salt | NaCl | 0 | 0 | 393.3 | 0 | 606.7 | 0 |
| Baking Soda | NaHCO₃ | 0 | 0 | 273.6 | 0 | 0 | 726.4 |
| Chalk | CaCO₃ | 400.4 | 0 | 0 | 0 | 0 | 1219.2* |
| Pickling Lime | Ca(OH)₂ | 540.8 | 0 | 0 | 0 | 0 | 0** |

*Chalk converts to bicarbonate in water at brewing pH
**Pickling lime adds hydroxide which affects alkalinity

### Molecular Weight Factors
```javascript
// For converting between different units
const molecularWeights = {
  Ca: 40.08,
  Mg: 24.31,
  Na: 22.99,
  K: 39.10,
  SO4: 96.06,
  Cl: 35.45,
  HCO3: 61.02,
  CO3: 60.01,
  CaCO3: 100.09  // For alkalinity as CaCO3
}
```

---

## 2. WATER CALCULATIONS

### 2.1 Residual Alkalinity (RA)
```
// Kolbach's formula
RA_as_CaCO3 = Alkalinity_as_CaCO3 - (Ca_ppm / 1.4) - (Mg_ppm / 1.7)

// Where:
Alkalinity_as_CaCO3 = HCO3_ppm * 0.82 + CO3_ppm * 1.22
```

### 2.2 Ion Balance Check
```
// For water profile validation (should be within ±5%)
Cation_mEq = Ca_ppm/20.04 + Mg_ppm/12.15 + Na_ppm/22.99 + K_ppm/39.10

Anion_mEq = HCO3_ppm/61.02 + CO3_ppm/30.01 + SO4_ppm/48.03 + Cl_ppm/35.45 + NO3_ppm/62.01

Balance_% = ((Cation_mEq - Anion_mEq) / (Cation_mEq + Anion_mEq)) * 100
```

### 2.3 Sulfate to Chloride Ratio
```
SO4_Cl_Ratio = SO4_ppm / Cl_ppm

// Interpretation:
< 0.5    = Very malty
0.5-1.0  = Malty
1.0-2.0  = Balanced
2.0-5.0  = Hoppy
> 5.0    = Very hoppy
```

### 2.4 Total Hardness
```
// As CaCO3
Total_Hardness = Ca_ppm * 2.5 + Mg_ppm * 4.1

// Temporary Hardness (carbonate hardness)
Temp_Hardness = HCO3_ppm * 0.82 + CO3_ppm * 1.22

// Permanent Hardness (non-carbonate)
Perm_Hardness = Total_Hardness - Temp_Hardness
```

### 2.5 Effective Hardness
```
Effective_Hardness = Ca_ppm + Mg_ppm
```

---

## 3. MASH pH CALCULATIONS (Bru'n Water Model)

### 3.1 Grain pH Contributions

#### Base Malt pH Values (in distilled water)
| Malt Type | Color (SRM) | DI Water pH | Buffer Capacity (mEq/kg) |
|-----------|-------------|-------------|---------------------------|
| Pilsner | 1.5-2.0 | 5.72 | 35.4 |
| Pale Ale | 2.5-3.5 | 5.68 | 37.2 |
| Maris Otter | 3.0-4.0 | 5.65 | 38.1 |
| Vienna | 3.5-4.5 | 5.58 | 36.8 |
| Munich | 7-10 | 5.54 | 38.5 |
| Wheat | 1.8-2.3 | 5.95 | 31.2 |

#### Crystal/Caramel Malt pH Values
| Malt Type | Color (SRM) | DI Water pH | Buffer Capacity | Acidity (mEq/kg) |
|-----------|-------------|-------------|-----------------|-------------------|
| Crystal 20 | 20 | 4.65 | 45.2 | 62 |
| Crystal 40 | 40 | 4.58 | 48.5 | 72 |
| Crystal 60 | 60 | 4.52 | 51.2 | 85 |
| Crystal 80 | 80 | 4.48 | 53.8 | 95 |
| Crystal 120 | 120 | 4.42 | 58.4 | 112 |

#### Roasted Malt pH Values
| Malt Type | Color (SRM) | DI Water pH | Buffer Capacity | Acidity (mEq/kg) |
|-----------|-------------|-------------|-----------------|-------------------|
| Chocolate | 350-450 | 4.31 | 71.5 | 165 |
| Roasted Barley | 450-550 | 4.24 | 85.2 | 215 |
| Black Malt | 500-600 | 4.18 | 92.4 | 245 |

### 3.2 Bru'n Water pH Prediction Algorithm

```javascript
function calculateMashPH_BrunWater(water, grainBill, mashVolumeLiters) {
  // Step 1: Calculate weighted grain pH
  let totalGrainKg = sum(grainBill.amountKg)
  let weightedGrainPH = 0
  let totalBufferCapacity = 0
  let totalGrainAcidity = 0
  
  for (grain of grainBill) {
    let grainFraction = grain.amountKg / totalGrainKg
    let grainData = lookupGrainPH(grain)
    
    weightedGrainPH += grainData.diWaterPH * grainFraction
    totalBufferCapacity += grainData.bufferCapacity * grain.amountKg
    totalGrainAcidity += grainData.acidity * grain.amountKg
  }
  
  // Step 2: Calculate water alkalinity contribution
  let alkalinityAsCaCO3 = water.bicarbonate * 0.82
  let totalAlkalinityMEq = (alkalinityAsCaCO3 * mashVolumeLiters) / 50
  
  // Step 3: Calculate mash thickness factor
  let mashThickness = mashVolumeLiters / totalGrainKg  // L/kg
  let thicknessFactor = 1 + (mashThickness - 2.7) * 0.045
  
  // Step 4: Iterative pH calculation (10 iterations)
  let pH = weightedGrainPH  // Starting estimate
  
  for (i = 0; i < 10; i++) {
    // Henderson-Hasselbalch for bicarbonate system
    let h_concentration = 10^(-pH)
    let Ka1 = 4.45e-7  // First dissociation constant of carbonic acid
    
    // Fraction of bicarbonate at current pH
    let alpha_HCO3 = Ka1 / (h_concentration + Ka1)
    
    // Net alkalinity after grain acidity
    let netAlkalinity = totalAlkalinityMEq * alpha_HCO3 - totalGrainAcidity/1000
    
    // pH shift from alkalinity
    let alkalinityPHShift = netAlkalinity / (totalBufferCapacity/1000)
    
    // Apply residual alkalinity effect
    let RA = calculateRA(water)
    let raPHShift = (RA * 0.045) / mashThickness
    
    // Update pH
    pH = weightedGrainPH + alkalinityPHShift + raPHShift * thicknessFactor
    
    // Constrain to reasonable range
    pH = Math.max(4.0, Math.min(7.0, pH))
  }
  
  return pH
}
```

### 3.3 Simplified Models for Comparison

#### EZ Water Calculator
```
Mash_pH = 5.8 + RA_Effect - Color_Effect

Where:
RA_Effect = RA_as_CaCO3 * 0.0035
Color_Effect = (Average_Grain_Color_SRM - 4) * 0.007  // Only if color > 4
```

#### Kaiser/Troester Model
```
Mash_pH = 5.57 - (0.013 * Alkalinity_ppm) / (Mash_Thickness * 50)

Where:
Mash_Thickness = Liters_Water / Kg_Grain
```

#### Palmer Model
```
Mash_pH = 5.7 - (RA_as_CaCO3 * 0.012)
```

---

## 4. ACID CALCULATIONS

### 4.1 Acid Strength Factors (mEq/mL)

| Acid Type | Concentration | Density (g/mL) | mEq/mL |
|-----------|---------------|----------------|---------|
| Lactic | 88% | 1.21 | 11.76 |
| Lactic | 80% | 1.18 | 10.45 |
| Lactic | 50% | 1.12 | 6.22 |
| Lactic | 10% | 1.02 | 1.13 |
| Phosphoric | 85% | 1.69 | 14.67 |
| Phosphoric | 75% | 1.58 | 12.12 |
| Phosphoric | 10% | 1.05 | 1.07 |
| Hydrochloric | 37% | 1.18 | 11.98 |
| Hydrochloric | 31% | 1.15 | 9.78 |
| Hydrochloric | 10% | 1.05 | 2.87 |
| Sulfuric | 96% | 1.84 | 36.77 |
| Sulfuric | 93% | 1.83 | 34.88 |
| Sulfuric | 10% | 1.07 | 2.18 |

### 4.2 Acid Required Calculation
```javascript
function calculateAcidRequired(currentPH, targetPH, grainBillKg, acidType, concentration) {
  // Buffer capacity of mash (Bru'n Water uses grain-dependent)
  const bufferCapacityPerKg = 30.3  // mEq/pH/kg
  const totalBufferCapacity = grainBillKg * bufferCapacityPerKg
  
  // pH change needed
  const deltaPH = currentPH - targetPH
  
  // mEq of acid needed
  const mEqNeeded = deltaPH * totalBufferCapacity
  
  // Convert to volume
  const acidStrength = getAcidStrength(acidType, concentration)  // mEq/mL
  const volumeML = mEqNeeded / acidStrength
  
  return volumeML
}
```

### 4.3 Acid Malt (Sauermalz) Calculation
```
pH_reduction = (Acid_Malt_% * 0.1)

Where:
Acid_Malt_% = (Acid_Malt_Weight / Total_Grain_Weight) * 100
```

---

## 5. SPARGE WATER CALCULATIONS

### 5.1 Sparge Water Acidification
```javascript
function calculateSpargeAcidification(spargeWater, volumeLiters, targetPH = 5.5) {
  // Alkalinity of sparge water
  const alkalinityMEq = (spargeWater.bicarbonate * 0.82 * volumeLiters) / 50
  
  // pH shift needed
  const currentPH = spargeWater.ph || 7.0
  const deltaPH = currentPH - targetPH
  
  // Simplified calculation (no grain buffering in sparge)
  const mEqNeeded = alkalinityMEq * deltaPH * 0.5  // 0.5 is empirical factor
  
  // Convert to acid volume
  const lacticML_88 = mEqNeeded / 11.76
  const phosphoricML_85 = mEqNeeded / 14.67
  
  return { lacticML_88, phosphoricML_85 }
}
```

---

## 6. WATER DILUTION/BLENDING

### 6.1 Dilution Calculation
```javascript
function blendWaters(water1, volume1, water2, volume2) {
  const totalVolume = volume1 + volume2
  const ratio1 = volume1 / totalVolume
  const ratio2 = volume2 / totalVolume
  
  // For each ion
  const blendedWater = {
    calcium: water1.calcium * ratio1 + water2.calcium * ratio2,
    magnesium: water1.magnesium * ratio1 + water2.magnesium * ratio2,
    sodium: water1.sodium * ratio1 + water2.sodium * ratio2,
    sulfate: water1.sulfate * ratio1 + water2.sulfate * ratio2,
    chloride: water1.chloride * ratio1 + water2.chloride * ratio2,
    bicarbonate: water1.bicarbonate * ratio1 + water2.bicarbonate * ratio2
  }
  
  return blendedWater
}
```

### 6.2 Percent Dilution
```
New_Ion_PPM = Original_PPM * (1 - Dilution_%) + RO_PPM * Dilution_%

Where RO_PPM = 0 for all ions
```

---

## 7. SPECIAL CALCULATIONS

### 7.1 Alkalinity Conversions
```
// From Total Alkalinity (as CaCO3) to Bicarbonate
HCO3_ppm = (Alkalinity_as_CaCO3 / 50) * 61 * f_HCO3

Where:
f_HCO3 = 1 / (1 + 10^(pH - 10.33))  // Fraction as HCO3 at given pH
```

### 7.2 Carbonate/Bicarbonate Equilibrium
```javascript
function carbonateEquilibrium(pH, totalAlkalinity) {
  const pK1 = 6.35  // First dissociation constant
  const pK2 = 10.33  // Second dissociation constant
  
  // Henderson-Hasselbalch
  const ratio_HCO3_H2CO3 = 10^(pH - pK1)
  const ratio_CO3_HCO3 = 10^(pH - pK2)
  
  // Fractions
  const denominator = 1 + ratio_HCO3_H2CO3 + ratio_HCO3_H2CO3 * ratio_CO3_HCO3
  const f_H2CO3 = 1 / denominator
  const f_HCO3 = ratio_HCO3_H2CO3 / denominator
  const f_CO3 = ratio_HCO3_H2CO3 * ratio_CO3_HCO3 / denominator
  
  return {
    bicarbonate: totalAlkalinity * f_HCO3 * 1.22,
    carbonate: totalAlkalinity * f_CO3 * 1.22
  }
}
```

### 7.3 Temperature Compensation for pH
```
// pH meters are calibrated at 25°C
pH_at_mash_temp = pH_at_25C - 0.003 * (Mash_Temp_C - 25)

// Example: pH 5.4 at 25°C = pH 5.31 at 65°C
```

---

## 8. VALIDATION RANGES

### 8.1 Ion Ranges for Brewing
| Ion | Minimum | Optimal | Maximum | Effects |
|-----|---------|---------|----------|---------|
| Ca²⁺ | 50 | 50-150 | 200 | Yeast health, enzyme function |
| Mg²⁺ | 0 | 5-20 | 30 | Yeast nutrition, bitter if high |
| Na⁺ | 0 | 0-100 | 150 | Fullness, salty if high |
| SO₄²⁻ | 0 | 50-350 | 500 | Hop bitterness, dryness |
| Cl⁻ | 0 | 0-150 | 250 | Malt sweetness, fullness |
| HCO₃⁻ | 0 | 0-200 | 300 | Alkalinity, pH buffer |

### 8.2 pH Ranges
| Stage | Minimum | Optimal | Maximum |
|-------|---------|---------|----------|
| Mash | 5.0 | 5.2-5.5 | 5.8 |
| Boil | 4.8 | 5.0-5.2 | 5.4 |
| Finished Beer | 4.0 | 4.2-4.6 | 4.8 |

---

## 9. ADVANCED SOLVER ALGORITHM

### 9.1 Matrix Solution for Salt Additions
```javascript
// This is simplified - full implementation uses linear algebra
function solveSaltAdditions(sourceWater, targetWater, volumeLiters) {
  // Create matrix of salt effects
  const saltMatrix = [
    // [Ca, Mg, Na, SO4, Cl, HCO3] effects per gram
    [232.5, 0, 0, 557.7, 0, 0],      // Gypsum
    [272.0, 0, 0, 0, 482.0, 0],      // CaCl2
    [0, 98.6, 0, 389.5, 0, 0],       // Epsom
    [0, 119.5, 0, 0, 348.5, 0],      // MgCl2
    [0, 0, 393.3, 0, 606.7, 0],      // NaCl
    [0, 0, 273.6, 0, 0, 726.4]       // NaHCO3
  ]
  
  // Ion differences needed
  const targetVector = [
    targetWater.calcium - sourceWater.calcium,
    targetWater.magnesium - sourceWater.magnesium,
    targetWater.sodium - sourceWater.sodium,
    targetWater.sulfate - sourceWater.sulfate,
    targetWater.chloride - sourceWater.chloride,
    targetWater.bicarbonate - sourceWater.bicarbonate
  ]
  
  // Solve using least squares or optimization
  // (Implementation would use a proper solver library)
  const saltGrams = solveLinearSystem(saltMatrix, targetVector, volumeLiters)
  
  return saltGrams
}
```

---

## 10. CRITICAL CONSTANTS

### 10.1 Conversion Factors
```javascript
const conversions = {
  // Alkalinity
  HCO3_to_CaCO3: 0.82,      // HCO3 ppm * 0.82 = Alkalinity as CaCO3
  CO3_to_CaCO3: 1.67,       // CO3 ppm * 1.67 = Alkalinity as CaCO3
  
  // Hardness
  Ca_to_CaCO3: 2.5,         // Ca ppm * 2.5 = Hardness as CaCO3
  Mg_to_CaCO3: 4.1,         // Mg ppm * 4.1 = Hardness as CaCO3
  
  // Equivalents
  CaCO3_to_mEq: 0.02,       // CaCO3 ppm * 0.02 = mEq/L
  
  // Temperature
  fahrenheit_to_celsius: (F) => (F - 32) * 5/9,
  celsius_to_fahrenheit: (C) => C * 9/5 + 32,
  
  // Volume
  gallons_to_liters: 3.78541,
  quarts_to_liters: 0.946353,
  
  // Weight
  pounds_to_kg: 0.453592,
  ounces_to_grams: 28.3495,
  
  // Grain units
  ppg_to_sgp: 0.001,        // Points per gallon to specific gravity points
  plato_to_sg: (P) => 1 + (P / (258.6 - P * 0.88)),
  sg_to_plato: (SG) => (-668.962 + 1262.45 * SG - 776.43 * SG^2 + 182.94 * SG^3)
}
```

---

## IMPLEMENTATION NOTES

1. **Precision**: All calculations should maintain at least 3 decimal places internally
2. **Units**: Always work in metric internally, convert for display
3. **Validation**: Check all inputs are within reasonable brewing ranges
4. **Iteration**: pH calculations require iterative solving (10 iterations usually sufficient)
5. **Caching**: Many calculations can be cached as they don't change during a session

## TESTING VALIDATION

To validate implementation, test against these known Bru'n Water results:

### Test Case 1: Pilsner
```
Source Water: Ca=50, Mg=10, Na=15, SO4=40, Cl=20, HCO3=100
Grain Bill: 100% Pilsner malt
Expected pH: ~5.65
With 2g Gypsum/gal: pH ~5.45
```

### Test Case 2: Stout  
```
Source Water: Ca=100, Mg=20, Na=30, SO4=50, Cl=100, HCO3=200
Grain Bill: 80% Pale, 10% Roasted Barley, 10% Crystal 60
Expected pH: ~5.25
```

### Test Case 3: IPA
```
Target: Ca=150, SO4=300, Cl=50
From RO water with salts:
Gypsum: ~7g per 5 gal
CaCl2: ~1g per 5 gal
Expected SO4:Cl ratio: 6:1
```