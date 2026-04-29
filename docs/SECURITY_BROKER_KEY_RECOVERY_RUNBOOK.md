# Broker Encryption Key — Recovery & Rotation Runbook

> Scope: `BROKER_ENCRYPTION_KEY` env var used by `src/backend/services/broker_credentials.py` to Fernet-encrypt per-user broker credentials (Zerodha Kite access token, Upstox access token, Angel One SmartAPI JWT / TOTP secret) before persisting to `broker_connections` table.
>
> **Single-fact summary:** If the key is lost, no existing user's stored broker credentials can be decrypted. They must re-connect their broker. Rotating is fine — losing is catastrophic for UX.

---

## 1 — What the key protects

- `broker_connections.access_token` (encrypted per-broker access token — Zerodha Kite, Upstox v2, Angel One SmartAPI JWT)
- `broker_connections.refresh_token` (encrypted refresh token where supported)
- Any future Fernet-encrypted cell using `encrypt_credentials()` helper

The key is a URL-safe base64-encoded 32-byte string. Generated with:
```python
from cryptography.fernet import Fernet
print(Fernet.generate_key().decode())
```

---

## 2 — Where the key lives

### Primary (production)
- **Railway project env var** `BROKER_ENCRYPTION_KEY` — set via Railway dashboard or `railway variables set`.
- **Do NOT** commit to `.env`, do NOT log, do NOT include in Sentry scope.

### Backup copies (required)
Store the key in at least two independent offline locations:
1. **1Password vault** (team "Engineering Secrets" → item "Swing AI — Broker Encryption Key"). Rotation log as a note.
2. **Encrypted offline backup** — LUKS-encrypted USB or encrypted cloud bucket (S3/B2 with separate KMS). Keep a sealed paper copy in a physical safe if you're serious.

Backup owners: **Rishi** (primary) + one trusted delegate.

### Never
- Never in git, never in Docker image layers, never in CI logs, never in Slack/Discord/email.

---

## 3 — On fresh deploy

1. Generate a new key:
   ```bash
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```
2. Store it in Railway env vars.
3. Write it to 1Password + offline backup immediately.
4. Verify: boot the app, connect a test broker account, check that `broker_connections.access_token` decrypts successfully via `decrypt_credentials()`.

---

## 4 — If the key is lost

This is a **data-loss event** for broker credentials, not for user accounts, trades, signals, or any other data.

### Immediate steps
1. **Put the app in kill-switch mode** to prevent users triggering auto-trades with half-broken creds:
   ```sql
   update user_profiles set kill_switch_active = true;
   ```
2. **Generate a new key** and set it in Railway.
3. **Null all broker connections** so users re-connect:
   ```sql
   update broker_connections set status = 'disconnected',
       access_token = null, refresh_token = null,
       metadata = jsonb_set(coalesce(metadata,'{}'), '{reason}', '"key_rotation_force_reauth"')
     where status = 'connected';
   ```
4. **Notify affected users** via in-app banner + Telegram + email:
   > "We rotated our encryption keys for security. Please re-connect your broker at Settings → Broker. This takes 60 seconds and does not affect your portfolio or trade history."
5. **Clear kill switch** after users re-onboard:
   ```sql
   update user_profiles set kill_switch_active = false;
   ```

### What is lost
- Users' stored broker access tokens (they re-connect via one-click OAuth / Angel credentials modal).

### What is NOT lost
- User accounts, auth, profile data
- Trade history, positions, P&L, signals
- Paper trading data
- Subscriptions + payment history
- Watchlists, settings
- Model predictions, backtests, reports

---

## 5 — Planned rotation (recommended annually)

Rotation is safe because Fernet supports multi-key decryption via `MultiFernet`. The migration:

1. Generate new key `K2`.
2. Temporarily run app with `BROKER_ENCRYPTION_KEY=K2` and `BROKER_ENCRYPTION_KEYS_OLD=K1` (comma-separated list).
3. Update `broker_credentials.py` helpers to use `MultiFernet([K2, K1])` for decryption — writes re-encrypt with K2.
4. Run a one-shot re-encryption pass:
   ```python
   # scripts/rotate_broker_encryption_key.py
   for row in broker_connections where access_token is not null:
       plain = old_fernet.decrypt(row.access_token)
       row.access_token = new_fernet.encrypt(plain)
       save(row)
   ```
5. Once all rows re-encrypted with K2, remove `BROKER_ENCRYPTION_KEYS_OLD` env var and K1 from 1Password (mark rotated).
6. Verify: sample 10 connections decrypt correctly with K2 only.

---

## 6 — Monitoring

- Grafana (or Sentry breadcrumbs) alert on any `Fernet decryption failure` log line — indicates corrupt row, missing key, or tampering.
- Dashboard counter: `broker_connections WHERE status='error'` — should stay at 0 in steady state.

---

## 7 — Key rotation history (append-only log)

| Date | Event | Key ID (first 6 chars) | Rotator |
|---|---|---|---|
| 2026-04-19 | Initial key generated | (to be filled on deploy) | Rishi |

Log every rotation or loss event here.

---

## 8 — Related runbooks

- SEBI audit trail requirements: see `docs/STEP_3_PRODUCTION_ARCHITECTURE.md` §6 Security hardening.
- Kill switch semantics: `user_profiles.kill_switch_active` at [app.py:1215](../src/backend/api/app.py) + per-user + global admin.
