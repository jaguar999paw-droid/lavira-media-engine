#!/usr/bin/env python3
"""
Lavira Safaris — WhatsApp Story Card Compositor
Smartphone format 1080x1920 | Giraffe / Rhino daylight
"""
import urllib.request, io, os, textwrap
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

OUT = "/home/kamau/lavira-media-engine/archive/posts/lavira_whatsapp_giraffe_olpejeta.jpg"
W, H = 1080, 1920

# ── 1. Download giraffe image (Ethan Ngure / Pexels) ──────────────────────────
GIRAFFE_URL = "https://images.pexels.com/photos/26052069/pexels-photo-26052069.jpeg?auto=compress&cs=tinysrgb&w=1080&h=1920&fit=crop"
print("Downloading giraffe image...")
req = urllib.request.Request(GIRAFFE_URL, headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req, timeout=20) as r:
    bg = Image.open(io.BytesIO(r.read())).convert("RGB")

# Crop to 1080x1920
bg_ratio = bg.width / bg.height
target_ratio = W / H
if bg_ratio > target_ratio:
    new_w = int(bg.height * target_ratio)
    x = (bg.width - new_w) // 2
    bg = bg.crop((x, 0, x + new_w, bg.height))
else:
    new_h = int(bg.width / target_ratio)
    y = (bg.height - new_h) // 4  # crop from 1/4 down to keep animal in frame
    bg = bg.crop((0, y, bg.width, y + new_h))

bg = bg.resize((W, H), Image.LANCZOS)

# Boost vibrance slightly
bg = ImageEnhance.Color(bg).enhance(1.18)
bg = ImageEnhance.Contrast(bg).enhance(1.08)

canvas = bg.copy()
draw = ImageDraw.Draw(canvas)

# ── 2. Gradient overlays ──────────────────────────────────────────────────────
overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
od = ImageDraw.Draw(overlay)

# Top fade (for logo area)
for i in range(320):
    alpha = int(180 * (1 - i / 320))
    od.rectangle([(0, i), (W, i + 1)], fill=(10, 18, 28, alpha))

# Bottom fade (for text area)
for i in range(680):
    alpha = int(210 * (i / 680) ** 1.4)
    od.rectangle([(0, H - 680 + i), (W, H - 680 + i + 1)], fill=(8, 14, 22, alpha))

canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")
draw = ImageDraw.Draw(canvas)

# ── 3. Colour palette ─────────────────────────────────────────────────────────
GREEN   = (45, 106, 79)
ACCENT  = (244, 162, 97)
WHITE   = (255, 248, 238)
MUTED   = (200, 185, 160)
DARK    = (12, 22, 34)
CREAM   = (252, 237, 210)

# ── 4. Load fonts ─────────────────────────────────────────────────────────────
def font(size, bold=False):
    paths = [
        f"/usr/share/fonts/truetype/dejavu/DejaVuSans{'Bold' if bold else ''}.ttf",
        f"/usr/share/fonts/truetype/liberation/LiberationSans-{'Bold' if bold else 'Regular'}.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

f_tiny    = font(28)
f_small   = font(34)
f_body    = font(42)
f_bold    = font(44, bold=True)
f_title   = font(100, bold=True)
f_huge    = font(130, bold=True)
f_label   = font(36, bold=True)

# ── 5. Lavira Logo block (top) ────────────────────────────────────────────────
# Logo pill background
pill_w, pill_h = 420, 90
pill_x = (W - pill_w) // 2
pill_y = 64
logo_pill = Image.new("RGBA", (pill_w + 20, pill_h + 10), (0, 0, 0, 0))
lpd = ImageDraw.Draw(logo_pill)
lpd.rounded_rectangle([(0, 0), (pill_w, pill_h)], radius=12,
                       fill=(45, 106, 79, 220), outline=(244, 162, 97, 160), width=2)
canvas = canvas.convert("RGBA")
canvas.alpha_composite(logo_pill, (pill_x, pill_y))
canvas = canvas.convert("RGB")
draw = ImageDraw.Draw(canvas)

# Leaf icon (simple polygon)
leaf_cx, leaf_cy = pill_x + 52, pill_y + 45
pts = [(leaf_cx, leaf_cy - 20), (leaf_cx + 16, leaf_cy),
       (leaf_cx, leaf_cy + 20), (leaf_cx - 16, leaf_cy)]
draw.polygon(pts, fill=ACCENT)
draw.ellipse([(leaf_cx - 5, leaf_cy - 5), (leaf_cx + 5, leaf_cy + 5)], fill=GREEN)

# Logo text
lx = pill_x + 82
draw.text((lx, pill_y + 8),  "LAVIRA SAFARIS", font=f_bold, fill=CREAM)
draw.text((lx, pill_y + 56), "Making Your Safari Experience Memorable",
          font=f_tiny, fill=(244, 162, 97, 200))  # PIL ignores alpha in RGB mode
draw.text((lx, pill_y + 56), "Making Your Safari Experience Memorable",
          font=f_tiny, fill=(220, 180, 120))

# ── 6. Top tag strip ──────────────────────────────────────────────────────────
draw.text((54, 180), "📍 Ol Pejeta Conservancy · Nanyuki, Kenya",
          font=f_small, fill=ACCENT)

# ── 7. Wildlife hook (mid-upper) ─────────────────────────────────────────────
hook_y = 310
draw.text((54, hook_y), "FACE TO FACE WITH", font=f_label, fill=ACCENT)
draw.text((54, hook_y + 46), "AFRICA'S LAST", font=f_huge, fill=WHITE)
draw.text((54, hook_y + 46 + 138), "GIANTS.", font=f_huge, fill=ACCENT)

# ── 8. Divider line ───────────────────────────────────────────────────────────
draw.rectangle([(54, hook_y + 340), (54 + 220, hook_y + 344)], fill=ACCENT)

# ── 9. Tour info block ───────────────────────────────────────────────────────
info_y = hook_y + 368
draw.text((54, info_y), "2 DAYS OL PEJETA LOCAL TOUR",
          font=f_bold, fill=CREAM)

lines = [
    "✦  Black rhino & chimp sanctuary",
    "✦  Reticulated giraffe game drive",
    "✦  Departs Nairobi — same day return",
    "✦  All-inclusive · Expert local guide",
]
for i, line in enumerate(lines):
    draw.text((54, info_y + 58 + i * 52), line, font=f_body, fill=MUTED)

# ── 10. Local features badge strip ────────────────────────────────────────────
badge_y = info_y + 310
badges = ["🦏  Rhino Encounter", "🦒  Giraffe Walk", "🐒  Chimp Sanctuary", "🌿  Nanyuki Stopover"]
for i, b in enumerate(badges):
    bx = 54 + (i % 2) * 490
    by = badge_y + (i // 2) * 72
    # Badge background
    badge_img = Image.new("RGBA", (440, 60), (0, 0, 0, 0))
    bd = ImageDraw.Draw(badge_img)
    bd.rounded_rectangle([(0, 0), (440, 60)], radius=8,
                          fill=(45, 106, 79, 180), outline=(244, 162, 97, 120), width=1)
    canvas_rgba = canvas.convert("RGBA")
    canvas_rgba.alpha_composite(badge_img, (bx, by))
    canvas = canvas_rgba.convert("RGB")
    draw = ImageDraw.Draw(canvas)
    draw.text((bx + 14, by + 10), b, font=f_small, fill=CREAM)

# ── 11. Price / CTA block ─────────────────────────────────────────────────────
cta_y = H - 300
# CTA background strip
cta_bg = Image.new("RGBA", (W, 270), (0, 0, 0, 0))
cbd = ImageDraw.Draw(cta_bg)
cbd.rounded_rectangle([(40, 0), (W - 40, 265)], radius=16,
                       fill=(45, 106, 79, 230), outline=(244, 162, 97, 180), width=2)
canvas_rgba = canvas.convert("RGBA")
canvas_rgba.alpha_composite(cta_bg, (0, cta_y))
canvas = canvas_rgba.convert("RGB")
draw = ImageDraw.Draw(canvas)

draw.text((100, cta_y + 18),  "📲  WhatsApp us now — we reply fast!",
          font=f_bold, fill=CREAM)
draw.text((100, cta_y + 72),  "+254 721 757 387",
          font=font(64, bold=True), fill=ACCENT)
draw.text((100, cta_y + 148), "lavirasafaris.com  ·  info@lavirasafaris.com",
          font=f_body, fill=MUTED)
draw.text((100, cta_y + 204), "@lavirasafaris  ·  #OlPejeta  ·  #KenyaWildlife  ·  #LaviraKenya",
          font=f_small, fill=(160, 140, 110))

# ── 12. Photo credit ─────────────────────────────────────────────────────────
draw.text((54, H - 28), "Photo: Ethan Ngure / Pexels  ·  Lavira Media Engine",
          font=f_tiny, fill=(120, 100, 75))

# ── 13. Save ──────────────────────────────────────────────────────────────────
os.makedirs(os.path.dirname(OUT), exist_ok=True)
canvas.save(OUT, "JPEG", quality=92, optimize=True)
print(f"Saved → {OUT}  ({os.path.getsize(OUT)//1024} KB)")
