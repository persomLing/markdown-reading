import os
from PIL import Image

ASSETS = os.path.join("src", "assets")
files = [f for f in os.listdir(ASSETS) if f.lower().endswith(".png")]

BOTTOM_CROP = 120  # 裁掉底部水印条
QUALITY = 80

def fmt(n):
    return f"{n/1024:.0f} KB"

for f in sorted(files):
    src = os.path.join(ASSETS, f)
    img = Image.open(src).convert("RGB")
    W, H = img.size
    # 裁掉底部水印条
    img = img.crop((0, 0, W, H - BOTTOM_CROP))
    # 保存为 WebP
    out = os.path.join(ASSETS, os.path.splitext(f)[0] + ".webp")
    img.save(out, "WEBP", quality=QUALITY, method=6)
    s_old = os.path.getsize(src)
    s_new = os.path.getsize(out)
    print(f"{f}: {W}x{H} -> {W}x{H - BOTTOM_CROP}  {fmt(s_old)} -> {fmt(s_new)}")

print("\n完成。")
