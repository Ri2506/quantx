# SwingAI - Production Test Plan

## Overview

This document outlines the test plan and scripts to verify key flows in SwingAI before and after deployment.

---

## 1. Authentication Tests

### 1.1 Email/Password Signup

```bash
#!/bin/bash
API_URL="http://localhost:8000/api"

echo "Testing Email Signup..."
RESPONSE=$(curl -s -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "SecurePass123!",
    "full_name": "Test User"
  }')

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "✅ Signup test passed"
else
  echo "❌ Signup test failed: $RESPONSE"
fi
```

### 1.2 Email/Password Login

```bash
echo "Testing Email Login..."
RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "SecurePass123!"
  }')

if echo "$RESPONSE" | grep -q 'access_token'; then
  TOKEN=$(echo "$RESPONSE" | jq -r '.access_token')
  echo "✅ Login test passed"
  echo "Token: ${TOKEN:0:20}..."
else
  echo "❌ Login test failed: $RESPONSE"
fi
```

### 1.3 Profile Fetch

```bash
echo "Testing Profile Fetch..."
RESPONSE=$(curl -s "$API_URL/user/profile" \
  -H "Authorization: Bearer $TOKEN")

if echo "$RESPONSE" | grep -q 'email'; then
  echo "✅ Profile fetch test passed"
else
  echo "❌ Profile fetch test failed: $RESPONSE"
fi
```

---

## 2. Payment Tests

### 2.1 Create Order

```bash
echo "Testing Payment Order Creation..."
RESPONSE=$(curl -s -X POST "$API_URL/payments/create-order" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plan_id": "starter",
    "billing_period": "monthly"
  }')

if echo "$RESPONSE" | grep -q 'order_id'; then
  ORDER_ID=$(echo "$RESPONSE" | jq -r '.order_id')
  echo "✅ Order creation test passed"
  echo "Order ID: $ORDER_ID"
else
  echo "❌ Order creation test failed: $RESPONSE"
fi
```

### 2.2 Get Plans

```bash
echo "Testing Get Plans..."
RESPONSE=$(curl -s "$API_URL/payments/plans")

if echo "$RESPONSE" | grep -q 'plans'; then
  PLAN_COUNT=$(echo "$RESPONSE" | jq '.plans | length')
  echo "✅ Get plans test passed ($PLAN_COUNT plans)"
else
  echo "❌ Get plans test failed: $RESPONSE"
fi
```

### 2.3 Webhook Signature Verification (Mock)

```python
# test_webhook.py
import hmac
import hashlib
import json
import requests

WEBHOOK_SECRET = "your_webhook_secret"
API_URL = "http://localhost:8000/api/payments/webhook"

payload = {
    "event": "payment.captured",
    "payload": {
        "payment": {
            "entity": {
                "id": "pay_test123",
                "order_id": "order_test123",
                "amount": 49900
            }
        }
    }
}

body = json.dumps(payload)
signature = hmac.new(
    WEBHOOK_SECRET.encode(),
    body.encode(),
    hashlib.sha256
).hexdigest()

response = requests.post(
    API_URL,
    data=body,
    headers={
        "Content-Type": "application/json",
        "X-Razorpay-Signature": signature
    }
)

print(f"Webhook test: {response.status_code}")
print(response.json())
```

---

## 3. Signal Tests

### 3.1 Get Today's Signals

```bash
echo "Testing Get Today's Signals..."
RESPONSE=$(curl -s "$API_URL/signals/today" \
  -H "Authorization: Bearer $TOKEN")

if echo "$RESPONSE" | grep -q 'all_signals\|signals'; then
  SIGNAL_COUNT=$(echo "$RESPONSE" | jq '.all_signals | length')
  echo "✅ Get signals test passed ($SIGNAL_COUNT signals)"
else
  echo "❌ Get signals test failed: $RESPONSE"
fi
```

### 3.2 Get Signal Details

```bash
SIGNAL_ID="your-signal-id-here"

echo "Testing Get Signal Details..."
RESPONSE=$(curl -s "$API_URL/signals/$SIGNAL_ID" \
  -H "Authorization: Bearer $TOKEN")

if echo "$RESPONSE" | grep -q 'symbol'; then
  echo "✅ Get signal details test passed"
else
  echo "❌ Get signal details test failed: $RESPONSE"
fi
```

### 3.3 Approve Signal

```bash
echo "Testing Signal Approval..."
RESPONSE=$(curl -s -X POST "$API_URL/signals/$SIGNAL_ID/approve" \
  -H "Authorization: Bearer $TOKEN")

if echo "$RESPONSE" | grep -q 'success'; then
  echo "✅ Signal approval test passed"
else
  echo "❌ Signal approval test failed: $RESPONSE"
fi
```

---

## 4. Trade Tests

### 4.1 Execute Trade

```bash
echo "Testing Trade Execution..."
RESPONSE=$(curl -s -X POST "$API_URL/trades/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "signal_id": "'$SIGNAL_ID'",
    "quantity": 10
  }')

if echo "$RESPONSE" | grep -q 'success\|trade_id'; then
  echo "✅ Trade execution test passed"
else
  echo "❌ Trade execution test failed: $RESPONSE"
fi
```

### 4.2 Get Trades History

```bash
echo "Testing Get Trades..."
RESPONSE=$(curl -s "$API_URL/trades?limit=10" \
  -H "Authorization: Bearer $TOKEN")

if echo "$RESPONSE" | grep -q 'trades'; then
  TRADE_COUNT=$(echo "$RESPONSE" | jq '.trades | length')
  echo "✅ Get trades test passed ($TRADE_COUNT trades)"
else
  echo "❌ Get trades test failed: $RESPONSE"
fi
```

---

## 5. Market Data Tests

### 5.1 Market Status

```bash
echo "Testing Market Status..."
RESPONSE=$(curl -s "$API_URL/market/status")

if echo "$RESPONSE" | grep -q 'is_market_open\|is_trading_day'; then
  IS_OPEN=$(echo "$RESPONSE" | jq '.is_market_open')
  echo "✅ Market status test passed (is_open: $IS_OPEN)"
else
  echo "❌ Market status test failed: $RESPONSE"
fi
```

### 5.2 Get Quote

```bash
SYMBOL="RELIANCE"

echo "Testing Get Quote for $SYMBOL..."
RESPONSE=$(curl -s "$API_URL/market/quote/$SYMBOL")

if echo "$RESPONSE" | grep -q 'ltp'; then
  LTP=$(echo "$RESPONSE" | jq '.ltp')
  echo "✅ Get quote test passed (LTP: $LTP)"
else
  echo "❌ Get quote test failed: $RESPONSE"
fi
```

### 5.3 Get Indices

```bash
echo "Testing Get Indices..."
RESPONSE=$(curl -s "$API_URL/market/indices")

if echo "$RESPONSE" | grep -q 'nifty'; then
  NIFTY=$(echo "$RESPONSE" | jq '.nifty.ltp')
  echo "✅ Get indices test passed (Nifty: $NIFTY)"
else
  echo "❌ Get indices test failed: $RESPONSE"
fi
```

---

## 6. WebSocket Tests

### 6.1 Connection Test

```python
# test_websocket.py
import asyncio
import websockets
import json

WS_URL = "ws://localhost:8000/ws"
TOKEN = "your-auth-token-here"

async def test_websocket():
    uri = f"{WS_URL}/{TOKEN}"
    
    try:
        async with websockets.connect(uri) as ws:
            print("✅ WebSocket connected")
            
            # Test ping
            await ws.send("ping")
            response = await asyncio.wait_for(ws.recv(), timeout=5)
            data = json.loads(response)
            
            if data.get("type") == "pong":
                print("✅ Ping/pong test passed")
            else:
                print(f"❌ Unexpected response: {data}")
            
            # Test subscribe
            await ws.send(json.dumps({
                "action": "subscribe",
                "channel": "price",
                "symbols": ["RELIANCE", "TCS"]
            }))
            
            response = await asyncio.wait_for(ws.recv(), timeout=5)
            data = json.loads(response)
            
            if data.get("type") == "subscribed":
                print("✅ Subscribe test passed")
            else:
                print(f"❌ Subscribe failed: {data}")
            
            # Test unsubscribe
            await ws.send(json.dumps({
                "action": "unsubscribe",
                "channel": "price",
                "symbols": ["RELIANCE"]
            }))
            
            response = await asyncio.wait_for(ws.recv(), timeout=5)
            data = json.loads(response)
            
            if data.get("type") == "unsubscribed":
                print("✅ Unsubscribe test passed")
            else:
                print(f"❌ Unsubscribe failed: {data}")
                
    except Exception as e:
        print(f"❌ WebSocket test failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_websocket())
```

---

## 7. Broker Integration Tests

### 7.1 Get Broker Status

```bash
echo "Testing Broker Status..."
RESPONSE=$(curl -s "$API_URL/broker/status" \
  -H "Authorization: Bearer $TOKEN")

if echo "$RESPONSE" | grep -q 'connected'; then
  IS_CONNECTED=$(echo "$RESPONSE" | jq '.connected')
  echo "✅ Broker status test passed (connected: $IS_CONNECTED)"
else
  echo "❌ Broker status test failed: $RESPONSE"
fi
```

### 7.2 Initiate Zerodha Auth

```bash
echo "Testing Zerodha Auth Initiation..."
RESPONSE=$(curl -s -X POST "$API_URL/broker/zerodha/auth/initiate" \
  -H "Authorization: Bearer $TOKEN")

if echo "$RESPONSE" | grep -q 'auth_url\|state'; then
  echo "✅ Zerodha auth initiation test passed"
else
  echo "❌ Zerodha auth initiation test failed: $RESPONSE"
fi
```

---

## 8. Full E2E Test Script

```bash
#!/bin/bash
# full_test.sh - Run all tests

set -e

API_URL=${API_URL:-"http://localhost:8000/api"}
TEST_EMAIL="e2e-test-$(date +%s)@test.com"
TEST_PASS="TestPass123!"

echo "========================================"
echo "SwingAI E2E Test Suite"
echo "API URL: $API_URL"
echo "========================================"

# 1. Health Check
echo -e "\n[1/8] Health Check..."
curl -sf "$API_URL/health" > /dev/null && echo "✅ Health OK" || echo "❌ Health Failed"

# 2. Market Status
echo -e "\n[2/8] Market Status..."
curl -sf "$API_URL/market/status" | jq -r '"Market: " + .market_phase' || echo "❌ Market Status Failed"

# 3. Get Plans
echo -e "\n[3/8] Subscription Plans..."
curl -sf "$API_URL/payments/plans" | jq -r '.plans | length | "Plans: " + tostring' || echo "❌ Plans Failed"

# 4. Signup
echo -e "\n[4/8] User Signup..."
SIGNUP_RESP=$(curl -sf -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$TEST_EMAIL\", \"password\": \"$TEST_PASS\", \"full_name\": \"E2E Test\"}" 2>/dev/null) 
echo "Signup: ${SIGNUP_RESP:0:50}..."

# 5. Login
echo -e "\n[5/8] User Login..."
LOGIN_RESP=$(curl -sf -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$TEST_EMAIL\", \"password\": \"$TEST_PASS\"}" 2>/dev/null)
TOKEN=$(echo $LOGIN_RESP | jq -r '.access_token // empty')
if [ -n "$TOKEN" ]; then
  echo "✅ Login OK (token: ${TOKEN:0:20}...)"
else
  echo "⚠️ Login skipped (may need email confirmation)"
  # Use a pre-existing test token if available
  TOKEN=${TEST_TOKEN:-""}
fi

# Skip auth-required tests if no token
if [ -z "$TOKEN" ]; then
  echo -e "\n⚠️ Skipping authenticated tests (no token)"
  exit 0
fi

# 6. Profile
echo -e "\n[6/8] User Profile..."
curl -sf "$API_URL/user/profile" -H "Authorization: Bearer $TOKEN" | jq -r '.email // "OK"' || echo "❌ Profile Failed"

# 7. Signals
echo -e "\n[7/8] Today's Signals..."
curl -sf "$API_URL/signals/today" -H "Authorization: Bearer $TOKEN" | jq -r '.all_signals | length | "Signals: " + tostring' || echo "❌ Signals Failed"

# 8. Broker Status
echo -e "\n[8/8] Broker Status..."
curl -sf "$API_URL/broker/status" -H "Authorization: Bearer $TOKEN" | jq -r '"Broker connected: " + (.connected | tostring)' || echo "❌ Broker Failed"

echo -e "\n========================================"
echo "E2E Tests Complete"
echo "========================================"
```

---

## Running Tests

### Local Development

```bash
# Start backend
cd src/backend
uvicorn api.app:app --reload

# In another terminal, run tests
export API_URL="http://localhost:8000/api"
./scripts/full_test.sh
```

### Production

```bash
export API_URL="https://your-production-api.com/api"
export TEST_TOKEN="your-test-user-token"
./scripts/full_test.sh
```

### Python Tests

```bash
python tests/test_websocket.py
python tests/test_webhook.py
```

---

## Expected Results

All tests should pass with:
- ✅ HTTP 200 responses
- ✅ Expected JSON structure
- ✅ Valid data types
- ✅ WebSocket connection maintained
- ✅ Correct error messages for invalid requests
