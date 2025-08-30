import express from 'express';
import cors from 'cors';
import { handleManualCalculation } from './endpoints/calculate/manual';
import { handleAutoCalculation } from './endpoints/calculate/auto';
import { getWaterProfiles, getWaterProfile, getProfilesForStyle } from './endpoints/profiles/water';
import { getStyleProfiles, getStyleProfile, getStyleWaterRecommendations, findStylesForWater } from './endpoints/profiles/styles';
import { validateRecipe } from './endpoints/validate/validate';

const app = express();
const PORT = process.env.PORT || 3456;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0' });
});

// V2 API endpoints
// Calculation endpoints
app.post('/api/v2/calculate/manual', handleManualCalculation);
app.post('/api/v2/calculate/auto', handleAutoCalculation);

// Water profile endpoints
app.get('/api/v2/profiles/water', getWaterProfiles);
app.get('/api/v2/profiles/water/:id', getWaterProfile);
app.get('/api/v2/profiles/water/style/:style', getProfilesForStyle);

// Style profile endpoints
app.get('/api/v2/profiles/styles', getStyleProfiles);
app.get('/api/v2/profiles/styles/:id', getStyleProfile);
app.post('/api/v2/profiles/styles/:id/recommendations', getStyleWaterRecommendations);
app.post('/api/v2/profiles/styles/match', findStylesForWater);

// Validation endpoint
app.post('/api/v2/validate', validateRecipe);

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Water Chemistry API v2 running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Manual calculation: POST http://localhost:${PORT}/api/v2/calculate/manual`);
  console.log(`Auto calculation: POST http://localhost:${PORT}/api/v2/calculate/auto`);
});