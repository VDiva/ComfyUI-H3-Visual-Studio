import importlib.util,threading,http.server,tempfile,urllib.request,sys
if '--real' not in sys.argv:
 print('SKIP real Mihomo test; use --real to download the official binary and test a local mock subscription');raise SystemExit(0)
from pathlib import Path
spec=importlib.util.spec_from_file_location('h3_live_proxy',Path(__file__).resolve().parents[1]/'proxy_core.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Proxy(http.server.BaseHTTPRequestHandler):
 def do_GET(self):self.send_response(200);self.end_headers();self.wfile.write(b'proxy-ok')
 def do_CONNECT(self):
  self.send_response(200,'Connection established');self.end_headers()
  self.rfile.readline()
  while self.rfile.readline().strip():pass
  self.wfile.write(b'HTTP/1.1 200 OK\r\nContent-Length: 8\r\nConnection: close\r\n\r\nproxy-ok')
 def log_message(self,*args):pass
proxy=http.server.ThreadingHTTPServer(('127.0.0.1',0),Proxy)
class Provider(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200);self.end_headers();self.wfile.write(('proxies:\n  - name: LocalTest\n    type: http\n    server: 127.0.0.1\n    port: '+str(proxy.server_port)+'\n').encode())
 def log_message(self,*args):pass
provider=http.server.ThreadingHTTPServer(('127.0.0.1',0),Provider)
for server in [proxy,provider]:threading.Thread(target=server.serve_forever,daemon=True).start()
class Downloads:
 proxy_address=''
 opener=staticmethod(urllib.request.urlopen)
 def configure_proxy(self,address):self.proxy_address=address
with tempfile.TemporaryDirectory() as temp:
 core=m.ProxyCore(temp,Downloads())
 try:
  print('Downloading and verifying pinned official Mihomo core...',flush=True);core.install()
  core.settings['subscription']='http://127.0.0.1:'+str(provider.server_port)+'/subscription'
  core.start();assert core.snapshot()['running'];assert core.selected=='LocalTest'
  opener=urllib.request.build_opener(urllib.request.ProxyHandler({'http':core.address}))
  with opener.open('http://example.com/test',timeout=10) as response:assert response.read()==b'proxy-ok'
  core.stop();assert core.downloads.proxy_address==''
  print('PASS REAL Mihomo installation/hash/license, provider subscription, node selection, chained HTTP request and clean shutdown',flush=True)
 finally:core.close()
for server in [proxy,provider]:server.shutdown();server.server_close()

