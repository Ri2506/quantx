# Auth Testing Playbook for SwingAI

SwingAI uses Supabase for authentication (email/password + Google OAuth).

## Step 1: Test Email/Password Signup

```bash
API_URL="http://localhost:8000/api"

echo "Testing Signup..."
RESPONSE=$(curl -s -X POST "$API_URL/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!",
    "full_name": "Test User"
  }')

echo "$RESPONSE" | jq .
```

## Step 2: Test Email/Password Login

```bash
echo "Testing Login..."
RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!"
  }')

TOKEN=$(echo "$RESPONSE" | jq -r '.access_token')
echo "Token: ${TOKEN:0:30}..."
```

## Step 3: Test Authenticated Endpoints

```bash
# Get current user info
echo "Testing /api/auth/me..."
curl -s "$API_URL/auth/me" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Get user profile
echo "Testing /api/user/profile..."
curl -s "$API_URL/user/profile" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Get broker status
echo "Testing /api/broker/status..."
curl -s "$API_URL/broker/status" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

## Step 4: Test Google OAuth (Browser)

1. Navigate to `http://localhost:3000/login`
2. Click "Continue with Google"
3. Complete Google sign-in
4. Should redirect to `/auth/callback` then to `/dashboard`

The Supabase client (`detectSessionInUrl: true`) auto-picks up OAuth tokens from the URL hash.

## Checklist

- [ ] Email signup creates user + profile in Supabase
- [ ] Email login returns access_token and refresh_token
- [ ] Bearer token grants access to protected endpoints
- [ ] Google OAuth redirects to Google and back to `/auth/callback`
- [ ] Auth callback redirects to `/dashboard` after session is established
- [ ] Invalid/expired tokens return 401

## Success Indicators

- `/api/auth/me` returns user email and ID
- `/api/user/profile` returns subscription plan and trading preferences
- Dashboard loads without redirect to login
- Settings page shows correct user info

## Failure Indicators

- 401 Unauthorized on protected endpoints
- Redirect loop between login and callback
- "Invalid authentication token" error
- Google OAuth 404 on `/auth/callback` (missing callback page)
