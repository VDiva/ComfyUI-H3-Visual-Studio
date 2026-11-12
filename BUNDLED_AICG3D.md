# 内置 AICG3D

导演台入口现在直接注册 external_plugins/comfyui-AICG3D 中的节点，保留原始
AICG3D_H3* ID，现有 AICG3D 工作流不需要改节点名称。
前端部署在 web/js/aicg3d，随导演台的 WEB_DIRECTORY 加载。
不再需要单独安装 AICG3D。部署时上传整个导演台目录，不只上传 Python 入口。

云端原来的 custom_nodes/comfyui-AICG3D 和 custom_nodes/aicg3d-h3-suite
应移到 custom_nodes 以外再重启，避免同名 Python 包、HTTP 路由和浏览器扩展重复加载。
入口检测到先加载的外部副本会打印明确错误，不会静默复用旧模块。

内置源码来自用户提供的 v1.1.27 下载目录，保留 GPL-3.0-or-later 许可、版权和
第三方声明，见 external_plugins/comfyui-AICG3D/LICENSE。
导演台原始 Apache-2.0 LICENSE 不变；内置 AICG3D 不属于 Apache 授权代码。
再分发此组合包时需要同时保留并遵守 GPL 及第三方源码许可，不能将整个组合包
仅标记为 Apache-2.0。

前端副本仅把 ComfyUI scripts 的相对路径改为 /scripts/...，适配多一层的部署路径。
更新上游前端时需同步该副本。

验证包括加载桥接的隔离测试、Python 语法和 JS 语法检查；本地无 ComfyUI/GPU
依赖，尚未进行完整节点注册与推理验证。云端重启后以 /object_info 为准。
