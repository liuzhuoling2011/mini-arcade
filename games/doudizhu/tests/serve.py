"""Local-only prefixed preview; no external dependencies."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, unquote
import argparse
ROOT = Path(__file__).resolve().parents[3]
class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, url):
        path = unquote(urlsplit(url).path)
        if not path.startswith('/mini-arcade/'):
            return str(ROOT / '__missing__')
        target = (ROOT / path[len('/mini-arcade/'):]).resolve()
        if not target.is_relative_to(ROOT):
            return str(ROOT / '__missing__')
        return str(target)
if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--port', type=int, default=8093)
    args = p.parse_args()
    ThreadingHTTPServer(('0.0.0.0', args.port), Handler).serve_forever()
