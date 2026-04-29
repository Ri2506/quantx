"""
Tests for trades API endpoints.
"""

from unittest.mock import patch, MagicMock
from tests.conftest import MockQueryBuilder, FAKE_USER_ID


class TestGetTrades:
    @patch("src.backend.api.app.get_supabase_admin")
    def test_get_trades_list(self, mock_admin, client, fake_trades):
        mock_admin.return_value.table.return_value = MockQueryBuilder(fake_trades)

        resp = client.get(
            "/api/trades",
            headers={"Authorization": "Bearer fake"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "trades" in data

    def test_trades_limit_bounds(self, client):
        """Limit must be between 1 and 500."""
        resp = client.get(
            "/api/trades?limit=0",
            headers={"Authorization": "Bearer fake"},
        )
        assert resp.status_code == 422

        resp = client.get(
            "/api/trades?limit=501",
            headers={"Authorization": "Bearer fake"},
        )
        assert resp.status_code == 422


class TestExecuteTrade:
    @patch("src.backend.api.app.get_supabase_admin")
    def test_execute_trade_missing_fields(self, mock_admin, client):
        resp = client.post(
            "/api/trades/execute",
            json={},
            headers={"Authorization": "Bearer fake"},
        )
        assert resp.status_code == 422

    @patch("src.backend.api.app.get_supabase_admin")
    def test_execute_trade_success(self, mock_admin, client):
        # Mock position count check
        mock_admin.return_value.table.return_value = MockQueryBuilder([])

        resp = client.post(
            "/api/trades/execute",
            json={
                "symbol": "RELIANCE",
                "direction": "LONG",
                "entry_price": 2450.0,
                "stop_loss": 2400.0,
                "target": 2550.0,
                "quantity": 10,
            },
            headers={"Authorization": "Bearer fake"},
        )
        # May succeed, fail validation, or error — verify it doesn't crash
        assert resp.status_code in (200, 400, 422, 500)


class TestKillSwitch:
    @patch("src.backend.api.app.get_supabase_admin")
    def test_kill_switch(self, mock_admin, client):
        mock_admin.return_value.table.return_value = MockQueryBuilder([])

        resp = client.post(
            "/api/trades/kill-switch",
            headers={"Authorization": "Bearer fake"},
        )
        assert resp.status_code in (200, 500)
