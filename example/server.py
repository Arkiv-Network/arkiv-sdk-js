#! /usr/bin/env python3

import http.server
import socketserver

PORT = 4000


class MyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, request, client_address, server):
        super().__init__(request, client_address, server, directory="..")


MyHandler.extensions_map = {
    ".manifest": "text/cache-manifest",
    ".html": "text/html",
    ".js": "application/x-javascript",
    "": "application/octet-stream",  # Default
}

httpd = socketserver.TCPServer(("", PORT), MyHandler)

print("serving at port", PORT)
httpd.serve_forever()
