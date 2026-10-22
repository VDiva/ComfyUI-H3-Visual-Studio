# H3 独立代理 Web

这是插件之外的另一种代理入口。只需 Python 3.9+ 标准库，不需要运行 ComfyUI、pip、GTK、VNC 或安装 Clash Verge。
复用上一级 `proxy_core.py`，所以请保留本文件夹与插件上级文件的相对位置。

## Linux / 仙宫云

```bash
cd /root/ComfyUI/custom_nodes/ComfyUI-H3-Visual-Studio/proxy-web
python3 -B server.py --host 0.0.0.0 --port 17896
```

在平台添加/映射 **17896** 端口，打开它的 HTTPS 访问链接，将终端打印的 `/#token=...` 加在链接末尾。
也可以打开页面后手动输入终端链接中 `#token=` 后的访问码。
使用 VNC 内浏览器时，直接打开终端给出的 `http://127.0.0.1:17896/#token=...`。
默认不指定 `--host` 时只监听本机。访问码每次启动变化；不写入仓库或普通请求日志。

Windows：安装 Python 后双击 `start-windows.cmd`，或 `python -B server.py --open`。
Linux 也可以 `bash start.sh --host 0.0.0.0 --port 17896`，无需先 chmod。

## 使用顺序

1. Linux x64 / Windows x64 已附带官方内核压缩包，首次启动会自动离线校验、解包到私有运行目录，无需 GitHub、apt 或手动安装。ARM64 等未内置的架构可使用在线安装或上传对应官方安装包。
2. 上传必须是界面指定的当前操作系统、架构及固定版本官方 `.gz` / `.zip`。复用内核安装器验证官方 SHA256；不会执行任意上传文件。离线导入使用本目录附带的未修改上游许可证，不请求 GitHub。
3. 保存 Clash/Mihomo 兼容订阅，点击开启代理，再选择节点。
4. 复制网页显示的实际代理地址，填入 **同一台服务器** 上插件的“下载代理”并保存；重试失败下载。端口动态选择，以网页显示为准。
5. 终端下载可以展开“终端下载怎么使用”并复制命令；只影响该终端以后启动的进程。

这不是 Windows 本机代理向云端自动转发的工具。Web 和内核必须运行在需要代理的那台机器上。
本工具独立管理内核，不修改 ComfyUI 的配置，也不接管整个系统。不要同时在插件内置代理和此 Web 中启动同一份内核。

## 持久保存与重启

运行数据放在 **proxy-web/.h3-mihomo/**：内核、许可证、安装来源、订阅、控制配置及缓存。
它是本工具自己的私有目录，与插件内置 `.h3-mihomo` 分开。不要只备份可见文件而遗漏隐藏目录。
保存包含此文件夹的镜像/持久盘，才能带走已安装内核。保存后下次仍须启动服务并点击“开启代理”。不自动修改云平台开机脚本。
终端停止或服务退出会关闭其启动的 Mihomo；可按平台的长期服务方式运行此命令。

如用 nohup，请保护日志，里面包含管理访问码：

```bash
umask 077
nohup python3 -B server.py --host 0.0.0.0 --port 17896 > .proxy-web.log 2>&1 &
echo $! > .proxy-web.pid
cat .proxy-web.log
```

在平台映射的 Web 端口上管理即可；代理和 Mihomo 控制端口只监听 127.0.0.1，不要把它们公开映射。
公开镜像前点击“删除订阅与缓存”，并停止服务；不要提交 `.h3-mihomo/`、`.proxy-web.log` 等私有运行文件。

## 内核许可证

Mihomo 是独立 GPL-3.0 程序，`cores/` 附带未经修改的 Linux x64 和 Windows x64 官方压缩包（合计约 43.3 MiB），SHA256 与来源见 `cores/manifest.json`。`LICENSE-Mihomo` 是固定上游版本的原始许可证。
官方源码与对应版本：https://github.com/MetaCubeX/mihomo/tree/v1.19.32
官方下载：https://github.com/MetaCubeX/mihomo/releases/tag/v1.19.32
如将安装后的二进制再分发或放入公开镜像，应同时保留许可证与对应源码取得说明。

附带内核的对应源码下载：https://github.com/MetaCubeX/mihomo/archive/refs/tags/v1.19.32.tar.gz
请完整上传 `proxy-web/cores/`，不要仅上传 HTML 文件。内核不是 Python 代码，不会因导入 ComfyUI 插件而自行运行。
