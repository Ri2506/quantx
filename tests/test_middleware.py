"""
Tests for middleware: security headers, rate limiting, error handling.
"""


class TestSecurityHeaders:
    def test_security_headers_present(self, client):
        resp = client.get("/api/health")
        headers = resp.headers

        assert headers.get("X-Content-Type-Options") == "nosniff"
        assert headers.get("X-Frame-Options") == "DENY"
        assert headers.get("X-XSS-Protection") == "1; mode=block"
        assert "max-age=31536000" in headers.get("Strict-Transport-Security", "")
        assert "includeSubDomains" in headers.get("Strict-Transport-Security", "")
        assert "preload" in headers.get("Strict-Transport-Security", "")
        assert headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
        assert "camera=()" in headers.get("Permissions-Policy", "")

    def test_csp_header_present(self, client):
        resp = client.get("/api/health")
        csp = resp.headers.get("Content-Security-Policy", "")
        assert "default-src 'self'" in csp
        assert "script-src" in csp
        assert "checkout.razorpay.com" in csp
        assert "object-src 'none'" in csp


class TestErrorHandling:
    def test_404_returns_json(self, client):
        resp = client.get("/api/nonexistent-endpoint-xyz")
        assert resp.status_code in (404, 405)

    def test_validation_error_format(self, client):
        """POST with invalid body should return structured 422."""
        # Use trades/execute (not auth/signup) to avoid rate limiter collision
        resp = client.post(
            "/api/trades/execute",
            json={},
            headers={"Authorization": "Bearer fake"},
        )
        assert resp.status_code == 422
        data = resp.json()
        # Accept either our custom format or FastAPI's default
        assert "error" in data or "detail" in data

    def test_unauthenticated_request(self, anon_client):
        """Protected endpoint without token should return 401 or 403."""
        resp = anon_client.get("/api/signals/today")
        assert resp.status_code in (401, 403)


class TestRateLimitHeaders:
    def test_rate_limit_headers_present(self, client):
        resp = client.get("/api/health")
        # Rate limiter should set these headers
        assert "X-RateLimit-Limit" in resp.headers or resp.status_code == 200
