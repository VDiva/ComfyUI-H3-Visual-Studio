"""Standalone proxy Web; stdlib only, never imports ComfyUI or plugin __init__."""
from pathlib import Path
import argparse, hmac, http.server, importlib.util, io, json, platform, secrets, signal, threading, urllib.parse, urllib.request, webbrowser
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('h3_standalone_proxy',ROOT.parent/'proxy_core.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
MAX_UPLOAD=80*1024**2

class Network:
    proxy_address=''
    source_mode='official'
    opener=staticmethod(urllib.request.urlopen)
    def configure_proxy(self,address):
        self.proxy_address=address
        self.opener=urllib.request.build_opener(urllib.request.ProxyHandler({'http':address,'https':address} if address else None)).open

class Application:
    def __init__(self,root=ROOT,core=None):
        self.token=secrets.token_urlsafe(32)
        self.core=core or module.ProxyCore(root,Network())
        if core is None:
            asset=self.snapshot().get('asset_name')
            bundled=ROOT/'cores'/asset if asset else None
            if bundled and bundled.is_file() and not self.core.executable():
                self.upload(bundled.read_bytes())
    def snapshot(self):
        state=self.core.snapshot()
        arch=platform.machine().lower()
        arch='amd64' if arch in {'amd64','x86_64'} else 'arm64' if arch in {'arm64','aarch64'} else arch
        asset=module.ASSETS.get((platform.system(),arch))
        state['asset_name']=asset[0] if asset else ''
        state['bundled_available']=bool(asset and (ROOT/'cores'/asset[0]).is_file())
        state['asset_url']='https://github.com/MetaCubeX/mihomo/releases/download/'+module.VERSION+'/'+asset[0] if asset else ''
        state['platform']=platform.system()+' / '+arch
        state.pop('download_attached',None)
        if state.get('message')=='代理已开启，插件的官方源下载将使用所选节点':
            state['message']='代理已开启。请将下方实际地址填入插件下载代理，或用于同一台机器上的终端。'
        return state
    def upload(self,payload):
        core=self.core
        with core.lock:
            if core.busy or core.closing or core.process is not None:raise ValueError('请先停止代理并等待当前操作完成')
            core.busy=True;core.message='正在校验官方内核包…';core.progress=0
        def install():
            previous=core.opener
            try:
                license_text=(ROOT/'LICENSE-Mihomo').read_bytes()
                def offline(request,timeout):
                    if request.full_url.endswith('/LICENSE'):return io.BytesIO(license_text)
                    response=io.BytesIO(payload);response.headers={'Content-Length':str(len(payload))};return response
                core.opener=offline;core.install()
                core.message='官方内核包已校验并安装，无需 apt 或系统桌面。'
            except ValueError as error:core.message=str(error)
            except Exception:core.message='导入失败，请检查磁盘是否可写及安装包是否完整。'
            finally:
                core.opener=previous
                with core.lock:core.busy=False
        core.pool.submit(install)

def handler_for(app):
    class Handler(http.server.BaseHTTPRequestHandler):
        server_version='H3ProxyWeb/1.0'
        def log_message(self,*args):pass
        def reply(self,code,value,mime='application/json; charset=utf-8'):
            body=value if isinstance(value,bytes) else json.dumps(value,ensure_ascii=False).encode()
            self.send_response(code)
            for k,v in {'Content-Type':mime,'Content-Length':str(len(body)),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}.items():self.send_header(k,v)
            self.end_headers();self.wfile.write(body)
        def authorized(self):
            if not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+app.token):
                self.reply(401,{'error':'请使用启动终端给出的完整访问链接，或填写访问码。'});return False
            return True
        def do_GET(self):
            path=urllib.parse.urlsplit(self.path).path
            if path=='/api/status':
                if self.authorized():self.reply(200,app.snapshot())
                return
            files={'/':('index.html','text/html; charset=utf-8'),'/app.js':('app.js','text/javascript; charset=utf-8'),'/style.css':('style.css','text/css; charset=utf-8'),'/LICENSE-Mihomo':('LICENSE-Mihomo','text/plain; charset=utf-8')}
            if path not in files:self.reply(404,{'error':'页面不存在'});return
            name,mime=files[path];self.reply(200,(ROOT/name).read_bytes(),mime)
        def do_POST(self):
            if not self.authorized():return
            try:
                path=urllib.parse.urlsplit(self.path).path
                if path not in {'/api/action','/api/upload'}:self.reply(404,{'error':'接口不存在'});return
                limit=MAX_UPLOAD if path=='/api/upload' else 16384
                if self.headers.get('Transfer-Encoding'):raise ValueError('不支持分块上传')
                length=int(self.headers.get('Content-Length','-1'))
                if length<0 or length>limit:raise ValueError('上传大小无效')
                self.connection.settimeout(45);body=self.rfile.read(length)
                if len(body)!=length:raise ValueError('上传不完整')
                if path=='/api/upload':app.upload(body)
                else:
                    payload=json.loads(body)
                    if not isinstance(payload,dict):raise ValueError('请求格式无效')
                    app.core.start_action(payload)
                self.reply(202,app.snapshot())
            except (ValueError,UnicodeError):self.reply(400,{'error':'请求无效、安装包过大或代理仍在运行；请检查后重试。'})
            except Exception:self.reply(500,{'error':'操作未完成，请检查文件夹权限后重试。'})
    return Handler

class Server(http.server.ThreadingHTTPServer):
    daemon_threads=True
    allow_reuse_address=True

def main():
    parser=argparse.ArgumentParser(description='独立 Mihomo 代理 Web：无需 ComfyUI')
    parser.add_argument('--host',default='127.0.0.1',choices=['127.0.0.1','0.0.0.0'])
    parser.add_argument('--port',type=int,default=17896)
    parser.add_argument('--open',action='store_true')
    args=parser.parse_args();app=Application()
    try:server=Server((args.host,args.port),handler_for(app))
    except OSError:
        app.core.close();raise SystemExit('Web 端口监听失败，请换一个 --port 或停止已有实例。')
    url=f'http://127.0.0.1:{server.server_port}/#token={app.token}'
    print('\nH3 独立代理 Web（保持此进程运行）\n'+url,flush=True)
    if args.host=='0.0.0.0':print('云端请映射 Web 端口 '+str(server.server_port)+'，在平台访问链接末尾加上 /#token='+app.token,flush=True)
    if args.open:webbrowser.open(url)
    def stop(*_):threading.Thread(target=server.shutdown,daemon=True).start()
    signal.signal(signal.SIGTERM,stop)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close();app.core.close()

if __name__=='__main__':main()
