import os
import numpy as np
from PIL import Image, ImageFilter

ASSETS = os.path.join("src", "assets")
files = [f for f in os.listdir(ASSETS) if f.lower().endswith(".png")]

def detect(path):
    img = Image.open(path).convert("RGB")
    W, H = img.size
    gray = np.asarray(img.convert("L")).astype(np.int32)
    # 梯度幅值（边缘强度）
    gx = np.abs(np.diff(gray, axis=1, prepend=gray[:, :1]))
    gy = np.abs(np.diff(gray, axis=0, prepend=gray[:1, :]))
    edge = gx + gy

    # 仅在右下区域分块统计（x>0.5W, y>0.7H）
    ts = 24
    tiles = []
    coords = []
    for y in range(int(H * 0.70), H - ts, ts):
        for x in range(int(W * 0.50), W - ts, ts):
            tiles.append(edge[y:y + ts, x:x + ts].mean())
            coords.append((x, y))
    tiles = np.array(tiles)
    med = np.median(tiles)
    mad = np.median(np.abs(tiles - med)) + 1e-6
    z = (tiles - med) / (1.4826 * mad)
    # 异常高边缘块 = 水印
    hot = np.where(z > 8)[0]
    if len(hot) < 2:
        return None
    xs = [coords[i][0] for i in hot]
    ys = [coords[i][1] for i in hot]
    x0, x1 = min(xs), max(xs) + ts
    y0, y1 = min(ys), max(ys) + ts
    return (int(x0), int(y0), int(x1), int(y1)), (W, H)

for f in sorted(files):
    p = os.path.join(ASSETS, f)
    res = detect(p)
    if res is None:
        print(f"{f}: 未检测到突块")
    else:
        (x0, y0, x1, y1), (W, H) = res
        print(f"{f}: {W}x{H}  水印 x[{x0}-{x1}](w{x1-x0}) y[{y0}-{y1}](h{y1-y0})")
