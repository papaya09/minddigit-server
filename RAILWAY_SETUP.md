# 🚀 Railway Deployment Guide for MindDigits Server

Railway รองรับ Socket.IO และ persistent connections เต็มรูปแบบ

## 📋 ขั้นตอนการ Deploy

### 1. สร้าง Railway Account
- ไปที่ [railway.app](https://railway.app)
- Sign up/Login ด้วย GitHub account
- Connect กับ repository `papaya09/minddigit-server`

### 2. Deploy Project
**Web Interface (แนะนำ):**
1. เข้า Railway Dashboard
2. กดปุ่ม "New Project"
3. เลือก "Deploy from GitHub repo"
4. เลือก `papaya09/minddigit-server`
5. กดปุ่ม "Deploy Now"

### 3. ตั้งค่า Environment Variables

ใน Railway Dashboard → Settings → Variables:

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/minddigit
NODE_ENV=production
CORS_ORIGIN=*
PORT=3000
```

### 4. อัปเดต iOS Client

แก้ไข `NumberGame/NumberGame/GameClient.swift`:

```swift
init(serverURL: String = "https://your-railway-url.railway.app") {
    // ... existing code
}
```

## 🎯 ข้อดี Railway:
- ✅ **Socket.IO ทำงานได้เต็มรูปแบบ**
- ✅ **Real-time multiplayer gaming**
- ✅ **Persistent connections**
- ✅ **WebSocket support**

**Railway เป็นตัวเลือกที่ดีที่สุดสำหรับ Socket.IO applications!** 🚀
