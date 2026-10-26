# Paints a soft, out-of-focus interior (window light, warm wall, plants, wooden table) for the glass theme.
import sys, numpy as np
from PIL import Image, ImageDraw, ImageFilter
W, H = 2400, 1500
img = Image.new("RGB", (W, H))
px = np.zeros((H, W, 3), np.float32)
top, bot = np.array([214, 204, 190]), np.array([168, 152, 132])
t = np.linspace(0, 1, H)[:, None, None]
px[:] = top * (1 - t) + bot * t
img = Image.fromarray(px.astype(np.uint8))
d = ImageDraw.Draw(img, "RGBA")
# big window on the left: bright panes with dark frames
d.rectangle([60, 80, 760, 1080], fill=(246, 242, 234, 255))
for x in (60, 290, 525, 745):
    d.rectangle([x, 80, x + 16, 1080], fill=(92, 78, 64, 255))
for y in (80, 420, 760, 1066):
    d.rectangle([60, y, 760, y + 14], fill=(92, 78, 64, 255))
# warm daylight spill on the wall
d.ellipse([500, -200, 1500, 900], fill=(255, 236, 205, 70))
# doorway / darker alcove on the right
d.rectangle([1720, 60, 2180, 1100], fill=(128, 112, 96, 255))
d.rectangle([1760, 120, 2140, 1100], fill=(150, 134, 116, 255))
# pendant lamp glow
d.ellipse([1180, 40, 1300, 140], fill=(255, 226, 170, 255))
d.ellipse([1040, -60, 1440, 300], fill=(255, 220, 160, 60))
# wooden table / floor
d.rectangle([0, 1180, W, H], fill=(112, 82, 56, 255))
d.rectangle([0, 1180, W, 1230], fill=(140, 106, 74, 255))
# plants (left and right)
rng = np.random.default_rng(7)
for cx, cy, n, r in ((220, 1120, 46, 120), (2280, 1000, 40, 110), (1600, 1150, 22, 70)):
    for _ in range(n):
        x, y = cx + rng.normal(0, r), cy + rng.normal(0, r * 0.9)
        rr = rng.uniform(30, 75)
        g = int(rng.uniform(60, 100))
        d.ellipse([x - rr, y - rr * 0.7, x + rr, y + rr * 0.7], fill=(int(g * 0.55), g, int(g * 0.6), 235))
    d.rectangle([cx - 70, cy + 120, cx + 70, cy + 260], fill=(200, 190, 176, 255))
# sofa shape bottom centre
d.rounded_rectangle([700, 1060, 1500, 1300], 60, fill=(196, 184, 168, 255))
d.rounded_rectangle([740, 1000, 1460, 1110], 50, fill=(206, 196, 182, 255))
img = img.filter(ImageFilter.GaussianBlur(26))
# OSF mark on the back wall (no name): painted on its own layer and blurred less, so it still reads as the logo.
# Same geometry as src/components/logo.tsx (viewBox 100): navy ring 39-49, blue ring 30.2-39 in three quarters
# (none bottom-right), orange ring 8.3-13.3, thin straight cuts at N/E/S/W.
sign = Image.new("RGBA", (W, H), (0, 0, 0, 0))
g = ImageDraw.Draw(sign)
cx, cy, k = 1240, 520, 7.0   # 1 logo unit = 7 px (700 px across)
def box(r):
    return [cx - r * k, cy - r * k, cx + r * k, cy + r * k]
g.ellipse(box(49), outline=(20, 40, 77, 255), width=int(10 * k))
g.arc(box(39), 90, 360, fill=(36, 125, 245, 255), width=int(8.8 * k))  # PIL: clockwise from 3 o'clock
g.ellipse(box(13.3), outline=(236, 110, 10, 255), width=int(5 * k))
cut = 2.1 * k
for x0, y0, x1, y1 in ((cx - cut, cy - 50 * k, cx + cut, cy - 26 * k), (cx - cut, cy + 26 * k, cx + cut, cy + 50 * k),
                       (cx - 50 * k, cy - cut, cx - 26 * k, cy + cut), (cx + 26 * k, cy - cut, cx + 50 * k, cy + cut)):
    g.rectangle([x0, y0, x1, y1], fill=(0, 0, 0, 0))
sign = sign.convert("RGBa").filter(ImageFilter.GaussianBlur(8)).convert("RGBA")  # premultiplied: no dark fringe
img = Image.alpha_composite(img.convert("RGBA"), sign).convert("RGB")
a = np.asarray(img).astype(np.float32)
a += np.random.default_rng(1).normal(0, 2.2, a.shape)  # fine grain: no colour banding
Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((1920, 1200), Image.LANCZOS).save(sys.argv[1], "WEBP", quality=78)
