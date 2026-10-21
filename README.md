# H3 可视化工作室 0.14.2

使用 AIMixer / MiniMax H3 Director 开源内核，保留工作室的分段编辑、目录导入、公共素材、人物生图、后台批次、对比、视频处理和更新界面。

## 安装与运行

1. 将完整目录放入 ComfyUI/custom_nodes。
2. 使用 ComfyUI 的 Python 安装 requirements.txt，重启 ComfyUI 并 Ctrl+F5。
3. 进入工作室，在“模型与下载”检查模型和依赖，然后使用工作室的生成按钮。

源码包不附带FFmpeg二进制。视频合并和后处理使用服务器已安装的FFmpeg，或依赖页安装的imageio-ffmpeg。其许可证由各自发行方提供。

工作流上的模型加载节点提供配置，工作室生成时会编译为 H3StudioDirector 执行图。一采、二采、H3 latent放大和SelfLift由导演台内核执行。直接点击ComfyUI原生队列按钮仍执行画布工作流。导出按钮输出导演台执行API；“保存工程”保存可视化工作区。

旧工作室工程的页面、素材和设置继续读取。旧版单独导出的 H3SelfLiftSampler / H3DirectorLatentUpscale / H3Preserve* 执行图已停止支持，请从工作室工程重新导出。公共素材和成片不属于本次源码清理范围。

## 验证

先执行 `node tests/director-core.mjs`，再执行 `python tests/director-schema.py`。前者覆盖执行图组合，后者检查实际节点输入定义和Python语法。`python tests/distribution.py` 检查来源哈希、许可文件和清理结果。这些检查不代替GPU推理验证。远端环境尚未配置，未运行实际模型出片。

## 来源与许可证

本集成项目按 Apache-2.0 提供，完整文本见 LICENSE。导演台内核来自 [AIMixer/ComfyUI_MiniMaxH3_Director](https://github.com/AIMixer/ComfyUI_MiniMaxH3_Director)，维护者为 AI搅拌手 / AIMixer。本项目保留其原始署名、许可证和致谢，不将上游内核声明为原创。

分发时请随附 LICENSE、NOTICE、director_core/LICENSE 和相关来源说明；继续修改上游文件时，请在文件内明确标注修改并保留原有声明。来源、原始哈希和本地改动见 NOTICE-Director.md、director_core/source-manifest.json、director_core/UPSTREAM_README.md。

模型权重、外部依赖和FFmpeg适用各自许可证，不因本插件使用Apache-2.0而改变。

## 文件说明

根目录的model-catalog.json用于模型下载，version.json用于插件更新，均为运行必需文件。web/workflow-template.mjs是内置启动模板；tests/.fixtures中的JSON仅供测试。旧版工作流导出、历史说明、调研和旧FFmpeg构建说明已移出插件；不再附带examples目录。标准目录与AI交付规范.md由目录模板引用，予以保留。
