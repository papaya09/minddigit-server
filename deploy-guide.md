# 🚀 Vercel Deployment Guide

## Server Configuration ✅
- ✅ `test-server.js` configured for Vercel
- ✅ `package.json` updated to use test-server.js
- ✅ `vercel.json` configured with proper routes
- ✅ CORS configured for iOS app and production

## Deploy Commands:

### 1. สำหรับ First-time Deploy:
```bash
cd server-node
npm install -g vercel     # Install Vercel CLI
vercel login              # Login to Vercel account
vercel                    # Deploy with prompts
```

### 2. สำหรับ Re-deploy หลังแก้ไข:
```bash
cd server-node
vercel --prod            # Deploy to production
```

## Environment Variables (Optional):
```bash
# Set in Vercel Dashboard if needed
NODE_ENV=production
```

## Test After Deploy:
```bash
# Test health endpoint
curl https://your-domain.vercel.app/api/health

# Test room creation
curl -X POST https://your-domain.vercel.app/api/room/join-simple \
     -H "Content-Type: application/json" \
     -d '{"playerName": "TestPlayer"}'
```

## URL Configuration:

### Production (Vercel):
- Server: `https://minddigit-server.vercel.app`
- API: `https://minddigit-server.vercel.app/api`

### Development (Local):
- Server: `http://192.168.1.140:3001`
- API: `http://192.168.1.140:3001/api`

## Switch Between Environments:

### Use Production (Vercel):
```swift
// In NumberGame/NumberGame/AppConfig.swift
static let isProduction = true
```

### Use Development (Local):
```swift
// In NumberGame/NumberGame/AppConfig.swift
static let isProduction = false
```

## 🎯 Next Steps:
1. Deploy to Vercel using commands above
2. Test all endpoints work correctly
3. Update iOS app if needed (already configured!)
4. Build and test iOS app with production server 