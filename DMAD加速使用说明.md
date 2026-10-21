# DMAD视频加速

本次参考 AICG3D 的 DMAD 接入路线，独立实现面板和请求接入，没有复制它的渲染器源码：
<https://github.com/JGRFW/comfyui-AICG3D/blob/main/RELEASE_NOTES_v1.1.4.md>

采样配方依据 DMAD 作者的 ComfyUI 说明，使用原生 `lcm + simple`，无需另外安装 DMAD 采样节点：
<https://github.com/Yzmblog/DMAD/tree/main/comfyui>

## 安装与使用

1. 将最新版 `ComfyUI-H3-Visual-Studio_0.5.4_DMAD默认修复.zip` 解压到云电脑的 `ComfyUI`，覆盖其中同名 `custom_nodes/ComfyUI-H3-Visual-Studio`。重启ComfyUI，再强制刷新浏览器。本机源码更新不会自动部署到云端。
2. 在面板“官方生成设置与公共提示词”选择“DMAD四步加速”。新旧页面各自保存该选项，要对每个需要加速的页面设置。
3. 点击模型检查，或直接运行触发检查。在“模型下载”页签下载缺少的 `dmad_minimax_h3_4step_full_critic_comfyui.safetensors`，约2GB。下载由云端完成，并沿用原有版本固定、大小与SHA256校验。不要只把文件放在本机。
4. 首次下载完成后，如下拉清单尚未刷新可重启ComfyUI。先用一个4—5秒素材组生成，确认速度、动作、对白与画质，再批量运行。

权重来源：<https://huggingface.co/ZhengmingYu/DMAD/tree/main/minimax_h3>

手动下载直链：<https://huggingface.co/ZhengmingYu/DMAD/resolve/main/minimax_h3/dmad_minimax_h3_4step_full_critic_comfyui.safetensors>

云端目录：`ComfyUI/models/loras/`。需要文件名带 `_comfyui` 的版本。

也可导入根目录 `工作流_DMAD四步加速.json` 作为空工程入口；其页面预选DMAD四步。原来的 `工作流.json` 没有覆盖，已有页面和素材请继续使用原工程，直接从面板切换即可。

## 具体行为

|模式|实际采样|用途|
|---|---|---|
|沿用原图|沿用原LoRA、面板步数和采样器|与旧工程对照|
|DMAD四步|DMAD LoRA强度1、4步、lcm/simple、视频/音频偏移12/2|先测速度|
|DMAD八步|同一DMAD配方，8步|动作质量对照|

启用后会替换当前单个Turbo LoRA，不能与原Turbo叠加；模式锁定配套步数、采样器和调度器，其他参数及种子照常保留。没有降低分辨率、帧率或时长。人物参考图仍使用独立Qwen-Image-2.1设置，不受DMAD影响。参考音频开关与加速独立，默认关闭。

面板批量、单组和原生Run都会编译同一配方，导出纯官方JSON时也应用配方。导出后脱离面板的JSON会固定当前DMAD设置；在面板选择“沿用原图”，指的是恢复当前加载图的参数，不是跨工作流找回另一份旧图。若加载了导出的DMAD图，需加载原工程才能找回原Turbo。

目前要求配套的 `UNETLoader → 单个LoraLoaderModelOnly → MiniMaxH3SigmaShift → BasicGuider/BasicScheduler → SamplerCustomAdvanced`。已有叠加LoRA或额外模型patch链时明确报错，避免误替换。可先用配套工作流验证。

DMAD训练目标为文生音视频；参考模型和社区混合模型上的效果需实测。保留当前主模型，不自动下载或更换大模型。采样步数减半不等于总耗时减半：模型加载、编码、解码、内存换入换出不随步数同比缩短。没有承诺画质无损或解决参考音频异常。

## 验证与测速

已通过：DMAD四/八步请求参数、仅一份加速LoRA、原模式恢复、关闭参考音频、人物生图隔离、缺模型预检、不兼容链拦截、导出一致性；真实无头浏览器使用模拟服务验证选择器、跨页/重载保存、单组和原生Run请求、官方工作流导出。

未做云端GPU推理。建议在相同模型、分辨率、时长、图片和种子下，分别记录原8步与DMAD四步的首轮及第二轮耗时，并保留结果。首轮包含模型加载，第二轮更方便比较采样耗时。若质量不合适，切回原模式，不用重新安装插件。
