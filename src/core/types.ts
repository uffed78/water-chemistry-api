export interface WaterProfile {
  calcium: number;
  magnesium: number;
  sodium: number;
  sulfate: number;
  chloride: number;
  bicarbonate: number;
  carbonate?: number;
  ph?: number;
  alkalinity?: number;
}

export interface GrainBillItem {
  name: string;
  weight: number; // kg
  color: number; // EBC
  type: 'base' | 'crystal' | 'roasted' | 'acidulated' | 'wheat';
  percentage?: number;
}

export interface Volumes {
  total: number;
  mash: number;
  sparge: number;
}

export type VolumeMode = 'total' | 'mash' | 'staged';
export type PHModel = 'simple' | 'kaiser' | 'advanced';
export type OptimizationStrategy = 'balanced' | 'minimal' | 'exact';

export interface SaltAddition {
  name: string;
  amount: number; // grams
  targetVolume?: 'mash' | 'sparge' | 'boil'; // For staged mode
}

export interface AcidAddition {
  name: string;
  amount: number; // ml
  concentration: number; // percentage
  targetVolume?: 'mash' | 'sparge';
}

export interface CalculationOptions {
  volumeMode: VolumeMode;
  phModel: PHModel;
  optimization?: OptimizationStrategy;
}

export interface CalculationRequest {
  sourceWater: WaterProfile;
  targetWater?: WaterProfile;
  grainBill: GrainBillItem[];
  volumes: Volumes;
  options: CalculationOptions;
  style?: string;
}

export interface ManualCalculationRequest {
  sourceWater: WaterProfile;
  additions: {
    salts: Record<string, number>; // salt name -> grams
    acids: Record<string, number>; // acid name -> ml
  };
  volumes: Volumes;
  grainBill: GrainBillItem[];
  options: CalculationOptions;
}

export interface CalculationResponse {
  adjustments: {
    salts: SaltAddition[];
    acids: AcidAddition[];
    mash?: {
      salts: SaltAddition[];
      acids: AcidAddition[];
    };
    sparge?: {
      salts: SaltAddition[];
      acids: AcidAddition[];
    };
    boil?: {
      salts: SaltAddition[];
    };
  };
  achievedWater: WaterProfile;
  predictions: {
    mashPH: number;
    finalPH?: number;
    basePH?: number;
    sourcePH?: number;
    afterSaltsPH?: number;
    sulfateChlorideRatio: number;
    residualAlkalinity: number;
  };
  analysis: {
    matchPercentage?: number;
    calciumLevel?: 'low' | 'optimal' | 'high';
    flavorProfile?: 'hoppy' | 'balanced' | 'malty';
    phStatus?: 'too_low' | 'in_range' | 'too_high';
    warnings: string[];
    suggestions: string[];
  };
}

export interface ValidationRequest {
  plannedAdditions: {
    salts: Record<string, number>;
    acids: Record<string, number>;
  };
  sourceWater: WaterProfile;
  targetProfile?: string;
  grainBill: GrainBillItem[];
  volumes: Volumes;
  concerns: ('yeast_health' | 'hop_utilization' | 'mash_ph' | 'clarity')[];
}

export interface ValidationResponse {
  valid: boolean;
  issues: {
    severity: 'error' | 'warning' | 'info';
    message: string;
    suggestion?: string;
  }[];
  predictions: {
    fermentation?: 'poor' | 'good' | 'excellent';
    clarity?: 'cloudy' | 'clear' | 'brilliant';
    flavor_impact?: 'too_minerally' | 'balanced' | 'too_soft';
  };
}