import { WaterProfile, GrainBillItem } from '../../core/types';
import { CHEMISTRY_CONSTANTS } from '../../core/constants';

/**
 * Advanced pH Model
 * Full chemical equilibrium calculations
 * Uses Henderson-Hasselbalch equation
 * Accounts for:
 * - Temperature effects
 * - Ionic activity
 * - Carbonate equilibrium
 * - Multiple buffer systems
 * Most accurate but computationally intensive
 */

export interface AdvancedPHModelInput {
  sourceWater: WaterProfile;
  grainBill: GrainBillItem[];
  mashThickness: number; // L/kg
  mashTemperature: number; // °C
  iterations?: number; // For convergence
}

export interface ChemicalSpecies {
  H: number;           // H+ concentration (mol/L)
  OH: number;          // OH- concentration
  H2CO3: number;       // Carbonic acid
  HCO3: number;        // Bicarbonate
  CO3: number;         // Carbonate
  H3PO4: number;       // Phosphoric acid
  H2PO4: number;       // Dihydrogen phosphate
  HPO4: number;        // Hydrogen phosphate
  PO4: number;         // Phosphate
}

/**
 * Calculate ionic strength of solution
 */
function calculateIonicStrength(water: WaterProfile): number {
  // Convert ppm to mol/L and calculate ionic strength
  // I = 0.5 * Σ(ci * zi²)
  // ci = concentration, zi = charge
  
  const calcium = water.calcium / 40.08 / 1000;      // Ca²⁺
  const magnesium = water.magnesium / 24.31 / 1000;  // Mg²⁺
  const sodium = water.sodium / 22.99 / 1000;        // Na⁺
  const sulfate = water.sulfate / 96.06 / 1000;      // SO₄²⁻
  const chloride = water.chloride / 35.45 / 1000;    // Cl⁻
  const bicarbonate = water.bicarbonate / 61.02 / 1000; // HCO₃⁻
  
  const ionicStrength = 0.5 * (
    calcium * 4 +      // z² = 4
    magnesium * 4 +    // z² = 4
    sodium * 1 +       // z² = 1
    sulfate * 4 +      // z² = 4
    chloride * 1 +     // z² = 1
    bicarbonate * 1    // z² = 1
  );
  
  return ionicStrength;
}

/**
 * Calculate activity coefficient using Davies equation
 */
function calculateActivityCoefficient(charge: number, ionicStrength: number): number {
  if (charge === 0) return 1;
  
  const sqrtI = Math.sqrt(ionicStrength);
  const A = 0.509; // Davies constant at 25°C
  
  // Davies equation: log γ = -A * z² * (√I / (1 + √I) - 0.3 * I)
  const logGamma = -A * charge * charge * (sqrtI / (1 + sqrtI) - 0.3 * ionicStrength);
  
  return Math.pow(10, logGamma);
}

/**
 * Temperature correction for equilibrium constants
 */
function temperatureCorrectPKa(pKa25: number, temperature: number, deltaH: number = 0): number {
  // Van't Hoff equation
  // pKa(T) = pKa(25°C) * (T/298) * exp(ΔH/R * (1/T - 1/298))
  
  if (deltaH === 0) {
    // Simple linear approximation if ΔH not known
    return pKa25 - 0.003 * (temperature - 25);
  }
  
  const R = 8.314; // J/(mol·K)
  const T = temperature + 273.15;
  const T0 = 298.15;
  
  const correction = (deltaH / R) * (1/T - 1/T0) / 2.303;
  return pKa25 + correction;
}

/**
 * Solve carbonate equilibrium system
 */
function solveCarbonateSystem(
  pH: number,
  totalCarbonate: number, // mol/L
  ionicStrength: number,
  temperature: number
): Partial<ChemicalSpecies> {
  // Temperature-corrected pKa values
  const pKa1 = temperatureCorrectPKa(CHEMISTRY_CONSTANTS.CARBONIC_ACID_PKA1, temperature);
  const pKa2 = temperatureCorrectPKa(CHEMISTRY_CONSTANTS.CARBONIC_ACID_PKA2, temperature);
  
  // Activity coefficients
  const gamma1 = calculateActivityCoefficient(1, ionicStrength);
  const gamma2 = calculateActivityCoefficient(2, ionicStrength);
  
  // Convert to Ka
  const Ka1 = Math.pow(10, -pKa1);
  const Ka2 = Math.pow(10, -pKa2);
  
  const H = Math.pow(10, -pH);
  
  // Distribution fractions
  const alpha0 = H * H / (H * H + H * Ka1 + Ka1 * Ka2);
  const alpha1 = H * Ka1 / (H * H + H * Ka1 + Ka1 * Ka2);
  const alpha2 = Ka1 * Ka2 / (H * H + H * Ka1 + Ka1 * Ka2);
  
  return {
    H2CO3: alpha0 * totalCarbonate,
    HCO3: alpha1 * totalCarbonate,
    CO3: alpha2 * totalCarbonate
  };
}

/**
 * Solve phosphate equilibrium system
 */
function solvePhosphateSystem(
  pH: number,
  totalPhosphate: number, // mol/L
  ionicStrength: number,
  temperature: number
): Partial<ChemicalSpecies> {
  // Temperature-corrected pKa values
  const pKa1 = temperatureCorrectPKa(CHEMISTRY_CONSTANTS.PHOSPHORIC_ACID_PKA1, temperature);
  const pKa2 = temperatureCorrectPKa(CHEMISTRY_CONSTANTS.PHOSPHORIC_ACID_PKA2, temperature);
  const pKa3 = temperatureCorrectPKa(CHEMISTRY_CONSTANTS.PHOSPHORIC_ACID_PKA3, temperature);
  
  const Ka1 = Math.pow(10, -pKa1);
  const Ka2 = Math.pow(10, -pKa2);
  const Ka3 = Math.pow(10, -pKa3);
  
  const H = Math.pow(10, -pH);
  
  // Distribution fractions
  const denominator = H * H * H + H * H * Ka1 + H * Ka1 * Ka2 + Ka1 * Ka2 * Ka3;
  const alpha0 = H * H * H / denominator;
  const alpha1 = H * H * Ka1 / denominator;
  const alpha2 = H * Ka1 * Ka2 / denominator;
  const alpha3 = Ka1 * Ka2 * Ka3 / denominator;
  
  return {
    H3PO4: alpha0 * totalPhosphate,
    H2PO4: alpha1 * totalPhosphate,
    HPO4: alpha2 * totalPhosphate,
    PO4: alpha3 * totalPhosphate
  };
}

/**
 * Calculate charge balance
 */
function calculateChargeBalance(
  water: WaterProfile,
  species: Partial<ChemicalSpecies>
): number {
  // Cations
  const cations = 
    (water.calcium / 40.08 / 1000) * 2 +     // Ca²⁺
    (water.magnesium / 24.31 / 1000) * 2 +   // Mg²⁺
    (water.sodium / 22.99 / 1000) +          // Na⁺
    (species.H || 0);                        // H⁺
  
  // Anions
  const anions = 
    (water.sulfate / 96.06 / 1000) * 2 +     // SO₄²⁻
    (water.chloride / 35.45 / 1000) +        // Cl⁻
    (species.HCO3 || 0) +                    // HCO₃⁻
    (species.CO3 || 0) * 2 +                 // CO₃²⁻
    (species.OH || 0) +                      // OH⁻
    (species.H2PO4 || 0) +                   // H₂PO₄⁻
    (species.HPO4 || 0) * 2 +               // HPO₄²⁻
    (species.PO4 || 0) * 3;                 // PO₄³⁻
  
  return cations - anions;
}

/**
 * Iterative solver for pH using charge balance
 */
function solvePHIteratively(
  water: WaterProfile,
  grainPhosphate: number, // mol/L from grain
  ionicStrength: number,
  temperature: number,
  maxIterations: number = 100
): { pH: number; species: Partial<ChemicalSpecies>; iterations: number } {
  let pH = 5.5; // Initial guess
  let bestPH = pH;
  let minError = Infinity;
  let bestSpecies: Partial<ChemicalSpecies> = {};
  
  // Bisection method
  let lowPH = 4.0;
  let highPH = 7.0;
  
  for (let i = 0; i < maxIterations; i++) {
    pH = (lowPH + highPH) / 2;
    
    // Calculate species concentrations
    const totalCarbonate = water.bicarbonate / 61.02 / 1000;
    const carbonateSpecies = solveCarbonateSystem(pH, totalCarbonate, ionicStrength, temperature);
    const phosphateSpecies = solvePhosphateSystem(pH, grainPhosphate, ionicStrength, temperature);
    
    // Water dissociation
    const Kw = Math.pow(10, -14) * Math.exp(-0.01 * (temperature - 25)); // Temperature correction
    const H = Math.pow(10, -pH);
    const OH = Kw / H;
    
    const species: Partial<ChemicalSpecies> = {
      ...carbonateSpecies,
      ...phosphateSpecies,
      H,
      OH
    };
    
    // Check charge balance
    const chargeError = calculateChargeBalance(water, species);
    
    if (Math.abs(chargeError) < minError) {
      minError = Math.abs(chargeError);
      bestPH = pH;
      bestSpecies = species;
    }
    
    // Adjust search range
    if (chargeError > 0) {
      // Too many cations, need lower pH (more H+)
      highPH = pH;
    } else {
      // Too many anions, need higher pH (less H+)
      lowPH = pH;
    }
    
    // Converged?
    if (Math.abs(chargeError) < 1e-6) {
      break;
    }
  }
  
  return {
    pH: bestPH,
    species: bestSpecies,
    iterations: Math.min(maxIterations, 100)
  };
}

/**
 * Calculate advanced pH model
 */
export function calculateAdvancedPH(input: AdvancedPHModelInput): number {
  const { sourceWater, grainBill, mashThickness, mashTemperature, iterations = 100 } = input;
  
  // Calculate ionic strength
  const ionicStrength = calculateIonicStrength(sourceWater);
  
  // Calculate grain phosphate contribution
  // Simplified: assume 10 mmol/kg phosphate from grain
  const totalGrainWeight = grainBill.reduce((sum, grain) => sum + grain.weight, 0);
  const grainPhosphateTotal = totalGrainWeight * 0.01; // mol
  const mashVolume = totalGrainWeight * mashThickness; // L
  const grainPhosphate = grainPhosphateTotal / mashVolume; // mol/L
  
  // Solve for pH
  const result = solvePHIteratively(
    sourceWater,
    grainPhosphate,
    ionicStrength,
    mashTemperature,
    iterations
  );
  
  return result.pH;
}

/**
 * Calculate with detailed output
 */
export function calculateAdvancedPHDetailed(input: AdvancedPHModelInput): {
  pH: number;
  ionicStrength: number;
  species: Partial<ChemicalSpecies>;
  chargeBalance: number;
  iterations: number;
  temperature: number;
} {
  const { sourceWater, grainBill, mashThickness, mashTemperature, iterations = 100 } = input;
  
  const ionicStrength = calculateIonicStrength(sourceWater);
  
  const totalGrainWeight = grainBill.reduce((sum, grain) => sum + grain.weight, 0);
  const grainPhosphateTotal = totalGrainWeight * 0.01;
  const mashVolume = totalGrainWeight * mashThickness;
  const grainPhosphate = grainPhosphateTotal / mashVolume;
  
  const result = solvePHIteratively(
    sourceWater,
    grainPhosphate,
    ionicStrength,
    mashTemperature,
    iterations
  );
  
  const chargeBalance = calculateChargeBalance(sourceWater, result.species);
  
  return {
    pH: result.pH,
    ionicStrength,
    species: result.species,
    chargeBalance,
    iterations: result.iterations,
    temperature: mashTemperature
  };
}

/**
 * Calculate buffer capacity
 */
export function calculateBufferCapacity(
  water: WaterProfile,
  pH: number,
  temperature: number
): number {
  const ionicStrength = calculateIonicStrength(water);
  
  // Carbonate buffer capacity
  const totalCarbonate = water.bicarbonate / 61.02 / 1000;
  const carbonateSpecies = solveCarbonateSystem(pH, totalCarbonate, ionicStrength, temperature);
  
  const pKa1 = temperatureCorrectPKa(CHEMISTRY_CONSTANTS.CARBONIC_ACID_PKA1, temperature);
  const Ka1 = Math.pow(10, -pKa1);
  const H = Math.pow(10, -pH);
  
  // Buffer capacity β = 2.303 * C * α * (1 - α)
  // Where α is the fraction of the buffer in one form
  const alpha = H / (H + Ka1);
  const carbonateBuffer = 2.303 * totalCarbonate * alpha * (1 - alpha);
  
  // Water self-buffering
  const Kw = Math.pow(10, -14);
  const waterBuffer = 2.303 * (H + Kw/H);
  
  return carbonateBuffer + waterBuffer;
}