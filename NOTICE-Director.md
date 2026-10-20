# Director source attribution

director_latent_upscale.py and director_condition_resize.py are adapted from AIMixer/ComfyUI_MiniMaxH3_Director, commit 4c6245e518dd8a494f3afc4f3cccd53f22d82d10.

https://github.com/AIMixer/ComfyUI_MiniMaxH3_Director/tree/4c6245e518dd8a494f3afc4f3cccd53f22d82d10

Apache-2.0 license supplied in LICENSE-Director.txt. Upstream credits LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler for the 3D architecture. Original comments retained.

Local changes: adapted AV helper import; PyTorch loading uses weights_only=True. The local node adapter preserves audio and returns resized positive conditioning. The upstream network, normalization, fp32 inference and temporal chunk blending are retained.
