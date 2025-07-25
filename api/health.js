// Enhanced health check with Vercel function warming
const gameManager = require('./shared/gameState');

module.exports = async (req, res) => {
  // CORS headers for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const startTime = Date.now();
  
  try {
    console.log('🏥 Health check initiated');
    
    // Get comprehensive system health
    const health = await gameManager.healthCheck();
    
    // Add performance metrics
    const responseTime = Date.now() - startTime;
    const systemInfo = {
      timestamp: Date.now(),
      responseTime: responseTime,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: process.memoryUsage(),
        uptime: process.uptime()
      },
      vercel: {
        region: process.env.VERCEL_REGION || 'unknown',
        deployment: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local',
        functionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'health'
      }
    };

    // Determine overall health status
    let status = 'healthy';
    let warnings = [];
    
    if (health.serverless.coldStart) {
      status = 'warming';
      warnings.push('Function was cold started');
    }
    
    if (responseTime > 5000) {
      status = 'slow';
      warnings.push('Response time > 5s');
    }
    
    if (!health.kvAvailable && health.gameData.rooms > 10) {
      status = 'degraded';
      warnings.push('No persistent storage with active games');
    }

    // Function warming logic
    if (req.query.warm === 'true') {
      console.log('🔥 Function warming requested');
      
      // Perform lightweight operations to warm up
      await gameManager.cleanup();
      
      // Test storage if available
      if (health.kvAvailable) {
        try {
          const testKey = 'warm:test';
          const testData = { timestamp: Date.now(), test: true };
          await gameManager.storageManager.setKV(testKey, testData, 60);
          const result = await gameManager.storageManager.getKV(testKey);
          console.log('🔥 Storage warm-up completed');
        } catch (error) {
          console.log('⚠️ Storage warm-up failed:', error.message);
        }
      }
    }

    const response = {
      status,
      warnings,
      health,
      system: systemInfo,
      message: `Health check completed in ${responseTime}ms`
    };

    // Set appropriate status code
    const statusCode = status === 'healthy' ? 200 : 
                      status === 'warming' ? 202 : 
                      status === 'slow' ? 206 : 503;

    console.log(`✅ Health check completed: ${status} in ${responseTime}ms`);
    
    res.status(statusCode).json(response);
    
  } catch (error) {
    console.error('❌ Health check failed:', error);
    
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: Date.now(),
      responseTime: Date.now() - startTime,
      message: 'Health check failed'
    });
  }
}; 