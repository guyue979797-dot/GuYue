import importlib
import os
import tempfile
import unittest
from unittest.mock import patch

from werkzeug.security import generate_password_hash


class WebSecurityTests(unittest.TestCase):
    def setUp(self):
        self.output = tempfile.TemporaryDirectory()
        self.environment = patch.dict(
            os.environ,
            {
                "INFOLENS_AUTH_MODE": "password",
                "INFOLENS_ENV": "production",
                "INFOLENS_OUTPUT_ROOT": self.output.name,
                "INFOLENS_USERNAME": "team",
                "INFOLENS_PASSWORD_HASH": generate_password_hash(
                    "correct horse",
                    method="pbkdf2:sha256",
                ),
                "INFOLENS_SESSION_SECRET": "a" * 64,
            },
            clear=False,
        )
        self.environment.start()
        import web

        self.web = importlib.reload(web)
        self.client = self.web.app.test_client()

    def tearDown(self):
        self.environment.stop()
        self.output.cleanup()

    def test_protected_routes_require_login(self):
        self.assertEqual(self.client.get("/").status_code, 302)
        self.assertEqual(self.client.get("/api/results").status_code, 401)
        self.assertEqual(self.client.get("/output/private.jpg").status_code, 401)
        self.assertEqual(self.client.get("/healthz").status_code, 200)

    def test_login_session_and_csrf(self):
        bad = self.client.post(
            "/login",
            data={"username": "team", "password": "wrong"},
        )
        self.assertIn("账号或密码不正确", bad.get_data(as_text=True))

        good = self.client.post(
            "/login",
            data={"username": "team", "password": "correct horse"},
        )
        self.assertEqual(good.status_code, 302)

        session_response = self.client.get("/api/session")
        session_data = session_response.get_json()
        self.assertEqual(session_data["user"], "team")
        self.assertTrue(session_data["csrf_token"])

        missing_csrf = self.client.post("/api/extract", json={"url": "x"})
        self.assertEqual(missing_csrf.status_code, 403)

        empty_url = self.client.post(
            "/api/extract",
            json={"url": ""},
            headers={"X-CSRF-Token": session_data["csrf_token"]},
        )
        self.assertEqual(empty_url.status_code, 400)

    def test_security_headers(self):
        response = self.client.get("/healthz")
        self.assertEqual(response.headers["X-Frame-Options"], "DENY")
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertIn("default-src 'self'", response.headers["Content-Security-Policy"])


if __name__ == "__main__":
    unittest.main()
