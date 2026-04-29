"""
Tests for health, readiness, and root endpoints.
These are public — no auth needed.
"""


class TestHealthEndpoints:
    def test_root_returns_app_info(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "running"
        assert "version" in data
        assert "docs" in data

    def test_health_endpoint(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data
        assert "version" in data

    def test_health_alias(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_readiness_endpoint(self, client):
        """Readiness may return 503 in test env (no real DB) — just verify structure."""
        resp = client.get("/api/ready")
        assert resp.status_code in (200, 503)
        data = resp.json()
        assert "ready" in data
        assert "checks" in data
        assert "database" in data["checks"]

    def test_docs_accessible(self, client):
        resp = client.get("/api/docs")
        assert resp.status_code == 200

    def test_openapi_schema(self, client):
        resp = client.get("/api/openapi.json")
        assert resp.status_code == 200
        schema = resp.json()
        assert "paths" in schema
        assert "info" in schema
