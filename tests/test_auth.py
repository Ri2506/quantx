"""
Tests for authentication endpoints.
Auth routes call Supabase directly, so we mock the Supabase client.
"""

from unittest.mock import patch, MagicMock
from tests.conftest import FAKE_USER_ID


class TestSignup:
    def test_signup_missing_fields(self, client):
        resp = client.post("/api/auth/signup", json={})
        assert resp.status_code == 422

    def test_signup_short_password(self, client):
        resp = client.post("/api/auth/signup", json={
            "email": "new@test.com",
            "password": "short",
            "full_name": "Test"
        })
        assert resp.status_code == 422

    @patch("src.backend.api.app.get_supabase")
    def test_signup_success(self, mock_sb, client):
        mock_user = MagicMock()
        mock_user.id = FAKE_USER_ID
        mock_sb.return_value.auth.sign_up.return_value = MagicMock(user=mock_user)

        resp = client.post("/api/auth/signup", json={
            "email": "new@test.com",
            "password": "StrongP@ss123",
            "full_name": "New User"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "user_id" in data

    @patch("src.backend.api.app.get_supabase")
    def test_signup_duplicate_email(self, mock_sb, client):
        mock_sb.return_value.auth.sign_up.side_effect = Exception("User already registered")

        resp = client.post("/api/auth/signup", json={
            "email": "existing@test.com",
            "password": "StrongP@ss123",
            "full_name": "Dup User"
        })
        assert resp.status_code in (400, 500)


class TestLogin:
    def test_login_missing_fields(self, client):
        resp = client.post("/api/auth/login", json={})
        assert resp.status_code == 422

    @patch("src.backend.api.app.get_supabase")
    @patch("src.backend.api.app.get_supabase_admin")
    def test_login_success(self, mock_admin, mock_sb, client):
        mock_user = MagicMock()
        mock_user.id = FAKE_USER_ID
        mock_user.email = "test@quantx.app"

        mock_session = MagicMock()
        mock_session.access_token = "test-jwt-token"
        mock_session.refresh_token = "test-refresh"
        mock_session.expires_at = 9999999999

        mock_sb.return_value.auth.sign_in_with_password.return_value = MagicMock(
            user=mock_user, session=mock_session
        )
        mock_admin.return_value.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()

        resp = client.post("/api/auth/login", json={
            "email": "test@quantx.app",
            "password": "StrongP@ss123"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "access_token" in data
        assert "refresh_token" in data

    @patch("src.backend.api.app.get_supabase")
    def test_login_wrong_password(self, mock_sb, client):
        mock_sb.return_value.auth.sign_in_with_password.side_effect = Exception("Invalid login credentials")

        resp = client.post("/api/auth/login", json={
            "email": "test@quantx.app",
            "password": "WrongPass123"
        })
        assert resp.status_code == 401


class TestLogout:
    def test_logout_success(self, client):
        resp = client.post("/api/auth/logout", headers={"Authorization": "Bearer fake"})
        assert resp.status_code == 200
        assert resp.json()["success"] is True


class TestForgotPassword:
    @patch("src.backend.api.app.get_supabase")
    def test_forgot_password_success(self, mock_sb, client):
        mock_sb.return_value.auth.reset_password_email.return_value = None

        resp = client.post("/api/auth/forgot-password?email=test@quantx.app")
        assert resp.status_code == 200
        assert resp.json()["success"] is True
