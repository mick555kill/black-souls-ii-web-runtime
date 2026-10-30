# BLACK SOULS II Web Runtime — v0.9

Experimental **RPG Maker VX Ace / RGSS3 WebAssembly** runtime exploring whether *BLACK SOULS II* can boot its Title Screen in a browser.

> **Current status:** A Node Worker test executes 223/223 non-Main RGSS3 script entries from the supplied game data and calls `Scene_Title.start` plus 10 update frames in CRuby WebAssembly. Browser rendering with the complete game assets, New Game and normal gameplay **are not yet verified or implemented**. This is a prototype, not a finished game player.

## Download and try on Windows

1. Download **[`black_souls_ii_web_v0_9_mkxp_title_boot.zip`](black_souls_ii_web_v0_9_mkxp_title_boot.zip)** from this repository.
2. Extract the **project ZIP itself** into a directory. It includes the necessary `vendor/ruby/ruby+stdlib.wasm` and synthetic test archive.
3. Install Node.js, then open PowerShell in the extracted directory:
   ```powershell
   node tests/server.cjs
   ```
4. Open **http://127.0.0.1:8000/** in Chrome or Edge.
5. Import your **own locally obtained** `Game.rgss3a` or game folder. Add required RTP assets when necessary. Try the **Title Screen (RGSS3)** boot button.

If `node` is not recognized, install Node.js and open a *new* PowerShell terminal. The fallback static server is `py -m http.server --bind 127.0.0.1 8000`, but Node is needed for the Node Worker tests.

## Source layout

- `src/` — JavaScript runtime, archive readers, Ruby bridge, RGSS3 bootstrap and rendering
- `tests/` — smoke tests and a synthetic archive generator
- `vendor/mkxp-z/` — RGSS3 RPG class definitions and original GPL license
- `vendor/ruby/` — Ruby browser adapter and license notices
- `README_TH.md` — **detailed Thai instructions and honest compatibility report**
- `black_souls_ii_web_v0_9_mkxp_title_boot.zip` — **complete distribution, including the larger WASM binary**

The large `vendor/ruby/ruby+stdlib.wasm` and generated `tests/sample.rgss3a` are supplied inside the distribution ZIP rather than as individual browsable repository files. **For a complete test installation, extract that ZIP**; cloning the source tree alone will not supply those files.

## Limitations and rights

This repository **does not include BLACK SOULS II, its game archive, private game data, or the RPG Maker RTP**. You must supply any game assets locally and respect their licenses. The bundled RGSS3 class definitions originate from [mkxp-z](https://github.com/mkxp-z/mkxp-z); retain applicable GPL notices and licenses when redistributing.

This project is independently experimental and makes no claim of affiliation with the game developer, RPG Maker, or mkxp-z.
