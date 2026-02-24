# SwingAI Production Deployment Guide

## Overview

This guide covers deploying SwingAI to production with:
- FastAPI backend on any cloud provider
- Next.js 14 frontend on Vercel
- Supabase for Auth + PostgreSQL
- Modal for ML inference
- Optional Redis for real-time features

---

## Prerequisites

### Required Accounts

1. **Supabase** (https://supabase.com)
   - Create a new project
   - Get your URL, Anon Key, and Service Role Key

2. **Vercel** (https://vercel.com) - for frontend
   - Connect your GitHub repository

3. **Cloud Provider** - for backend (choose one)
   - Railway (recommended for simplicity)
   - Render
   - AWS EC2/ECS
   - Google Cloud Run

4. **Modal** (https://modal.com) - for ML inference
   - Sign up and get API token

5. **Razorpay** (https://razorpay.com) - for payments
   - Create account and get API keys

6. **Optional: Redis** (https://upstash.com)
   - For real-time WebSocket features

### Broker API Keys (for users to connect)

- **Zerodha KiteConnect**: https://developers.kite.trade
- **Angel One SmartAPI**: https://smartapi.angelone.in
- **Upstox API**: https://upstox.com/developer/api

---

## Step 1: Database Setup (Supabase)

### 1.1 Create Project

1. Go to https://supabase.com/dashboard
2. Click "New Project"
3. Choose organization, name, password, region
4. Wait for project to be ready

### 1.2 Run Migrations

1. Go to SQL Editor in Supabase Dashboard
2. Run the base schema:
   ```sql
   -- Copy contents of infrastructure/database/complete_schema.sql
   ```
3. Run the production migrations:
   ```sql
   -- Copy contents of infrastructure/database/production_migrations.sql
   ```

### 1.3 Configure Authentication

1. Go to Authentication > Settings
2. Enable Email/Password auth
3. Enable Google OAuth (optional):
   - Go to Google Cloud Console
   - Create OAuth credentials
   - Add Supabase callback URL
   - Add client ID/secret to Supabase

### 1.4 Get Credentials

Note these from Settings > API:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 2: Backend Deployment

### 2.1 Environment Variables

Create `.env.production`:

```bash
# Supabase
SUPABASE_URL=your-project-url
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# Security
SECRET_KEY=generate-a-long-random-string
BROKER_ENCRYPTION_KEY=run-python-to-generate
ENCRYPTION_SALT=swingai-unique-salt-here

# Razorpay
RAZORPAY_KEY_ID=rzp_live_xxxx
RAZORPAY_KEY_SECRET=xxxx
RAZORPAY_WEBHOOK_SECRET=xxxx

# Broker APIs (optional - users provide their own)
ZERODHA_API_KEY=
ZERODHA_API_SECRET=
ANGEL_API_KEY=
UPSTOX_API_KEY=
UPSTOX_API_SECRET=

# Modal ML
MODAL_TOKEN_ID=
MODAL_TOKEN_SECRET=

# Redis (optional)
ENABLE_REDIS=false
REDIS_URL=

# Frontend URL (for CORS)
FRONTEND_URL=https://your-frontend.vercel.app

# Environment
ENVIRONMENT=production
DEBUG=false
```

### 2.2 Generate Encryption Key

```python
# Run this Python code to generate BROKER_ENCRYPTION_KEY
from cryptography.fernet import Fernet
print(Fernet.generate_key().decode())
```

### 2.3 Deploy to Railway (Recommended)

1. Connect GitHub repo
2. Set root directory to `src/backend`
3. Add environment variables
4. Deploy

**Start command:**
```bash
uvicorn api.app:app --host 0.0.0.0 --port $PORT
```

### 2.4 Deploy to Render

1. Create new Web Service
2. Connect repo
3. Set root directory: `src/backend`
4. Build command: `pip install -r requirements.txt`
5. Start command: `uvicorn api.app:app --host 0.0.0.0 --port $PORT`

---

## Step 3: Frontend Deployment (Vercel)

### 3.1 Environment Variables

Add these in Vercel project settings:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=https://your-backend-url.railway.app/api
```

### 3.2 Deploy

1. Connect GitHub repo to Vercel
2. Set root directory: `src/frontend`
3. Framework preset: Next.js
4. Build settings:
   - Build command: `yarn build`
   - Output directory: `.next`
5. Deploy

---

## Step 4: ML Deployment (Modal)

### 4.1 Setup Modal

```bash
pip install modal
modal token new
```

### 4.2 Deploy ML Service

```bash
cd ml/inference
modal deploy enhanced_signal_generator.py
```

### 4.3 Get Endpoint URL

Note the deployed endpoint URL and add to backend env:
```bash
MODAL_ENDPOINT_URL=https://your-modal-endpoint.modal.run
```

---

## Step 5: Razorpay Setup

### 5.1 Create Account & Get Keys

1. Sign up at https://razorpay.com
2. Complete KYC verification
3. Go to Settings > API Keys
4. Generate Live keys

### 5.2 Configure Webhook

1. Go to Settings > Webhooks
2. Add new webhook:
   - URL: `https://your-backend-url/api/payments/webhook`
   - Events: 
     - `payment.captured`
     - `payment.failed`
     - `refund.created`
3. Note the Webhook Secret

---

## Step 6: Broker Integration Setup

### 6.1 Zerodha KiteConnect

1. Apply at https://developers.kite.trade
2. Get API key and secret
3. Set redirect URL to your callback endpoint

### 6.2 Angel One SmartAPI

1. Register at https://smartapi.angelone.in
2. Create app and get API key
3. Users will provide their own client credentials

### 6.3 Upstox

1. Register at https://upstox.com/developer/api
2. Create app and get credentials
3. Set redirect URL

---

## Step 7: Domain & SSL

### 7.1 Frontend Domain

1. In Vercel, add custom domain
2. Configure DNS records
3. SSL is automatic

### 7.2 Backend Domain

1. Add custom domain in your cloud provider
2. Configure DNS
3. Ensure SSL is enabled

### 7.3 Update CORS

Ensure `FRONTEND_URL` in backend matches your domain.

---

## Production Checklist

### Security
- [ ] All API keys are set as environment variables
- [ ] `SECRET_KEY` is a long random string
- [ ] `BROKER_ENCRYPTION_KEY` is generated properly
- [ ] CORS is configured for your domain only
- [ ] RLS policies are enabled in Supabase
- [ ] Rate limiting is enabled

### Database
- [ ] All migrations are run
- [ ] Indexes are created for performance
- [ ] RLS policies are active
- [ ] Auto-create profile trigger is set up
- [ ] Backup is configured

### Backend
- [ ] Environment is set to `production`
- [ ] `DEBUG=false`
- [ ] All required env vars are set
- [ ] Health check endpoint works
- [ ] Logging is configured

### Frontend
- [ ] Supabase credentials are correct
- [ ] API URL points to production backend
- [ ] No dev-mode mock data in production
- [ ] Error boundaries are in place

### Payments
- [ ] Razorpay live keys are set
- [ ] Webhook is configured and verified
- [ ] Test a payment flow

### Brokers
- [ ] OAuth redirect URLs are correct
- [ ] Credentials are encrypted
- [ ] Paper trading mode works

### Monitoring
- [ ] Error tracking (Sentry/LogRocket)
- [ ] Uptime monitoring
- [ ] Database monitoring
- [ ] API latency tracking

---

## Testing Production

### 1. Authentication Flow
```bash
# Test signup
curl -X POST https://your-backend/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "test123"}'

# Test login
curl -X POST https://your-backend/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "test123"}'
```

### 2. Market Data
```bash
# Test market status
curl https://your-backend/api/market/status

# Test quote
curl https://your-backend/api/market/quote/RELIANCE
```

### 3. Payments
```bash
# Test create order (with auth token)
curl -X POST https://your-backend/api/payments/create-order \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plan_id": "starter", "billing_period": "monthly"}'
```

### 4. WebSocket
```javascript
// Test WebSocket connection
const ws = new WebSocket('wss://your-backend/ws/YOUR_AUTH_TOKEN');
ws.onopen = () => ws.send('ping');
ws.onmessage = (e) => console.log(e.data);
```

---

## Troubleshooting

### Common Issues

1. **CORS errors**
   - Ensure `FRONTEND_URL` matches your domain exactly
   - Check that backend allows the origin

2. **Auth not working**
   - Verify Supabase URL and keys
   - Check that RLS policies allow access

3. **Payments failing**
   - Verify Razorpay keys are live (not test)
   - Check webhook signature

4. **Broker OAuth failing**
   - Verify redirect URLs match exactly
   - Check API key permissions

5. **WebSocket disconnecting**
   - Check auth token is valid
   - Verify backend supports WebSocket

### Logs

- Backend: Check your cloud provider's logs
- Frontend: Check browser console
- Supabase: Check dashboard logs
- Razorpay: Check dashboard webhooks

---

## Maintenance

### Regular Tasks

1. **Daily**
   - Check error logs
   - Monitor signal generation

2. **Weekly**
   - Review user signups
   - Check payment transactions
   - Update NSE holidays if needed

3. **Monthly**
   - Review and rotate API keys
   - Database performance review
   - Security audit

4. **Yearly**
   - Update NSE holiday calendar
   - Review subscription pricing
   - Major version updates

---

## Support

For issues:
1. Check this guide's troubleshooting section
2. Review application logs
3. Check GitHub issues
4. Contact support
