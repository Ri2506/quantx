"""
Tests for payments API endpoints.
"""

from unittest.mock import patch, MagicMock
from tests.conftest import MockQueryBuilder, FAKE_USER_ID


class TestGetPlans:
    @patch("src.backend.api.app.get_supabase_admin")
    def test_get_plans(self, mock_admin, client):
        plans = [
            {"id": "plan_free", "name": "Free", "tier": "free", "price_monthly": 0},
            {"id": "plan_starter", "name": "Starter", "tier": "starter", "price_monthly": 49900},
            {"id": "plan_pro", "name": "Pro", "tier": "pro", "price_monthly": 99900},
        ]
        mock_admin.return_value.table.return_value = MockQueryBuilder(plans)

        resp = client.get("/api/plans")
        assert resp.status_code == 200
        data = resp.json()
        assert "plans" in data


class TestCreateOrder:
    @patch("src.backend.api.app.get_razorpay")
    @patch("src.backend.api.app.get_supabase_admin")
    def test_create_order_success(self, mock_admin, mock_rzp, client):
        plan = {
            "id": "plan_pro",
            "name": "Pro",
            "price_monthly": 99900,
            "price_quarterly": 249900,
            "price_yearly": 899900,
        }
        mock_admin.return_value.table.return_value = MockQueryBuilder(plan)
        mock_rzp.return_value.order.create.return_value = {
            "id": "order_test123",
            "amount": 99900,
            "currency": "INR",
        }

        resp = client.post(
            "/api/payments/create-order",
            json={"plan_id": "plan_pro", "billing_period": "monthly"},
            headers={"Authorization": "Bearer fake"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "order_id" in data
        assert data["amount"] == 99900

    def test_create_order_missing_fields(self, client):
        resp = client.post(
            "/api/payments/create-order",
            json={},
            headers={"Authorization": "Bearer fake"},
        )
        assert resp.status_code == 422


class TestVerifyPayment:
    @patch("src.backend.api.app.get_supabase_admin")
    def test_verify_payment_missing_fields(self, mock_admin, client):
        resp = client.post(
            "/api/payments/verify",
            json={},
            headers={"Authorization": "Bearer fake"},
        )
        assert resp.status_code == 422

    @patch("src.backend.api.app.get_razorpay")
    @patch("src.backend.api.app.get_supabase_admin")
    def test_verify_payment_invalid_signature(self, mock_admin, mock_rzp, client):
        mock_rzp.return_value.utility.verify_payment_signature.side_effect = Exception(
            "Signature verification failed"
        )
        mock_admin.return_value.table.return_value = MockQueryBuilder(
            {"id": "pay1", "status": "pending"}
        )

        resp = client.post(
            "/api/payments/verify",
            json={
                "order_id": "order_test123",
                "payment_id": "pay_test456",
                "signature": "invalid_sig",
            },
            headers={"Authorization": "Bearer fake"},
        )
        # Should fail gracefully — 400, 422, or 500
        assert resp.status_code in (400, 422, 500)
