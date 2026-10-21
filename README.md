# H3 可视化工作室 0.15.6

使用 AIMixer / MiniMax H3 Director 开源内核，保留工作室的分段编辑、目录导入、公共素材、人物生图、后台批次、对比、视频处理和更新界面。

新建工程默认使用导演台原例双模型预设：FL2VA一采8步、W4A8二采3步，beta调度、强度0.2、目标2MP，并启用KJ SageAttention。需要安装对应模型、KJNodes节点及SageAttention运行库。已保存的工程保留原设置；已有工程可点击“应用原例参数（双模型2MP）”启用此配置。

## 安装与运行

插件更新成功后自动删除旧版本，不保留备份目录；替换失败时会自动恢复原版本。更新中的临时回滚目录仅用于完成替换，文件占用导致清理失败时页面会提示具体目录。

代理区域的“删除订阅信息”会先停止插件管理的代理、恢复原下载代理，再删除保存的订阅地址、生成的配置和节点缓存；保留已安装的Mihomo内核及许可证，之后可保存新订阅。

模型下载支持单项“停止下载”和“停止全部下载”（包含排队任务）。停止时保留断点及校验信息，可点击“继续下载”续传；服务端不支持续传或文件版本变化时会重新下载。网络连接阻塞时先显示“正在停止”，等待当前连接或读取返回后结束，不会自动重试。已安装的模型不受影响。

1. 将完整目录放入 ComfyUI/custom_nodes。
2. 使用 ComfyUI 的 Python 安装 requirements.txt，重启 ComfyUI 并 Ctrl+F5。
3. 进入工作室，在“模型与下载”检查模型和依赖，然后使用工作室的生成按钮。

插件源码与在线更新源为 [VDiva/ComfyUI-H3-Visual-Studio](https://github.com/VDiva/ComfyUI-H3-Visual-Studio)。更新器读取该仓库默认分支，并下载检查时锁定的提交。

模型下载源可在下载区域手动选择：自动（仙宫云优先）、仅仙宫云、仅官方（Hugging Face）。默认自动：先直连hf.x-gpu.com，以首次模型信息请求检测可用性（8秒连接/读取超时）；正常下载使用60秒连接/读取超时，源不可用或校验失败时回退官方。仅指定源时不自动换源。选择保存在download-source.local.json，重启及插件更新后保留，仅影响新下载/重试；已提交的下载任务保持原选择。官方线路沿用代理配置，仙宫云不会收到HF Token。安装前仍校验大小和SHA256。

源码包不附带FFmpeg二进制。视频合并和后处理使用服务器已安装的FFmpeg，或依赖页安装的imageio-ffmpeg。其许可证由各自发行方提供。

0.14.5下载修正：仙宫云传输中断后切换官方时，丢弃该次镜像的未验证前缀；镜像元数据与官方文件校验不一致时，重新从官方读取信息并完整重下一次。最终校验失败的文件保留为.h3download.part，不会安装，错误包含完整预期/实际SHA256；点击重试会清除已知失败数据并重新下载。

0.14.6布局修正：适配新版ComfyUI的computeLayoutSize，隐藏工程JSON控件的布局占位，关闭工作室内部点击引起的节点自动选择，并按控件容器宽度重排页面、编辑区和预览。浏览器回归覆盖标签连续切换、窄容器、隐藏恢复及大面板展开/收起。

工作流上的模型加载节点提供配置，工作室生成时会编译为 H3StudioDirector 执行图。一采、二采、H3 latent放大和SelfLift由导演台内核执行。直接点击ComfyUI原生队列按钮仍执行画布工作流。导出按钮输出导演台执行API；“保存工程”保存可视化工作区。

旧工作室工程的页面、素材和设置继续读取。旧版单独导出的 H3SelfLiftSampler / H3DirectorLatentUpscale / H3Preserve* 执行图已停止支持，请从工作室工程重新导出。公共素材和成片不属于本次源码清理范围。

## Clash / Mihomo 订阅代理

“模型与下载”页新增订阅代理卡片：安装Mihomo内核 → 填写兼容Clash/Mihomo的订阅链接并保存 → 开启代理 → 选择节点 → 测试代理连接。更新订阅可刷新节点；停止代理会恢复开启前的插件代理配置。自动/官方模型源会使用插件代理，仙宫云仍直连。切换节点只影响新连接，已建立的下载连接继续使用原节点。

代理运行在ComfyUI所在服务器，无需在浏览器电脑另装Clash。内核固定从 [MetaCubeX官方v1.19.32发布](https://github.com/MetaCubeX/mihomo/releases/tag/v1.19.32) 下载并校验，支持Windows/Linux的x64、ARM64；也可使用服务器PATH中已有的mihomo。只绑定127.0.0.1，未启用TUN，不修改系统代理。首次安装需能访问GitHub，或使用现有可用HTTP代理；插件不会把订阅发送到第三方转换站。

订阅及节点凭据保存在服务器的`.h3-mihomo/`，不回显到页面、不写入工程、不进入Git或更新包。重启ComfyUI后需要手动开启代理。Mihomo是独立GPL-3.0程序，原始许可证及来源与安装的内核一起保存；本源码包不附带其二进制。可先开启代理再检查和下载插件更新；更新包下载与校验完成后会自动停止插件管理的Mihomo、恢复原代理，再替换插件文件。订阅与内核保留，重启后可重新开启。

## 验证

先执行 `node tests/director-core.mjs`，再执行 `python tests/director-schema.py`。前者覆盖执行图组合，后者检查实际节点输入定义和Python语法。`python tests/distribution.py` 检查来源哈希、许可文件和清理结果。这些检查不代替GPU推理验证。远端环境尚未配置，未运行实际模型出片。

## 来源与许可证

本集成项目按 Apache-2.0 提供，完整文本见 LICENSE。导演台内核来自 [AIMixer/ComfyUI_MiniMaxH3_Director](https://github.com/AIMixer/ComfyUI_MiniMaxH3_Director)，维护者为 AI搅拌手 / AIMixer。本项目保留其原始署名、许可证和致谢，不将上游内核声明为原创。

分发时请随附 LICENSE、NOTICE、director_core/LICENSE 和相关来源说明；继续修改上游文件时，请在文件内明确标注修改并保留原有声明。来源、原始哈希和本地改动见 NOTICE-Director.md、director_core/source-manifest.json、director_core/UPSTREAM_README.md。

模型权重、外部依赖和FFmpeg适用各自许可证，不因本插件使用Apache-2.0而改变。

## 文件说明

根目录的model-catalog.json用于模型下载，version.json用于插件更新，均为运行必需文件。web/workflow-template.mjs是内置启动模板；tests/.fixtures中的JSON仅供测试。旧版工作流导出、历史说明、调研和旧FFmpeg构建说明已移出插件；不再附带examples目录。标准目录与AI交付规范.md由目录模板引用，予以保留。

每次发布更新必须递增version.json中的版本号，并同步工作室显示版本、前端模块的?v=缓存版本和本说明标题；发布前运行tests/distribution.py检查版本一致性。完整源码上传到GitHub后，云端插件才能检测并下载此版本。

0.14.3补回并保留Git中的两份测试JSON；源码完整性检查允许Git换行转换；更新包校验涵盖Director清单内的Python文件、适配器、关键前端和许可证。前端模块引用可用 `node --experimental-vm-modules tests/module-links.mjs` 单独检查。
