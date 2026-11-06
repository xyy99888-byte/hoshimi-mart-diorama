#!/usr/bin/env python3
"""Bundle the diorama into one portable, offline-friendly HTML file."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'index.html'

CSS = (ROOT / 'src' / 'style.css').read_text(encoding='utf-8')
MAIN = (ROOT / 'src' / 'main.js').read_text(encoding='utf-8')
AUDIO = (ROOT / 'src' / 'audio-data.js').read_text(encoding='utf-8')
VENDORS = [
    'three.min.js',
    'CopyShader.js',
    'LuminosityHighPassShader.js',
    'EffectComposer.js',
    'RenderPass.js',
    'ShaderPass.js',
    'UnrealBloomPass.js',
    'OrbitControls.js',
]

scripts = []
for name in VENDORS:
    source = (ROOT / 'vendor' / name).read_text(encoding='utf-8')
    scripts.append(f'<script>\n/* {name} */\n{source}\n</script>')
scripts.append(f'<script>\n/* offline audio bank */\n{AUDIO}\n</script>')

html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>星見マート · 雨と晴れの街角</title>
  <link rel="icon" href="data:," />
  <style>
{CSS}
  </style>
</head>
<body>
  <canvas id="scene"></canvas>
  <div class="weather-toggle" id="weatherToggle" role="group" aria-label="天气切换">
    <button class="weather-btn" id="btnSunny" type="button" aria-label="切换到晴天" aria-pressed="true" title="晴天">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <circle cx="12" cy="12" r="4.1"></circle>
        <path d="M12 2.6v2.2M12 19.2v2.2M4.6 12H2.4M21.6 12h-2.2M5.7 5.7 4.1 4.1M19.9 19.9l-1.6-1.6M5.7 18.3 4.1 19.9M19.9 4.1l-1.6 1.6"></path>
      </svg>
    </button>
    <button class="weather-btn" id="btnRain" type="button" aria-label="切换到雨夜" aria-pressed="false" title="雨夜">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7.2 15.6a4.1 4.1 0 0 1 .6-8.1A5.6 5.6 0 0 1 18.5 9a3.4 3.4 0 0 1 .6 6.6"></path>
        <path d="M7.7 18.4 6.9 21M11.8 18.4l-.8 2.6M15.9 18.4l-.8 2.6"></path>
      </svg>
    </button>
    <button class="weather-btn mute-btn" id="btnMute" type="button" aria-label="静音" aria-pressed="false" title="静音">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4.5 9.5h3l4.2-3.2v11.4l-4.2-3.2h-3z"></path>
        <path class="sound-wave" d="M15.2 9.2a4.2 4.2 0 0 1 0 5.6M17.8 6.8a7.4 7.4 0 0 1 0 10.4"></path>
      </svg>
      <span class="mute-slash"></span>
    </button>
  </div>
{chr(10).join(scripts)}
  <script>
{MAIN}
  </script>
</body>
</html>
'''
OUT.write_text(html, encoding='utf-8')
print(f'Wrote {OUT} ({OUT.stat().st_size / 1024 / 1024:.2f} MB)')
