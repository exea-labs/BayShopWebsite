"""Image derivatives for the site (run once; outputs live in public/assets/img).

Originals are never modified or renamed. Derivatives sit alongside them:
  * prizes: AVIF + WebP at 2x their largest display size (318px plates);
  * portraits and the Exea mark: the ink-to-paper duotone from DESIGN.md §6,
    cropped to the 4:5 plate (the mark stays square), AVIF + WebP.

Usage: python3 -I scripts/images.py [portraits]   (portraits: only the two portrait plates)
"""
import sys
from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "public" / "assets" / "img"

INK = (0x0E, 0x1A, 0x19)
PAPER = (0xF2, 0xEE, 0xE6)


def save(im: Image.Image, stem: str, avif_q: int = 60, webp_q: int = 80) -> None:
    for ext, kwargs in (("avif", {"quality": avif_q, "speed": 4}), ("webp", {"quality": webp_q, "method": 6})):
        out = IMG / f"{stem}.{ext}"
        im.save(out, ext.upper(), **kwargs)
        print(f"{out.name:32s} {im.size[0]}x{im.size[1]}  {out.stat().st_size / 1024:6.1f} KB")


def css_contrast(im: Image.Image, c: float) -> Image.Image:
    # CSS contrast(): (v - 0.5) * c + 0.5, per channel
    return im.point(lambda v: max(0, min(255, round((v / 255 - 0.5) * c * 255 + 127.5))))


def duotone(im: Image.Image, brightness: float = 1.0, contrast: float = 1.0, gamma: float = 1.0, hi=PAPER) -> Image.Image:
    im = im.convert("RGB")
    if brightness != 1.0:
        im = ImageEnhance.Brightness(im).enhance(brightness)
    if contrast != 1.0:
        im = css_contrast(im, contrast)
    r, g, b = im.split()
    # Rec. 709 luminance on the sRGB values, as feColorMatrix does in sRGB space
    y = Image.merge("RGB", (r, g, b)).convert("L", (0.2126, 0.7152, 0.0722, 0))
    if gamma != 1.0:
        y = y.point(lambda v: round(255 * (v / 255) ** gamma))
    channels = [y.point(lambda v, a=a, z=z: round(a + (z - a) * v / 255)) for a, z in zip(INK, hi)]
    return Image.merge("RGB", channels)


def crop_4x5(im: Image.Image, cx: float = 0.5) -> Image.Image:
    w, h = im.size
    cw = round(h * 4 / 5)
    left = max(0, min(w - cw, round(w * cx - cw / 2)))
    return im.crop((left, 0, left + cw, h))


# The portraits' light end. Avyank's white backdrop would otherwise print as
# paper and the plate would vanish into the page; mapped to a light warm grey,
# it keeps its edge and sits closer to Wesley's mid-tone backdrop, so the two
# read as one set of prints.
PRINT_HI = (0xD9, 0xD3, 0xC6)


def portraits() -> None:
    # Wesley: blue backdrop lifted to a light-mid grey-green
    # (tighter crop, face centred, eye line near 44% from the top)
    wes = duotone(Image.open(IMG / "wesley.jpg"), brightness=1.26, contrast=0.9, gamma=0.78)
    save(wes.crop((36, 40, 324, 400)), "wesley-duo-288x360", avif_q=58)

    # Avyank: white backdrop becomes the light print grey
    av = duotone(Image.open(IMG / "Avyank.png"), brightness=0.97, contrast=1.04, hi=PRINT_HI)
    av = crop_4x5(av)
    for w in (408, 816):
        save(av.resize((w, round(w * 5 / 4)), Image.LANCZOS), f"Avyank-duo-{w}x{round(w * 5 / 4)}", avif_q=58)


def main() -> None:
    # Prizes (white backgrounds; the plates multiply them into paper-2)
    for name, size in (
        ("prize-drone.jpg", 500),
        ("prize-airpods.avif", 640),
        ("prize-keyboard.avif", 640),
        ("prize-speaker.jpg", 640),
    ):
        im = Image.open(IMG / name).convert("RGB")
        if im.width > size:
            im = im.resize((size, round(im.height * size / im.width)), Image.LANCZOS)
        save(im, f"{Path(name).stem}-{im.width}", avif_q=62)

    portraits()

    # The Exea mark: ink ground, paper /E/
    mark = duotone(Image.open(IMG / "exea-mark.png"))
    save(mark, "exea-mark-duo-256", avif_q=70)


if __name__ == "__main__":
    if sys.argv[1:] == ["portraits"]:
        portraits()
    else:
        main()
