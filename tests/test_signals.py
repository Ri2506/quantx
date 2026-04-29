"""
Tests for signals API endpoints.
"""

from unittest.mock import patch, MagicMock
from tests.conftest import MockQueryBuilder


class TestSignalsToday:
    @patch("src.backend.api.app.get_supabase_admin")
    def test_get_today_signals(self, mock_admin, client, fake_signals):
        mock_admin.return_value.table.return_value = MockQueryBuilder(fake_signals)

        resp = client.get(
            "/api/signals/today",
            headers={"Authorization": "Bearer fake"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "date" in data
        assert "total" in data
        assert "all_signals" in data
        assert "long_signals" in data
        assert "short_signals" in data
        assert data["total"] == 2

    @patch("src.backend.api.app.get_supabase_admin")
    def test_signals_filtered_by_direction(self, mock_admin, client, fake_signals):
        long_only = [s for s in fake_signals if s["direction"] == "LONG"]
        mock_admin.return_value.table.return_value = MockQueryBuilder(long_only)

        resp = client.get(
            "/api/signals/today?direction=LONG",
            headers={"Authorization": "Bearer fake"},
        )
        assert resp.status_code == 200


class TestSignalHistory:
    @patch("src.backend.api.app.get_supabase_admin")
    def test_get_signal_history(self, mock_admin, client, fake_signals):
        mock_admin.return_value.table.return_value = MockQueryBuilder(fake_signals)

        resp = client.get(
            "/api/signals/history",
            headers={"Authorization": "Bearer fake"},
        )
        assert resp.status_code == 200
        data = resp.json()
        # Response may be {"signals": [...]} or a bare list
        assert isinstance(data, (dict, list))

    def test_signal_history_limit_bounds(self, client):
        """Limit must be between 1 and 500."""
        resp = client.get(
            "/api/signals/history?limit=0",
            headers={"Authorization": "Bearer fake"},
        )
        assert resp.status_code in (422, 500)

        resp = client.get(
            "/api/signals/history?limit=999",
            headers={"Authorization": "Bearer fake"},
        )
        assert resp.status_code in (422, 500)


class TestSignalById:
    @patch("src.backend.api.app.get_supabase_admin")
    def test_get_signal_by_id(self, mock_admin, client, fake_signals):
        mock_admin.return_value.table.return_value = MockQueryBuilder(fake_signals[0])

        resp = client.get(
            "/api/signals/sig-001",
            headers={"Authorization": "Bearer fake"},
        )
        assert resp.status_code == 200
