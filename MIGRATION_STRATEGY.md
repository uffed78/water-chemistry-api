# Migration Strategy: v1 → v2

## Overview
This document outlines the migration strategy from Water Chemistry API v1 to v2, ensuring zero downtime and smooth transition for existing users.

## Key Differences v1 vs v2

### Breaking Changes
1. **PPM Calculation Method**
   - v1: Calculates on total volume (incorrect)
   - v2: Calculates on mash volume by default (correct, matches Bru'n Water)
   - **Impact**: v2 values will be ~1.5-2x higher for same salt additions

2. **Request/Response Structure**
   - v1: Single calculation mode
   - v2: Multiple modes (manual/auto), volume modes, pH models
   - **Impact**: New required fields in requests

3. **Water Profile Structure**
   - v1: Includes many optional fields
   - v2: Simplified, focused on essential ions
   - **Impact**: Some fields removed/renamed

### New Features in v2
- Multiple pH models (simple, kaiser, advanced)
- Volume modes (total, mash, staged)
- Optimization strategies (balanced, minimal, exact)
- Style profiles and recommendations
- Recipe validation endpoint
- Water/style profile endpoints

## Migration Phases

### Phase 1: Parallel Deployment (Weeks 1-2)
**Goal**: Deploy v2 alongside v1 without affecting existing users

```javascript
// Server configuration
app.use('/api/v1', v1Routes);  // Existing API
app.use('/api/v2', v2Routes);  // New API
```

**Actions**:
1. Deploy v2 to same server/service
2. Keep v1 endpoints unchanged
3. Add monitoring for both versions
4. Document differences in responses

### Phase 2: Soft Migration (Weeks 3-6)
**Goal**: Encourage migration to v2

**Headers Strategy**:
```javascript
// Support version selection via header
app.use((req, res, next) => {
  const apiVersion = req.headers['x-api-version'] || '1';
  req.apiVersion = apiVersion;
  
  // Add deprecation notice for v1
  if (apiVersion === '1') {
    res.setHeader('X-API-Deprecated', 'true');
    res.setHeader('X-API-Sunset-Date', '2025-06-01');
    res.setHeader('X-API-Migration-Guide', 'https://api.example.com/migration');
  }
  next();
});
```

**Response Warnings**:
```json
// v1 response with migration notice
{
  "data": { ... },
  "_deprecation": {
    "message": "API v1 is deprecated. Please migrate to v2",
    "sunset_date": "2025-06-01",
    "migration_guide": "https://...",
    "changes": [
      "PPM calculations now use mash volume (more accurate)",
      "New pH models available",
      "Style recommendations added"
    ]
  }
}
```

### Phase 3: Active Migration (Weeks 7-10)
**Goal**: Actively help users migrate

**Compatibility Layer**:
```typescript
// Transform v1 requests to v2 format
function transformV1ToV2Request(v1Request: any): CalculationRequest {
  return {
    sourceWater: v1Request.sourceWater,
    targetWater: v1Request.targetWater,
    grainBill: v1Request.grainBill.map(grain => ({
      ...grain,
      weight: grain.amountKg,  // Rename field
      type: mapGrainType(grain.grainType)
    })),
    volumes: v1Request.volumes,
    options: {
      volumeMode: 'total',  // Keep v1 behavior initially
      phModel: 'simple',
      optimization: 'balanced'
    }
  };
}

// Transform v2 response to v1 format
function transformV2ToV1Response(v2Response: any): any {
  return {
    ...v2Response,
    // Adjust PPM values if using mash mode
    achievedWater: adjustPPMForV1Compatibility(v2Response.achievedWater),
    // Map new fields to old structure
    predictions: {
      mashPH: v2Response.predictions.finalPH
    }
  };
}
```

### Phase 4: Sunset v1 (Week 11-12)
**Goal**: Complete migration to v2

**Final Steps**:
1. Email all API users about sunset date
2. Implement hard redirects:
```javascript
app.use('/api/v1/*', (req, res) => {
  res.status(410).json({
    error: 'API v1 has been sunset',
    message: 'Please use API v2',
    documentation: 'https://api.example.com/v2/docs',
    migration_guide: 'https://api.example.com/migration'
  });
});
```

## Migration Guide for Clients

### JavaScript/TypeScript Client
```typescript
// v1 Client Code
const calculateV1 = async (data) => {
  return fetch('/api/v1/calculate', {
    method: 'POST',
    body: JSON.stringify(data)
  });
};

// v2 Client Code - Minimal changes
const calculateV2 = async (data) => {
  // Transform data to v2 format
  const v2Data = {
    ...data,
    options: {
      volumeMode: 'mash',  // Use correct calculation
      phModel: 'kaiser',   // Better pH model
      optimization: 'balanced'
    }
  };
  
  return fetch('/api/v2/calculate/auto', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Version': '2'
    },
    body: JSON.stringify(v2Data)
  });
};

// Migration wrapper - gradual transition
const calculate = async (data) => {
  const useV2 = process.env.USE_API_V2 === 'true';
  
  if (useV2) {
    const response = await calculateV2(data);
    // Adjust response if needed for compatibility
    return response;
  } else {
    console.warn('Using deprecated API v1');
    return calculateV1(data);
  }
};
```

### Python Client
```python
# v1 Client
def calculate_v1(data):
    return requests.post('/api/v1/calculate', json=data)

# v2 Client with compatibility
class WaterChemistryClient:
    def __init__(self, api_version='2'):
        self.api_version = api_version
        self.base_url = f'/api/v{api_version}'
    
    def calculate(self, data):
        if self.api_version == '2':
            # Add v2 specific options
            data['options'] = {
                'volumeMode': 'mash',
                'phModel': 'kaiser',
                'optimization': 'balanced'
            }
            endpoint = f'{self.base_url}/calculate/auto'
        else:
            endpoint = f'{self.base_url}/calculate'
        
        return requests.post(endpoint, json=data)
    
    def migrate_to_v2(self):
        """Helper to migrate settings to v2"""
        self.api_version = '2'
        print("Migrated to API v2 - PPM values may differ (now more accurate)")
```

## Testing Migration

### Automated Tests
```typescript
describe('API Version Compatibility', () => {
  test('v1 endpoint still accessible during migration', async () => {
    const response = await fetch('/api/v1/calculate');
    expect(response.headers.get('X-API-Deprecated')).toBe('true');
  });
  
  test('v2 endpoint provides better accuracy', async () => {
    const v1Response = await calculateV1(testData);
    const v2Response = await calculateV2(testData);
    
    // v2 should have higher PPM values (mash volume)
    expect(v2Response.calcium).toBeGreaterThan(v1Response.calcium);
  });
  
  test('Compatibility layer transforms correctly', () => {
    const v1Request = { /* v1 format */ };
    const v2Request = transformV1ToV2Request(v1Request);
    
    expect(v2Request.options.volumeMode).toBe('total'); // Maintain v1 behavior
  });
});
```

### Monitoring During Migration
```javascript
// Track API version usage
app.use((req, res, next) => {
  const version = req.path.startsWith('/api/v2') ? 'v2' : 'v1';
  
  // Log metrics
  metrics.increment('api.requests', {
    version,
    endpoint: req.path,
    method: req.method
  });
  
  // Track migration progress
  if (version === 'v1') {
    metrics.increment('api.v1.deprecated_usage');
  }
  
  next();
});
```

## Rollback Plan

If issues arise during migration:

1. **Immediate Rollback**:
```bash
# Revert to v1 only
kubectl set image deployment/api api=water-chemistry:v1

# Or feature flag
export ENABLE_V2_API=false
```

2. **Data Issues**:
- Keep v1 calculation logic available as fallback
- Add feature flag for calculation method:
```typescript
const volumeMode = featureFlags.useCorrectPPM ? 'mash' : 'total';
```

3. **Client Issues**:
- Maintain compatibility layer longer
- Provide client SDK with automatic version negotiation

## Success Metrics

Track migration success:
- **Adoption Rate**: % of requests using v2
- **Error Rate**: v2 errors vs v1 errors
- **Performance**: v2 response time vs v1
- **Accuracy**: User feedback on calculation improvements
- **Client Satisfaction**: Support tickets related to migration

## Timeline Summary

| Week | Phase | Actions |
|------|-------|---------|
| 1-2 | Parallel Deployment | Deploy v2, monitor |
| 3-6 | Soft Migration | Add deprecation notices |
| 7-10 | Active Migration | Help users migrate |
| 11-12 | Sunset v1 | Complete transition |

## Support Resources

- **Migration Guide**: `/docs/migration`
- **API v2 Docs**: `/docs/v2`
- **Changelog**: `/docs/changelog`
- **Support Email**: api-support@example.com
- **Discord Channel**: #api-migration

## Post-Migration

After successful migration:
1. Remove v1 code
2. Optimize v2 performance
3. Add new features without compatibility concerns
4. Update all documentation to v2 only