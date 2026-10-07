"""Local dev server for ./site with caching disabled (so edits show up on reload)."""
import functools
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", "8080"))
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site")


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    with http.server.ThreadingHTTPServer(("", PORT), handler) as httpd:
        print(f"Serving {ROOT} on http://localhost:{PORT}")
        httpd.serve_forever()
