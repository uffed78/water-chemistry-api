# Water Chemistry API v2 Documentation

## Base URL
```
https://api.example.com/api/v2
```

## Authentication
Currently no authentication required (may change in production).

## Headers
```http
Content-Type: application/json
X-API-Version: 2 (optional, for version selection)
```

---

## Endpoints

### 1. Calculate - Manual
**POST** `/calculate/manual`

User provides exact salt/acid amounts, API calculates resulting water profile and pH.

#### Request
```json
{
  "sourceWater": {
    "calcium": 20,
    "magnesium": 5,
    "sodium": 10,
    "sulfate": 15,
    "chloride": 10,
    "bicarbonate": 30
  },
  "additions": {
    "salts": {
      "gypsum": 2.5,
      "calcium_chloride": 1.2,
      "epsom_salt": 0.5
    },
    "acids": {
      "lactic_88": 2.0
    }
  },
  "volumes": {
    "total": 32.2,
    "mash": 17,
    "sparge": 15.2
  },
  "grainBill": [
    {
      "name": "Pilsner Malt",
      "weight": 5.0,
      "color": 3,
      "type": "base"
    }
  ],
  "options": {
    "volumeMode": "mash",
    "phModel": "kaiser"
  }
}
```

#### Response
```json
{
  "achievedWater": {
    "calcium": 61.4,
    "magnesium": 7.9,
    "sodium": 10,
    "sulfate": 98.5,
    "chloride": 44.0,
    "bicarbonate": 30
  },
  "predictions": {
    "mashPH": 5.42,
    "sulfateChlorideRatio": 2.24,
    "residualAlkalinity": -15.3
  },
  "analysis": {
    "calciumLevel": "optimal",
    "flavorProfile": "hoppy",
    "warnings": [],
    "suggestions": ["Consider adding Epsom salt for yeast nutrition"]
  }
}
```

---

### 2. Calculate - Auto
**POST** `/calculate/auto`

API automatically calculates optimal salt additions to reach target profile.

#### Request
```json
{
  "sourceWater": {
    "calcium": 0,
    "magnesium": 0,
    "sodium": 0,
    "sulfate": 0,
    "chloride": 0,
    "bicarbonate": 0
  },
  "targetWater": {
    "calcium": 100,
    "magnesium": 10,
    "sodium": 20,
    "sulfate": 200,
    "chloride": 50,
    "bicarbonate": 30
  },
  "volumes": {
    "total": 30,
    "mash": 18,
    "sparge": 12
  },
  "grainBill": [
    {
      "name": "Pale Malt",
      "weight": 5.0,
      "color": 4,
      "type": "base"
    }
  ],
  "options": {
    "volumeMode": "mash",
    "phModel": "kaiser",
    "optimization": "balanced"
  }
}
```

#### Response
```json
{
  "adjustments": {
    "salts": [
      {
        "name": "gypsum",
        "amount": 6.5,
        "targetVolume": "mash"
      },
      {
        "name": "calcium_chloride",
        "amount": 1.8,
        "targetVolume": "mash"
      }
    ],
    "acids": [
      {
        "name": "lactic",
        "amount": 1.5,
        "concentration": 88,
        "targetVolume": "mash"
      }
    ]
  },
  "achievedWater": {
    "calcium": 98,
    "magnesium": 8,
    "sodium": 18,
    "sulfate": 195,
    "chloride": 48,
    "bicarbonate": 28
  },
  "predictions": {
    "mashPH": 5.4,
    "sulfateChlorideRatio": 4.06,
    "residualAlkalinity": -25
  },
  "analysis": {
    "matchPercentage": 92,
    "warnings": [],
    "suggestions": []
  }
}
```

---

### 3. Water Profiles
**GET** `/profiles/water`

List all available classic water profiles.

#### Response
```json
{
  "profiles": [
    {
      "id": "burton",
      "name": "Burton-on-Trent",
      "country": "England",
      "description": "Extremely hard water, high in sulfates",
      "goodFor": ["IPA", "Bitter", "Pale Ale"],
      "ions": {
        "calcium": 275,
        "magnesium": 40,
        "sodium": 25,
        "sulfate": 610,
        "chloride": 35,
        "bicarbonate": 270
      }
    },
    {
      "id": "pilsen",
      "name": "Pilsen",
      "country": "Czech Republic",
      "description": "Extremely soft water, ideal for delicate pale lagers",
      "goodFor": ["Pilsner", "Czech Lager", "Light Lager"],
      "ions": {
        "calcium": 7,
        "magnesium": 2,
        "sodium": 2,
        "sulfate": 5,
        "chloride": 5,
        "bicarbonate": 15
      }
    }
  ],
  "count": 10
}
```

**GET** `/profiles/water/:id`

Get specific water profile.

#### Example
```http
GET /profiles/water/dublin
```

#### Response
```json
{
  "id": "dublin",
  "name": "Dublin",
  "country": "Ireland",
  "calcium": 118,
  "magnesium": 4,
  "sodium": 12,
  "sulfate": 55,
  "chloride": 19,
  "bicarbonate": 160,
  "ph": 7.6,
  "description": "Moderately hard with high bicarbonate, perfect for dark beers",
  "history": "The high alkalinity of Dublin water neutralizes the acidity of dark roasted malts",
  "goodFor": ["Stout", "Porter", "Brown Ale"],
  "avoidFor": ["IPA", "Pilsner", "Pale Ale"]
}
```

---

### 4. Style Profiles
**GET** `/profiles/styles`

List all beer style profiles.

#### Response
```json
{
  "styles": [
    {
      "id": "american-ipa",
      "name": "American IPA",
      "category": "Hoppy",
      "targetWater": {
        "calcium": [100, 150],
        "magnesium": [5, 15],
        "sodium": [0, 50],
        "sulfate": [200, 350],
        "chloride": [40, 70],
        "bicarbonate": [0, 50]
      },
      "sulfateChlorideRatio": [3, 5],
      "targetMashPH": [5.2, 5.4]
    }
  ],
  "count": 12
}
```

**POST** `/profiles/styles/:id/recommendations`

Get water adjustment recommendations for a specific style.

#### Request
```json
{
  "sourceWater": {
    "calcium": 20,
    "magnesium": 5,
    "sodium": 10,
    "sulfate": 30,
    "chloride": 20,
    "bicarbonate": 40
  }
}
```

#### Response
```json
{
  "style": {
    "id": "american-ipa",
    "name": "American IPA",
    "category": "Hoppy"
  },
  "targetWater": {
    "calcium": [100, 150],
    "sulfate": [200, 350],
    "chloride": [40, 70]
  },
  "recommendations": [
    "Increase calcium to 100-150 ppm (currently 20 ppm)",
    "Add gypsum to increase sulfate",
    "Increase sulfate:chloride ratio (currently 1.5, target 3-5)"
  ],
  "warnings": []
}
```

---

### 5. Validation
**POST** `/validate`

Validate a recipe against brewing best practices.

#### Request
```json
{
  "sourceWater": {
    "calcium": 20,
    "magnesium": 5,
    "sodium": 10,
    "sulfate": 30,
    "chloride": 20,
    "bicarbonate": 40
  },
  "plannedAdditions": {
    "salts": {
      "gypsum": 2.0,
      "calcium_chloride": 1.0
    },
    "acids": {}
  },
  "grainBill": [
    {
      "name": "Pale Malt",
      "weight": 5.0,
      "color": 4,
      "type": "base"
    }
  ],
  "volumes": {
    "total": 30,
    "mash": 18,
    "sparge": 12
  },
  "concerns": ["yeast_health", "hop_utilization", "mash_ph", "clarity"]
}
```

#### Response
```json
{
  "valid": false,
  "issues": [
    {
      "severity": "warning",
      "message": "Calcium is adequate but not optimal (61 ppm)",
      "suggestion": "Consider increasing to 100+ ppm for better yeast flocculation"
    },
    {
      "severity": "error",
      "message": "Predicted mash pH too high (5.67)",
      "suggestion": "Add lactic or phosphoric acid to lower pH"
    }
  ],
  "predictions": {
    "fermentation": "good",
    "clarity": "clear"
  }
}
```

---

## Parameters

### Volume Modes
- `total` - All salts calculated on total volume (old method, less accurate)
- `mash` - All salts calculated on mash volume (Bru'n Water standard, recommended)
- `staged` - Salts distributed intelligently across mash/sparge/boil

### pH Models
- `simple` - Linear approximation based on residual alkalinity (±0.1 pH)
- `kaiser` - Based on Kai Troester's research (±0.05 pH)
- `advanced` - Full chemical equilibrium (most accurate)

### Optimization Strategies
- `balanced` - Prioritizes calcium, SO4:Cl ratio, and RA (allows ±10% deviation)
- `minimal` - Uses minimum salts possible (max 2-3 salts)
- `exact` - Attempts exact match using iterative solver

### Grain Types
- `base` - Base malts (Pilsner, Pale, Munich)
- `crystal` - Crystal/Caramel malts
- `roasted` - Roasted malts (Chocolate, Black)
- `acidulated` - Acidulated malt
- `wheat` - Wheat malts

---

## Examples

### Example 1: American IPA Water
```bash
curl -X POST https://api.example.com/api/v2/calculate/auto \
  -H "Content-Type: application/json" \
  -d '{
    "sourceWater": {
      "calcium": 20, "magnesium": 5, "sodium": 10,
      "sulfate": 15, "chloride": 10, "bicarbonate": 30
    },
    "targetWater": {
      "calcium": 125, "magnesium": 10, "sodium": 25,
      "sulfate": 300, "chloride": 75, "bicarbonate": 30
    },
    "volumes": { "total": 30, "mash": 18, "sparge": 12 },
    "grainBill": [
      { "name": "Pale 2-row", "weight": 5.5, "color": 3, "type": "base" },
      { "name": "Crystal 40", "weight": 0.3, "color": 80, "type": "crystal" }
    ],
    "options": {
      "volumeMode": "mash",
      "phModel": "kaiser",
      "optimization": "balanced"
    }
  }'
```

### Example 2: Czech Pilsner (Soft Water)
```bash
curl -X POST https://api.example.com/api/v2/calculate/manual \
  -H "Content-Type: application/json" \
  -d '{
    "sourceWater": {
      "calcium": 10, "magnesium": 3, "sodium": 5,
      "sulfate": 8, "chloride": 7, "bicarbonate": 20
    },
    "additions": {
      "salts": {},
      "acids": { "lactic_88": 0.5 }
    },
    "volumes": { "total": 28, "mash": 14, "sparge": 14 },
    "grainBill": [
      { "name": "Bohemian Pilsner", "weight": 4.5, "color": 2, "type": "base" }
    ],
    "options": { "volumeMode": "mash", "phModel": "simple" }
  }'
```

### Example 3: Irish Stout (High Alkalinity)
```bash
curl -X POST https://api.example.com/api/v2/calculate/auto \
  -H "Content-Type: application/json" \
  -d '{
    "sourceWater": {
      "calcium": 30, "magnesium": 8, "sodium": 15,
      "sulfate": 25, "chloride": 20, "bicarbonate": 50
    },
    "targetWater": {
      "calcium": 120, "magnesium": 10, "sodium": 25,
      "sulfate": 80, "chloride": 50, "bicarbonate": 150
    },
    "volumes": { "total": 25, "mash": 15, "sparge": 10 },
    "grainBill": [
      { "name": "Maris Otter", "weight": 3.8, "color": 5, "type": "base" },
      { "name": "Roasted Barley", "weight": 0.4, "color": 1000, "type": "roasted" },
      { "name": "Flaked Barley", "weight": 0.3, "color": 2, "type": "base" }
    ],
    "options": {
      "volumeMode": "mash",
      "phModel": "kaiser",
      "optimization": "balanced"
    }
  }'
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Invalid request",
  "details": [
    "Source water profile is required",
    "Volume mode is required"
  ]
}
```

### 404 Not Found
```json
{
  "error": "Profile not found",
  "id": "unknown-profile"
}
```

### 500 Internal Server Error
```json
{
  "error": "Calculation failed",
  "message": "Unable to converge on solution"
}
```

---

## Rate Limiting
- 100 requests per minute per IP
- 1000 requests per hour per IP

## Versioning
API version can be specified via:
1. URL path: `/api/v2/...`
2. Header: `X-API-Version: 2`

## Support
- Documentation: https://api.example.com/docs
- Issues: https://github.com/example/water-chemistry-api/issues
- Email: api-support@example.com