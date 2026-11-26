"""
Siluetas precisas de las figuras con GrabCut (OpenCV), sin modelos descargados.

Cada figura de scene.json tiene un polígono trazado a mano. Aquí ese polígono se usa
como "región de interés" (ROI) para inicializar GrabCut, que separa figura y fondo
modelando sus colores con mezclas de gaussianas y cortando un grafo:

  - fondo seguro:    fuera del ROI dilatado
  - fondo probable:  la franja entre el ROI y su dilatación
  - figura probable: dentro del ROI
  - figura segura:   el ROI erosionado (el centro del cuerpo)

Opciones por figura en scene.json ("segment"): "core" fija la erosión del núcleo;
"roiAs": "background" trata el ROI como fondo probable;
"include" y "exclude" son polígonos (en píxeles) que se fuerzan como figura o como
fondo, para las zonas donde GrabCut confunde colores (una cabeza contra un muro del
mismo tono, la mano de Gabriel contra el piso, el cielo entre dos figuras).

El contorno del resultado (simplificado a ~1,5 px) reemplaza al polígono; el
original se conserva en "roi" para poder repetir el proceso. Si una silueta no
convence, se corrige a mano con analysis/marcador.html (modo polígonos).

Uso:  python analysis/segment.py            (todas las figuras)
      python analysis/segment.py maria nino (solo algunas)
Salida: public/data/scene.json actualizado y docs/11_siluetas.jpg
"""

import json
import re
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SCENE = ROOT / "public/data/scene.json"
BAND = 28        # px: franja de "fondo probable" alrededor del ROI
CORE = 34        # px: erosión máxima para la "figura segura" (se adapta al tamaño)
EPS = 1.5        # px: tolerancia de simplificación del contorno
MIN_AREA = 400   # px²: componentes o huecos menores se descartan


def roi_mask(shape, poly, holes):
    img = Image.new("L", (shape[1], shape[0]), 0)
    d = ImageDraw.Draw(img)
    d.polygon([tuple(p) for p in poly], fill=1)
    for h in holes:
        d.polygon([tuple(p) for p in h], fill=0)
    return np.asarray(img, np.uint8)


def segment(img, el):
    poly = el.get("roi", el["polygon"])
    holes = el.get("roiHoles", [])
    pts = np.array(poly, float)
    x0, y0 = np.floor(pts.min(axis=0) - BAND * 2).astype(int)
    x1, y1 = np.ceil(pts.max(axis=0) + BAND * 2).astype(int)
    x0, y0 = int(max(x0, 0)), int(max(y0, 0))
    x1, y1 = int(min(x1, img.shape[1])), int(min(y1, img.shape[0]))
    crop = img[y0:y1, x0:x1]
    local = [[p[0] - x0, p[1] - y0] for p in poly]
    local_holes = [[[p[0] - x0, p[1] - y0] for p in h] for h in holes]
    roi = roi_mask(crop.shape, local, local_holes)

    opts = el.get("segment", {})
    k = lambda r: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    dil = cv2.dilate(roi, k(BAND))
    # Núcleo "figura segura" proporcional al tamaño: en figuras chicas una erosión
    # fija de 34 px se comía la cabeza entera y GrabCut la podía descartar.
    bw, bh = pts.max(axis=0) - pts.min(axis=0)
    core_r = int(opts.get("core", np.clip(0.07 * min(bw, bh), 6, CORE)))
    core = cv2.erode(roi, k(core_r))
    mask = np.full(roi.shape, cv2.GC_BGD, np.uint8)
    mask[dil > 0] = cv2.GC_PR_BGD
    # Por defecto el ROI es "figura probable". Con "roiAs": "background" es "fondo
    # probable": útil en figuras chicas cuyo ROI tiene mucho muro o cielo, donde la
    # figura debe justificarse a partir del núcleo y de los polígonos "include".
    mask[roi > 0] = cv2.GC_PR_BGD if opts.get("roiAs") == "background" else cv2.GC_PR_FGD
    mask[core > 0] = cv2.GC_FGD
    # Polígonos trazados a mano sobre zonas que GrabCut confunde: "include" se fuerza
    # como figura (cabezas, manos, el lirio) y "exclude" como fondo (cielo, muro).
    local_poly = lambda poly: [[q[0] - x0, q[1] - y0] for q in poly]
    forced_fg = np.zeros_like(roi)
    for poly in opts.get("include", []):
        forced_fg |= roi_mask(roi.shape, local_poly(poly), [])
    forced_bg = np.zeros_like(roi)
    for poly in opts.get("exclude", []):
        forced_bg |= roi_mask(roi.shape, local_poly(poly), [])
    mask[forced_fg > 0] = cv2.GC_FGD
    mask[forced_bg > 0] = cv2.GC_BGD

    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(crop, mask, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
    fg = np.isin(mask, (cv2.GC_FGD, cv2.GC_PR_FGD)).astype(np.uint8)
    # Limpieza: cerrar grietas finas y quedarse con la componente principal
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, k(3))
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, k(2))
    # Lo forzado se respeta también después de la limpieza morfológica.
    fg = np.where(forced_fg > 0, 1, np.where(forced_bg > 0, 0, fg)).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg)
    if n > 1:
        main = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        fg = (lab == main).astype(np.uint8)

    contours, hier = cv2.findContours(fg, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    hier = hier[0]
    outer = max((i for i in range(len(contours)) if hier[i][3] < 0), key=lambda i: cv2.contourArea(contours[i]))
    simp = lambda c: [[int(p[0][0]) + x0, int(p[0][1]) + y0] for p in cv2.approxPolyDP(c, EPS, True)]
    new_poly = simp(contours[outer])
    new_holes = [simp(contours[i]) for i in range(len(contours))
                 if hier[i][3] == outer and cv2.contourArea(contours[i]) > MIN_AREA]
    new_holes = [h for h in new_holes if len(h) >= 3]

    area_roi = roi.sum()
    area_fg = fg.sum()
    return new_poly, new_holes, fg, (x0, y0), area_fg / max(area_roi, 1)


def dump_scene(d):
    """Mismo formato compacto de siempre: cada polígono en una sola línea."""
    txt = json.dumps(d, indent=2, ensure_ascii=False)
    txt = re.sub(r"\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]", r"[\1, \2]", txt)
    txt = re.sub(r"\[\s+((?:\[-?[\d.]+, -?[\d.]+\],?\s*)+)\]",
                 lambda m: "[" + re.sub(r"\s+", " ", m.group(1)).strip() + "]", txt)
    txt = re.sub(r"\[\s+(\[\[.*?\]\](?:,\s*\[\[.*?\]\])*)\s+\]",
                 lambda m: "[" + re.sub(r"\]\],\s+\[\[", "]], [[", m.group(1)) + "]", txt, flags=re.S)
    SCENE.write_text(txt + "\n", encoding="utf-8")


def main():
    only = set(sys.argv[1:])
    scene = json.loads(SCENE.read_text(encoding="utf-8"))
    img = cv2.cvtColor(cv2.imread(str(ROOT / "analysis/source/crivelli_ng739.jpg")), cv2.COLOR_BGR2RGB)
    sheet = []
    for el in scene["elements"]:
        if el["kind"] != "figure" or (only and el["id"] not in only):
            continue
        # Una silueta corregida a mano en el marcador no se pisa (salvo que se pida por nombre).
        if el.get("silhouette") == "manual" and el["id"] not in only:
            print(f"{el['id']:16s} editada a mano: se conserva")
            continue
        if "roi" not in el:
            el["roi"] = el["polygon"]
            if el.get("holes"):
                el["roiHoles"] = el["holes"]
        poly, holes, fg, (x0, y0), ratio = segment(img, el)
        el["polygon"] = poly
        if holes:
            el["holes"] = holes
        else:
            el.pop("holes", None)
        el["silhouette"] = "grabcut"
        print(f"{el['id']:16s} {len(el['roi']):3d} -> {len(poly):4d} vértices, {len(holes)} huecos, "
              f"área {ratio * 100:5.1f}% del ROI")
        sheet.append((el, fg, (x0, y0)))
    dump_scene(scene)
    contact_sheet(img, sheet)


def contact_sheet(img, items):
    """Cada figura con su silueta: dentro a color, fuera atenuado; ROI en amarillo."""
    cells = []
    for el, fg, (x0, y0) in items:
        h, w = fg.shape
        crop = img[y0:y0 + h, x0:x0 + w].astype(np.float32)
        vis = crop * fg[..., None] + (crop * 0.25 + 40) * (1 - fg[..., None])
        im = Image.fromarray(vis.clip(0, 255).astype(np.uint8))
        d = ImageDraw.Draw(im)
        d.line([(p[0] - x0, p[1] - y0) for p in el["roi"] + el["roi"][:1]], fill=(255, 210, 0), width=2)
        im.thumbnail((260, 300))
        cells.append((el["id"], im))
    cols = 5
    rows = (len(cells) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 270, rows * 330), (245, 240, 230))
    d = ImageDraw.Draw(sheet)
    for i, (name, im) in enumerate(cells):
        x, y = (i % cols) * 270, (i // cols) * 330
        sheet.paste(im, (x + (270 - im.width) // 2, y + 5))
        d.text((x + 8, y + 310), name, fill=(20, 20, 20))
    sheet.save(ROOT / "docs/11_siluetas.jpg", quality=88)


if __name__ == "__main__":
    main()
