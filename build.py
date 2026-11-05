#!/usr/bin/env python3
"""Bundle the diorama into one portable, offline-friendly HTML file."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'index.html'

CSS = (ROOT / 'src' / 'style.css').read_text(encoding='utf-8')
MAIN = (ROOT / 'src' / 'main.js').read_text(encoding='utf-8')
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

html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>星見マート · 雨夜の街角</title>
  <link rel="icon" href="data:," />
  <style>
{CSS}
  </style>
</head>
<body>
  <canvas id="scene"></canvas>
{chr(10).join(scripts)}
  <script>
{MAIN}
  </script>
</body>
</html>
'''
OUT.write_text(html, encoding='utf-8')
print(f'Wrote {OUT} ({OUT.stat().st_size / 1024 / 1024:.2f} MB)')
