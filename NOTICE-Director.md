# Director source attribution

## Full runtime integration (0.14.0)

`director_core/director`, `director_core/nodes` and `director_core/lib` were copied from the user-provided local source `C:/Svn/Video/MiniMaxComfyUiPlugin` on 2026-10-21. No upstream commit identifier was present in that directory. Original source hashes are recorded in `director_core/source-manifest.json`. Apache-2.0 license is included in `director_core/LICENSE`.

The upstream root initializer/frontend/routes are not activated. `director_bridge.py` registers Studio-specific node names, removes UI-only BDGROUP inputs, and packs Studio references with upstream `pack_r2v_group`. The Director executor, sampling, latent upscaling, refinement and SelfLift are used directly. A local change to `director/refine_pack.py` honors the Studio's explicit target canvas for MP rounding and fixed-canvas A/B comparisons. `director_core/__init__.py` is a local registration-free initializer. Other vendored source files are unchanged.

`web/director-core.mjs` translates existing Studio project settings and selected model/LoRA connections into these runtime nodes, preserving generated audio outputs and separate original/final video saves. Pixel post-upscaling continues to use Studio nodes. FaceRefine/semantic bridge source is included as part of the runtime; the Studio does not add new controls for those features.

## Distribution notices

The original byte hashes remain in source-manifest.json. Git checkout can convert LF/CRLF; source-normalized-manifest.json records LF-normalized hashes for unchanged upstream Python files. Each normalized entry was verified against the original byte hash using its original LF, CRLF or mixed newline representation. The modified refine_pack.py is excluded from that unchanged-source manifest.

See the root NOTICE and LICENSE, director_core/LICENSE, and the preserved upstream README. Existing copyright and attribution comments remain in the vendored sources. Modified upstream files carry a change notice. This package does not claim authorship of the upstream runtime or endorsement from upstream maintainers.

The former standalone latent/SelfLift adapters and their duplicate license file were removed in 0.14.1. The complete Apache-2.0 text is retained at the root and inside director_core. Models and third-party dependencies retain their own licenses.
