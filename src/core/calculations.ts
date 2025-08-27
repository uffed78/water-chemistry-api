import { CalculationRequest, CalculationResponse, WaterProfile, GrainBillItem } from './types'
import { SALT_DEFINITIONS } from './salts'
import { lookupGrainData, GrainData } from './grain-database'

export class WaterChemistryEngine {
  calculate(request: CalculationRequest): CalculationResponse {
    const sourceWater = request.sourceWater
    const achievedWater = this.cloneWaterProfile(sourceWater)
    
    // Simple salt calculations for now - this needs to be expanded with proper algorithms
    const saltAdjustments = this.calculateSaltAdjustments(request)
    const acidAdjustments = this.calculateAcidAdjustments(request)
    
    // Apply salt adjustments to achieved water
    this.applySaltAdjustments(achievedWater, saltAdjustments, request.volumes.total)
    
    // Calculate predictions with proper volumes
    const predictions = this.calculatePredictions(achievedWater, request.grainBill, request.volumes.mash)
    
    // Add ion balance validation
    const ionBalance = this.validateIonBalance(achievedWater)
    if (!ionBalance.valid) {
      // Handle ion balance issues
    }
    
    // Generate warnings and recommendations
    const warnings = this.generateWarnings(achievedWater, predictions)
    const recommendations = this.generateRecommendations(achievedWater, predictions)
    
    return {
      success: true,
      sourceWater,
      achievedWater,
      adjustments: {
        salts: saltAdjustments,
        acids: acidAdjustments
      },
      predictions,
      warnings,
      recommendations
    }
  }

  private cloneWaterProfile(profile: WaterProfile): WaterProfile {
    return { ...profile }
  }

  private calculateSaltAdjustments(request: CalculationRequest) {
    // Handle manual salt adjustments if provided
    if (request.manualAdjustments?.salts) {
      return this.processManualSaltAdjustments(request.manualAdjustments.salts)
    }
    
    // If a target water profile is provided, try to match it
    if (request.targetWater) {
      const targetBased = this.calculateTargetBasedSaltAdjustments(request)
      if (targetBased.length > 0) return targetBased
      // Fallback to style-based if solver yields nothing
    }
    
    // Calculate intelligent salt additions based on water profile and beer style
    return this.calculateIntelligentSaltAdjustments(request)
  }

  private processManualSaltAdjustments(manualSalts: Record<string, number>) {
    const adjustments = []
    
    for (const [saltId, amount] of Object.entries(manualSalts)) {
      const salt = SALT_DEFINITIONS[saltId]
      if (salt && amount > 0) {
        adjustments.push({
          id: saltId,
          name: salt.name,
          amount: Math.round(amount * 10) / 10,
          unit: 'g'
        })
      }
    }
    
    return adjustments
  }

  private calculateIntelligentSaltAdjustments(request: CalculationRequest) {
    const adjustments = []
    const water = request.sourceWater
    const volumeLiters = request.volumes.total
    const allowed = new Set(
      request.saltPreferences?.allowedSalts ?? Object.keys(SALT_DEFINITIONS)
    )
    
    // Target ion levels based on beer style analysis
    const targets = this.determineBeerStyleTargets(request)
    
    // Calculate ion deficiencies
    const calciumNeeded = Math.max(0, targets.calcium - water.calcium)
    const sulfateNeeded = Math.max(0, targets.sulfate - water.sulfate)
    const chlorideNeeded = Math.max(0, targets.chloride - water.chloride)
    const magnesiumNeeded = Math.max(0, targets.magnesium - water.magnesium)
    
    // Prioritize salt additions based on needs
    // 1. Calcium Sulfate (Gypsum) - for sulfate and calcium
    if ((sulfateNeeded > 0 || calciumNeeded > 0) && allowed.has('gypsum')) {
      const gypsumForSulfate = sulfateNeeded > 0 ? sulfateNeeded / SALT_DEFINITIONS.gypsum.ionsPPMPerGram.sulfate! : 0
      const gypsumForCalcium = calciumNeeded > 0 ? calciumNeeded / SALT_DEFINITIONS.gypsum.ionsPPMPerGram.calcium! : 0
      const gypsumAmount = Math.max(gypsumForSulfate, gypsumForCalcium) * volumeLiters
      
      if (gypsumAmount > 0.1) { // Minimum 0.1g addition
        adjustments.push({
          id: 'gypsum',
          name: 'Gypsum',
          amount: Math.round(gypsumAmount * 10) / 10,
          unit: 'g'
        })
      }
    }
    
    // 2. Calcium Chloride - for chloride and remaining calcium
    if (chlorideNeeded > 0 && allowed.has('calcium_chloride')) {
      const calciumChlorideAmount = (chlorideNeeded / SALT_DEFINITIONS.calcium_chloride.ionsPPMPerGram.chloride!) * volumeLiters
      
      if (calciumChlorideAmount > 0.1) {
        adjustments.push({
          id: 'calcium_chloride',
          name: 'Calcium Chloride',
          amount: Math.round(calciumChlorideAmount * 10) / 10,
          unit: 'g'
        })
      }
    }
    
    // 3. Epsom Salt - for magnesium
    if (magnesiumNeeded > 0 && allowed.has('epsom_salt')) {
      const epsomAmount = (magnesiumNeeded / SALT_DEFINITIONS.epsom_salt.ionsPPMPerGram.magnesium!) * volumeLiters
      
      if (epsomAmount > 0.1) {
        adjustments.push({
          id: 'epsom_salt',
          name: 'Epsom Salt',
          amount: Math.round(epsomAmount * 10) / 10,
          unit: 'g'
        })
      }
    }
    
    return adjustments
  }

  // Greedy target-based solver: attempts to reach targetWater ion levels with allowed salts
  private calculateTargetBasedSaltAdjustments(request: CalculationRequest) {
    const source = { ...request.sourceWater }
    const target = request.targetWater!
    const volumeLiters = request.volumes.total
    const allowed = new Set(
      request.saltPreferences?.allowedSalts ?? Object.keys(SALT_DEFINITIONS)
    )

    // Candidate salts that primarily add Ca, Mg, Na, SO4, Cl, HCO3
    const candidateSaltIds = [
      'gypsum',              // Ca, SO4
      'calcium_chloride',    // Ca, Cl
      'epsom_salt',          // Mg, SO4
      'magnesium_chloride',  // Mg, Cl
      'sodium_chloride',     // Na, Cl
      'baking_soda'          // Na, HCO3
      // Chalk and Lime omitted in default solver due to complexity; can be allowed explicitly
    ].filter(id => allowed.has(id))

    if (candidateSaltIds.length === 0) return []

    // Track running additions
    const additions: Record<string, number> = {}

    // Helper to compute positive deficits
    const deficits = () => ({
      calcium: Math.max(0, (target.calcium ?? 0) - (source.calcium ?? 0)),
      magnesium: Math.max(0, (target.magnesium ?? 0) - (source.magnesium ?? 0)),
      sodium: Math.max(0, (target.sodium ?? 0) - (source.sodium ?? 0)),
      sulfate: Math.max(0, (target.sulfate ?? 0) - (source.sulfate ?? 0)),
      chloride: Math.max(0, (target.chloride ?? 0) - (source.chloride ?? 0)),
      bicarbonate: Math.max(0, (target.bicarbonate ?? 0) - (source.bicarbonate ?? 0))
    })

    // Normalize weights to emphasize SO4/Cl and Ca first (taste + mash health)
    const weights: Record<string, number> = {
      calcium: 1.0,
      magnesium: 0.5,
      sodium: 0.6,
      sulfate: 1.0,
      chloride: 1.0,
      bicarbonate: 0.7
    }

    // Iterate greedily up to N steps
    for (let step = 0; step < 20; step++) {
      const need = deficits()
      const totalNeed = need.calcium + need.magnesium + need.sodium + need.sulfate + need.chloride + need.bicarbonate
      if (totalNeed <= 1) break // close enough in ppm

      // Score each salt by how well it addresses current deficits
      let bestSalt: string | null = null
      let bestScore = 0
      for (const id of candidateSaltIds) {
        const salt = (SALT_DEFINITIONS as any)[id]
        const ions = salt.ionsPPMPerGram || {}
        const score =
          (ions.calcium || 0) * weights.calcium * Math.min(1, need.calcium / Math.max(1, ions.calcium || 1)) +
          (ions.magnesium || 0) * weights.magnesium * Math.min(1, need.magnesium / Math.max(1, ions.magnesium || 1)) +
          (ions.sodium || 0) * weights.sodium * Math.min(1, need.sodium / Math.max(1, ions.sodium || 1)) +
          (ions.sulfate || 0) * weights.sulfate * Math.min(1, need.sulfate / Math.max(1, ions.sulfate || 1)) +
          (ions.chloride || 0) * weights.chloride * Math.min(1, need.chloride / Math.max(1, ions.chloride || 1)) +
          (ions.bicarbonate || 0) * weights.bicarbonate * Math.min(1, need.bicarbonate / Math.max(1, ions.bicarbonate || 1))
        if (score > bestScore) {
          bestScore = score
          bestSalt = id
        }
      }

      if (!bestSalt) break

      // Compute grams needed based on limiting ion for the chosen salt
      const salt = (SALT_DEFINITIONS as any)[bestSalt]
      const ions = salt.ionsPPMPerGram || {}
      const limitingRatios: number[] = []
      if (ions.calcium && need.calcium > 0) limitingRatios.push(need.calcium / ions.calcium)
      if (ions.magnesium && need.magnesium > 0) limitingRatios.push(need.magnesium / ions.magnesium)
      if (ions.sodium && need.sodium > 0) limitingRatios.push(need.sodium / ions.sodium)
      if (ions.sulfate && need.sulfate > 0) limitingRatios.push(need.sulfate / ions.sulfate)
      if (ions.chloride && need.chloride > 0) limitingRatios.push(need.chloride / ions.chloride)
      if (ions.bicarbonate && need.bicarbonate > 0) limitingRatios.push(need.bicarbonate / ions.bicarbonate)

      if (limitingRatios.length === 0) break

      // grams per liter to satisfy the most constrained ion
      const gPerL = Math.max(0, Math.min(...limitingRatios))
      if (gPerL <= 0) break

      // Apply a fraction to avoid overshoot and iterate
      const appliedGrams = Math.min(gPerL * volumeLiters, 50) // cap to 50g total each step for safety
      additions[bestSalt] = (additions[bestSalt] || 0) + appliedGrams

      // Update source water with contributions from this addition
      const gramsPerLiter = appliedGrams / volumeLiters
      if (ions.calcium) source.calcium += ions.calcium * gramsPerLiter
      if (ions.magnesium) source.magnesium += ions.magnesium * gramsPerLiter
      if (ions.sodium) source.sodium += ions.sodium * gramsPerLiter
      if (ions.sulfate) source.sulfate += ions.sulfate * gramsPerLiter
      if (ions.chloride) source.chloride += ions.chloride * gramsPerLiter
      if (ions.bicarbonate) source.bicarbonate += ions.bicarbonate * gramsPerLiter
    }

    // Convert to adjustment list
    const list = Object.entries(additions).map(([id, grams]) => ({
      id,
      name: (SALT_DEFINITIONS as any)[id].name,
      amount: Math.round(grams * 10) / 10,
      unit: 'g'
    }))

    return list
  }

  private determineBeerStyleTargets(request: CalculationRequest) {
    // Analyze grain bill to determine beer style
    const grainBill = request.grainBill
    const totalWeight = grainBill.reduce((sum, grain) => sum + grain.amountKg, 0)
    
    // Calculate average color and specialty grain percentage
    const averageColor = grainBill.reduce((sum, grain) => sum + (grain.color * grain.amountKg), 0) / totalWeight
    const roastedPercent = grainBill.filter(g => g.grainType === 'roasted').reduce((sum, g) => sum + g.amountKg, 0) / totalWeight * 100
    const crystalPercent = grainBill.filter(g => g.grainType === 'crystal').reduce((sum, g) => sum + g.amountKg, 0) / totalWeight * 100
    
    // Determine beer style and return appropriate targets
    if (averageColor < 6 && roastedPercent < 1) {
      // Light beer (Pilsner, Wheat, Light Lager)
      return {
        calcium: 75,
        magnesium: 5,
        sulfate: 100,
        chloride: 50
      }
    } else if (averageColor > 20 || roastedPercent > 5) {
      // Dark beer (Stout, Porter)
      return {
        calcium: 100,
        magnesium: 10,
        sulfate: 75,
        chloride: 100
      }
    } else if (crystalPercent > 10 || (averageColor > 6 && averageColor < 20)) {
      // Malty beer (Amber, ESB, Oktoberfest)
      return {
        calcium: 100,
        magnesium: 8,
        sulfate: 150,
        chloride: 100
      }
    } else {
      // Hoppy/Balanced beer (IPA, APA)
      return {
        calcium: 120,
        magnesium: 10,
        sulfate: 300,
        chloride: 75
      }
    }
  }

  private calculateAcidAdjustments(request: CalculationRequest) {
    const adjustments: Array<{ id: string; name: string; amount: number; unit: string }> = []

    // Calculate predicted mash pH first
    const predictedPH = this.calculateMashPH_BrunWater(request.sourceWater, request.grainBill, request.volumes.mash)
    const targetPH = request.targetMashPH || 5.4

    // Only add acid if mash pH is too high
    if (predictedPH > targetPH + 0.05) {
      const pHDifference = predictedPH - targetPH
      const mEqNeeded = this.calculateAcidMEqRequired(pHDifference, request.grainBill)

      // Choose acid based on preferences (default lactic 88%)
      const pref = request.acidPreferences?.mash || { type: 'lactic', concentrationPct: 88 }
      const strength = this.getAcidStrength(pref.type, pref.concentrationPct)
      const volumeML = strength > 0 ? mEqNeeded / strength : 0

      if (volumeML > 0.1) {
        adjustments.push({
          id: `${pref.type}_acid_${pref.concentrationPct}`,
          name: this.describeAcid(pref.type, pref.concentrationPct),
          amount: Math.round(volumeML * 10) / 10,
          unit: 'ml'
        })
      }
    }

    // Optional: Sparge acidification if preferences provided
    if (request.acidPreferences?.sparge && request.volumes.sparge > 0) {
      const sPref = request.acidPreferences.sparge
      const targetSpargePH = sPref.targetPH ?? 5.5
      const mEq = this.calculateSpargeAcid_mEq(request.sourceWater, request.volumes.sparge, targetSpargePH)
      const strength = this.getAcidStrength(sPref.type, sPref.concentrationPct)
      const volumeML = strength > 0 ? mEq / strength : 0

      if (volumeML > 0.1) {
        adjustments.push({
          id: `${sPref.type}_acid_${sPref.concentrationPct}_sparge`,
          name: `${this.describeAcid(sPref.type, sPref.concentrationPct)} (Sparge)`,
          amount: Math.round(volumeML * 10) / 10,
          unit: 'ml'
        })
      }
    }

    return adjustments
  }

  // Calculate total mEq of acid needed for mash pH shift
  private calculateAcidMEqRequired(pHDifference: number, grainBill: GrainBillItem[]) {
    const totalGrainKg = grainBill.reduce((sum, grain) => sum + grain.amountKg, 0)
    let totalBufferCapacity = 0

    for (const grain of grainBill) {
      const grainData = lookupGrainData(grain.name, grain.color)
      totalBufferCapacity += grainData.bufferCapacity * grain.amountKg
    }

    // mEq needed for desired pH shift (empirical safety factor 1.2)
    const mEqNeeded = pHDifference * (totalBufferCapacity / 1000) * 1.2
    return mEqNeeded
  }

  // Calculate mEq needed to acidify sparge water to target pH
  private calculateSpargeAcid_mEq(spargeWater: WaterProfile, volumeLiters: number, targetPH: number = 5.5) {
    const alkalinityMEq = (spargeWater.bicarbonate * 0.82 * volumeLiters) / 50
    const currentPH = spargeWater.ph || 7.0
    const deltaPH = Math.max(0, currentPH - targetPH)
    const mEqNeeded = alkalinityMEq * deltaPH * 0.5 // empirical factor
    return mEqNeeded
  }

  // Acid strength (mEq/mL) per acid type and concentration
  private getAcidStrength(type: 'lactic' | 'phosphoric' | 'hydrochloric' | 'sulfuric', concentrationPct: number): number {
    const table: Record<string, Record<number, number>> = {
      lactic: { 88: 11.76, 80: 10.45, 50: 6.22, 10: 1.13 },
      phosphoric: { 85: 14.67, 75: 12.12, 10: 1.07 },
      hydrochloric: { 37: 11.98, 31: 9.78, 10: 2.87 },
      sulfuric: { 96: 36.77, 93: 34.88, 10: 2.18 }
    }
    const map = table[type]
    if (!map) return 0
    if (map[concentrationPct]) return map[concentrationPct]
    // Fallback to nearest defined concentration
    const keys = Object.keys(map).map(k => parseFloat(k)).sort((a, b) => Math.abs(a - concentrationPct) - Math.abs(b - concentrationPct))
    const nearest = keys[0]
    return map[nearest]
  }

  private describeAcid(type: 'lactic' | 'phosphoric' | 'hydrochloric' | 'sulfuric', concentrationPct: number): string {
    const names: Record<string, string> = {
      lactic: 'Lactic Acid',
      phosphoric: 'Phosphoric Acid',
      hydrochloric: 'Hydrochloric Acid',
      sulfuric: 'Sulfuric Acid'
    }
    return `${names[type]} (${concentrationPct}%)`
  }

  private applySaltAdjustments(water: WaterProfile, adjustments: any[], volumeLiters: number) {
    for (const adjustment of adjustments) {
      const salt = SALT_DEFINITIONS[adjustment.id as keyof typeof SALT_DEFINITIONS]
      if (salt && salt.ionsPPMPerGram) {
        const gramsPerLiter = adjustment.amount / volumeLiters
        
        // Add ions from this salt
        if (salt.ionsPPMPerGram.calcium) {
          water.calcium += salt.ionsPPMPerGram.calcium * gramsPerLiter
        }
        if (salt.ionsPPMPerGram.magnesium) {
          water.magnesium += salt.ionsPPMPerGram.magnesium * gramsPerLiter
        }
        if (salt.ionsPPMPerGram.sodium) {
          water.sodium += salt.ionsPPMPerGram.sodium * gramsPerLiter
        }
        if (salt.ionsPPMPerGram.sulfate) {
          water.sulfate += salt.ionsPPMPerGram.sulfate * gramsPerLiter
        }
        if (salt.ionsPPMPerGram.chloride) {
          water.chloride += salt.ionsPPMPerGram.chloride * gramsPerLiter
        }
        if (salt.ionsPPMPerGram.bicarbonate) {
          water.bicarbonate += salt.ionsPPMPerGram.bicarbonate * gramsPerLiter
        }
      }
    }
  }

  private calculatePredictions(water: WaterProfile, grainBill: GrainBillItem[], mashVolumeLiters: number = 15) {
    // Implement Bru'n Water mash pH calculation algorithm
    const mashPH = this.calculateMashPH_BrunWater(water, grainBill, mashVolumeLiters)
    
    // Calculate proper residual alkalinity using Kolbach's formula
    const residualAlkalinity = this.calculateResidualAlkalinity(water)
    
    // Sulfate to chloride ratio
    const sulfateChlorideRatio = water.sulfate / Math.max(water.chloride, 1)
    
    // Effective hardness (Ca + Mg)
    const effectiveHardness = water.calcium + water.magnesium
    
    // Total hardness as CaCO3
    const totalHardness = water.calcium * 2.5 + water.magnesium * 4.1
    
    return {
      mashPH,
      finalPH: mashPH - 0.1, // Approximate final beer pH
      residualAlkalinity,
      sulfateChlorideRatio,
      effectiveHardness,
      totalHardness
    }
  }

  // Enhanced mash pH calculation with better specialty grain handling
  private calculateMashPH_BrunWater(water: WaterProfile, grainBill: GrainBillItem[], mashVolumeLiters: number): number {
    // Step 1: Calculate weighted grain pH and acidity contributions
    const totalGrainKg = grainBill.reduce((sum, grain) => sum + grain.amountKg, 0)
    let weightedGrainPH = 0
    let totalAcidity = 0
    let totalBufferCapacity = 0
    
    // Analyze grain bill composition
    let roastedPercent = 0
    let crystalPercent = 0
    
    for (const grain of grainBill) {
      const grainFraction = grain.amountKg / totalGrainKg
      const grainData = lookupGrainData(grain.name, grain.color)
      
      weightedGrainPH += grainData.diWaterPH * grainFraction
      totalAcidity += grainData.acidity * grain.amountKg
      totalBufferCapacity += grainData.bufferCapacity * grain.amountKg
      
      // Track specialty grain percentages
      if (grainData.grainType === 'roasted') {
        roastedPercent += grainFraction * 100
      } else if (grainData.grainType === 'crystal') {
        crystalPercent += grainFraction * 100
      }
    }
    
    // Step 2: Calculate residual alkalinity effect
    const RA = this.calculateResidualAlkalinity(water)
    
    // Step 3: Mash thickness effect
    const mashThickness = mashVolumeLiters / totalGrainKg // L/kg
    const thicknessAdjustment = 1 + (mashThickness - 2.7) * 0.045
    
    // Step 4: Corrected pH calculation using simplified but accurate model
    let mashPH = weightedGrainPH
    
    // Residual alkalinity effect (primary driver)
    const raEffect = RA * 0.0035 / Math.sqrt(mashThickness) // Refined RA effect
    mashPH += raEffect
    
    // Specialty grain acidity effect (enhanced for roasted grains)
    let acidityEffect = (totalAcidity / 1000) * 0.15 // Corrected scaling
    
    // Enhanced acidity for roasted grains (they contribute more acidity than expected)
    if (roastedPercent > 0) {
      const roastedBonus = roastedPercent * 0.008 // Strong acidity effect from roasted grains
      acidityEffect += roastedBonus
    }
    
    // Crystal grain effect (moderate pH depression)
    if (crystalPercent > 0) {
      const crystalEffect = crystalPercent * 0.003 // Crystal grains contribute acidity
      acidityEffect += crystalEffect
    }
    
    mashPH -= acidityEffect
    
    // Constrain to reasonable brewing range
    mashPH = Math.max(4.5, Math.min(6.5, mashPH))
    
    return Math.round(mashPH * 100) / 100
  }

  // Kolbach's Residual Alkalinity formula
  private calculateResidualAlkalinity(water: WaterProfile): number {
    const alkalinityAsCaCO3 = water.bicarbonate * 0.82 + (water.carbonate || 0) * 1.67
    const RA = alkalinityAsCaCO3 - (water.calcium / 1.4) - (water.magnesium / 1.7)
    return Math.round(RA * 10) / 10 // Round to 1 decimal place
  }

  // Ion balance validation
  private validateIonBalance(water: WaterProfile): { balance: number, valid: boolean } {
    // Calculate cation equivalents
    const cationMEq = water.calcium / 20.04 + 
                     water.magnesium / 12.15 + 
                     water.sodium / 22.99
    
    // Calculate anion equivalents
    const anionMEq = water.bicarbonate / 61.02 + 
                    (water.carbonate || 0) / 30.01 + 
                    water.sulfate / 48.03 + 
                    water.chloride / 35.45
    
    // Balance percentage
    const balance = ((cationMEq - anionMEq) / (cationMEq + anionMEq)) * 100
    const valid = Math.abs(balance) <= 5 // Within ±5%
    
    return { balance: Math.round(balance * 10) / 10, valid }
  }

  private generateWarnings(water: WaterProfile, predictions: any): string[] {
    const warnings = []
    
    // pH warnings
    if (predictions.mashPH < 5.0) {
      warnings.push('Mash pH is dangerously low - may extract harsh tannins')
    } else if (predictions.mashPH < 5.2) {
      warnings.push('Mash pH is quite low - monitor extraction')
    }
    
    if (predictions.mashPH > 5.8) {
      warnings.push('Mash pH is high - poor conversion efficiency expected')
    } else if (predictions.mashPH > 5.6) {
      warnings.push('Mash pH is slightly high - consider acid addition')
    }
    
    // Ion level warnings
    if (water.calcium < 50) {
      warnings.push('Calcium too low - yeast health and enzyme activity may suffer')
    } else if (water.calcium > 200) {
      warnings.push('Calcium very high - may cause harsh astringent flavors')
    }
    
    if (water.magnesium > 30) {
      warnings.push('Magnesium high - may contribute bitter, astringent flavors')
    }
    
    if (water.sodium > 150) {
      warnings.push('Sodium high - may taste salty and harsh')
    }
    
    if (water.sulfate > 500) {
      warnings.push('Sulfate very high - may be overly dry and harsh')
    }
    
    if (water.chloride > 250) {
      warnings.push('Chloride very high - may taste salty')
    }
    
    if (water.bicarbonate > 300) {
      warnings.push('Bicarbonate very high - difficult to achieve proper mash pH')
    }
    
    // Residual alkalinity warnings
    if (predictions.residualAlkalinity < -50) {
      warnings.push('Very negative RA - may over-acidify the mash')
    } else if (predictions.residualAlkalinity > 100) {
      warnings.push('High RA - will be difficult to achieve proper mash pH')
    }
    
    return warnings
  }

  private generateRecommendations(water: WaterProfile, predictions: any): string[] {
    const recommendations = []
    
    if (predictions.sulfateChlorideRatio > 2) {
      recommendations.push('Good sulfate/chloride ratio for hoppy beers')
    } else if (predictions.sulfateChlorideRatio < 1) {
      recommendations.push('Good sulfate/chloride ratio for malty beers')
    }
    
    if (predictions.effectiveHardness >= 150 && predictions.effectiveHardness <= 300) {
      recommendations.push('Good effective hardness for most beer styles')
    }
    
    return recommendations
  }
}
