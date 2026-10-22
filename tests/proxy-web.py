from pathlib import Path
import subprocess, hashlib, http.server, importlib.util, json, tempfile, threading, time, urllib.request, urllib.error
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('standalone',root/'proxy-web/server.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
manifest=json.loads((root/'proxy-web/cores/manifest.json').read_text())
for asset in manifest['assets']:
 assert hashlib.sha256((root/'proxy-web/cores'/asset['name']).read_bytes()).hexdigest()==asset['sha256']
print('PASS packaged official Linux/Windows archive hashes',flush=True)
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200);self.end_headers()
  if self.path=='/subscription':self.wfile.write(('proxies: \n  - name: LocalTest\n    type: http\n    server: 127.0.0.1\n    port: '+str(proxy.server_port)+'\n').encode())
  else:self.wfile.write(b'local-proxy-ok')
 def do_CONNECT(self):
  self.send_response(200,'Connection established');self.end_headers()
  self.rfile.readline()
  while self.rfile.readline().strip():pass
  body=b'local-proxy-ok'
  self.wfile.write(b'HTTP/1.1 200 OK\r\nContent-Length: '+str(len(body)).encode()+b'\r\nConnection: close\r\n\r\n'+body)
 def log_message(self,*args):pass
proxy=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=proxy.serve_forever,daemon=True).start()
with tempfile.TemporaryDirectory() as temp:
 app=m.Application(temp)
 server=m.Server(('127.0.0.1',0),m.handler_for(app))
 threading.Thread(target=server.serve_forever,daemon=True).start()
 base='http://127.0.0.1:'+str(server.server_port)
 direct=urllib.request.build_opener(urllib.request.ProxyHandler({})).open
 def api(path,body=None,auth=True):
  req=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,headers={'Authorization':'Bearer '+app.token} if auth else {})
  with direct(req,timeout=45) as response:return json.load(response)
 def wait():
  for _ in range(200):
   if not app.core.busy:return
   time.sleep(.05)
  raise AssertionError('operation timed out')
 try:
  wait();assert app.snapshot()['installed'],app.snapshot()
  with direct(base+'/') as response:assert b'app.js' in response.read()
  try:api('/api/status',auth=False);raise AssertionError('unprotected status')
  except urllib.error.HTTPError as e:assert e.code==401
  try:api('/api/action',{'action':'start'},auth=False);raise AssertionError('unprotected action')
  except urllib.error.HTTPError as e:assert e.code==401
  secret='http://127.0.0.1:'+str(proxy.server_port)+'/subscription'
  api('/api/action',{'action':'subscribe','url':secret});wait()
  assert secret not in json.dumps(api('/api/status'))
  api('/api/action',{'action':'start'});wait()
  status=api('/api/status');assert status['running'],status
  assert status['selected']=='LocalTest' and 'download_attached' not in status
  route=urllib.request.build_opener(urllib.request.ProxyHandler({'http':status['proxy']})).open
  with route('http://198.51.100.20/offline-test',timeout=10) as response:assert response.read()==b'local-proxy-ok'
  api('/api/action',{'action':'stop'});wait();assert not api('/api/status')['running']
  before=Path(app.core.executable()).read_bytes()
  app.upload(b'invalid archive');wait()
  assert 'SHA256' in app.snapshot()['message']
  assert Path(app.core.executable()).read_bytes()==before
  api('/api/action',{'action':'delete-subscription'});wait()
  assert not api('/api/status')['subscribed'] and app.core.executable()
  print('PASS REAL offline auto-install, authenticated Web, private subscription, actual Mihomo startup/node selection/HTTP forwarding, stop, corrupt upload rejected and subscription cleanup',flush=True)
 finally:
  server.shutdown();server.server_close();app.core.close()
proxy.shutdown();proxy.server_close()
