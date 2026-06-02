# -*- coding: utf-8 -*-
import http.server
import socketserver
import os
import sys

PORT = 3847
API_KEY = "sk-e6a62d4c92224761abb59a339f1896ca"
REST_KEY = "8b64de8e96add01b70a97a197c20622f5021300653878eb145e2d3db72f0eb74"
REST_URL = "https://127.0.0.1:27124"

HTML = open(os.path.join(os.path.dirname(__file__), "ui.html"), encoding="utf-8").read()

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self.send_response(200)
            self.send_header("Content-type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML.encode("utf-8"))
        else:
            super().do_GET()
    def log_message(self, fmt, *args): pass

print("=" * 40)
print("  DeepSeek 笔记生成器")
print("=" * 40)
print(f"  http://localhost:{PORT}")
print("=" * 40)

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.allow_reuse_address = True
    httpd.serve_forever()
