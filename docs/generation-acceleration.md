# 导演台生成加速

这些功能由导演台独立实现，不需要安装 AICG3D，也不加载它的前端或模块。
更新后在原 MiniMaxH3Director 的“性能”组中设置。

## 建议先这样试

- 保持原分辨率、帧数、模型、LoRA、步数、种子不变，连续跑相同的两段。
- 原“段间清理显存”保持开启，model_residency 选择 cache。
- attention_backend 首先保留 inherit。需要自动选择已安装 Sage 时切到 auto，检查日志中的 effective。
- reference_encode_cache_mb 设为 256；motion_cache 保持关闭。
- 第一段和后续段分别比较报告中的 cond/sample/decode 以及总耗时。首次模型加载和内核编译会影响结果。

## 模型驻留

| model_residency | 段间处理 |
|---|---|
| legacy | 沿用旧“段间清理显存”行为，默认值，兼容旧工作流 |
| cache | 垃圾回收、清预取队列及 CUDA 空闲缓存，不主动卸载全部模型 |
| keep | 不主动执行段间清理，模型与缓存由 ComfyUI 按需管理 |
| unload | 段间主动卸载全部模型，显存紧张时使用 |

上述策略只有旧“段间清理显存”开关开启时执行。关闭该开关仍然表示不做段间清理。
“二采前清理显存”“脸修前清理显存”是显式阶段转换操作，继续独立生效，不能被 keep 屏蔽。
keep/cache 不会强迫模型常驻 GPU，也不关闭 ComfyUI 自身的动态卸载机制。
若显存不足，改回 unload 或 legacy；此版本不自动重试失败的采样，以免状态化续写被重复执行。
运行结束释放编码缓存；驻留模式下，仅在图 MODEL 上保留本次使用的 patcher 引用，避免弱引用模型槽失效。

## 注意力后端

inherit 不改动输入 MODEL，适合已在外部接 Sage/其他注意力节点的工作流。
auto 依次检查已注册的 sage、sage3，否则保留输入 MODEL 的后端。
也可显式选择 sage、sage3、flash、comfy_kitchen_int8、pytorch。
依赖缺失或补丁 API 不可用时保留输入后端并记录原因，不安装依赖、不承诺某后端一定更快。
只克隆 ModelPatcher，不修改输入 MODEL，不复制完整模型权重。

## 参考编码缓存

同一次导演台执行内，官方条件节点收到 VAE 代理，仅缓存 encode()：视频 VAE 与音频 VAE
共用 CPU LRU 容量，图片、音频、视频和关键帧都按实际预处理后的张量内容匹配。
key 包括 VAE 对象身份、张量形状、dtype、设备及完整 SHA-256；换素材、剪辑、重采样、尺寸均会导致 miss。
缓存返回独立副本，避免官方条件节点或后续处理的原地修改污染其他片段。
0 关闭。CPU 内存上限只约束缓存条目，不代表整个生成过程的内存上限。
计算内容摘要需要 CPU 拷贝和哈希；如果素材每段都不同，缓存可能没有收益。
附加 encode 参数、非张量输入/输出不会缓存。缓存不跨运行保存，也不修改文本编码器。

## 实验性 MotionCache

默认关闭。本实现是 AV latent 变化较小时复用上一轮网络速度预测，不是 TeaCache 隐层残差算法。
它会改变数值结果，可能降低动作、口型和纹理质量，不能视为无损加速。
仅普通一采、无负面条件、CFG=1、至少8步、euler 或 res_multistep 时允许；二采、SelfLift、脸修、
空间分块、带 after_shift 的强制段间重绘/续写回调均跳过。不符合条件时写明 bypass 原因。
预热4次模型调用、末2次保留实算、最多连续复用1次；视频和音频两路的变化均必须低于阈值。
同时间步重复求值或时间步反向、形状/dtype/设备变化时实算。
默认阈值0.02，越大越激进。4/6步蒸馏模型直接跳过，避免为了缓存牺牲少数关键步骤。
状态按每次采样创建，finally 清理；不会跨片段、跨种子、跨模型复用预测。
报告会输出实际复用的模型调用次数，不把它当成实测速度倍数。

## 报告与缓存匹配

保留各段 cond/sample/decode/cache 时长；新增总耗时、显存清理时长、VAE 编码命中/未命中、
哈希和实际 VAE encode 时长，以及注意力生效/回退与运动缓存情况。
模型加载和数据搬运可能发生在条件编码、采样或解码内部，不能把 sample 时间全当成纯网络计算时间。
注意力选择和运动缓存参数加入一采及成片缓存指纹，并同步给前端缓存状态检查。
模型驻留策略和无损编码缓存容量不改变缓存指纹。

## 验证范围

本地无 PyTorch/ComfyUI/GPU：使用轻量张量及 ComfyUI API 测试替身验证缓存内容匹配、容量、
副本隔离、策略、强制卸载、注意力补丁隔离、采样桥接和异常清理。它们不能替代 GPU 数值与画质验证。
Python/JS 语法检查及原公共素材库/导入回归测试另行执行。暂无量化提速结论。

接口依据：
- https://github.com/Comfy-Org/ComfyUI/blob/master/comfy/model_patcher.py
- https://github.com/Comfy-Org/ComfyUI/blob/master/comfy/patcher_extension.py
- https://github.com/Comfy-Org/ComfyUI/blob/master/comfy/ldm/minimax/model.py
- https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_extras/nodes_minimax_h3.py
