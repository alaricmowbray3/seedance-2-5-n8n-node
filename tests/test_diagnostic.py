import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("diagnostic", Path(__file__).parents[1] / "examples/run_video.py")
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)


class DiagnosticRequests(unittest.TestCase):
    def test_headers_and_body_for_every_operation(self):
        captured = []
        def respond(req, timeout):
            captured.append(req)
            return io.BytesIO(b'{}')
        with patch.object(client, "urlopen", respond):
            client.request("https://example.invalid/v1", "test-only", "/videos/generations", {"model": "test"})
            client.request("https://example.invalid/v1", "test-only", "/videos/job_test")
            client.request("https://example.invalid/v1", "test-only", "/videos/job_test/content", binary=True)
        self.assertEqual([r.get_method() for r in captured], ["POST", "GET", "GET"])
        for req in captured:
            self.assertEqual(req.get_header("User-agent"), "n8n-video-diagnostic/1.0")
            self.assertEqual(req.get_header("Authorization"), "Bearer test-only")
        self.assertIn(b'"model": "test"', captured[0].data)


if __name__ == "__main__":
    unittest.main()
