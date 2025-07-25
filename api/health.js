module.exports = (req, res) => {
  console.log('📊 Health check requested');
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    message: 'MindDigits Test Server',
    mode: 'test',
    platform: 'vercel-serverless',
    version: '2.0'
  });
}; 