"""
Modo inferido: hornea, para cada elemento de la escena, una textura plana que
completa lo que Crivelli NO pintó (lo tapado por otros elementos o fuera del cuadro).

Pasos:
  1. Asigna cada píxel pintado a una sola superficie. Las oclusiones explícitas
     preceden al orden por profundidad de los planos.
  2. Para cada elemento, una textura en las coordenadas de SU plano. Cada texel se
     lleva a 3D, se proyecta a la pintura y se marca como "visto" si ningún otro
     elemento lo tapaba desde el ojo.
  3. Lo no visto se rellena con una regla, si la hay, o con inpainting:
       - 'neighbor': color suavizado del texel visible más cercano.
       - 'tiles':   repetir la baldosa real rectificada con su tamaño medido.
                    Se probó en el piso y se descartó: el tono de la baldosa
                    repetida no coincide con el piso pintado y se ve el borde.
       - 'inpaint': todo lo demás. Inpainting por mapas de desplazamiento
                    (OpenCV xphoto, shift-map), que copia textura vecina.

Salidas:
  public/textures/<id>.jpg     textura plana completa (vista + inferida)
  public/data/textures.json    límites de cada textura en el plano y estadísticas
  public/data/proyeccion.png   identificador de la única superficie por píxel
  docs/07_mascaras_de_evidencia.jpg  qué fracción de cada elemento vio el pintor

Uso:  python analysis/infer.py   (requiere numpy, Pillow y opencv-contrib-python-headless)
"""

import json
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

from scene3d import PictureSpace, from_local, lift, resolve_planes, to_local

ROOT = Path(__file__).resolve().parent.parent
PPM = 220            # texels por metro en las texturas planas
MAX_SIDE = 2048      # tamaño máximo de una textura
WORK_W = 2048         # ancho del mapa de asignación de píxeles


def polygon_mask(shape, polygon, holes, transform):
    """Rasteriza un polígono con huecos. transform lleva puntos a píxeles de la máscara."""
    img = Image.new("L", (shape[1], shape[0]), 0)
    dr = ImageDraw.Draw(img)
    dr.polygon([tuple(transform(p)) for p in polygon], fill=1)
    for h in holes:
        dr.polygon([tuple(transform(p)) for p in h], fill=0)
    return np.asarray(img, dtype=bool)


def bilinear(img, u, v):
    """Muestreo bilineal de img (H, W, 3) en coordenadas de píxel flotantes."""
    h, w = img.shape[:2]
    u = np.clip(u, 0, w - 1.001)
    v = np.clip(v, 0, h - 1.001)
    u0, v0 = np.floor(u).astype(int), np.floor(v).astype(int)
    du, dv = (u - u0)[..., None], (v - v0)[..., None]
    return (img[v0, u0] * (1 - du) * (1 - dv) + img[v0, u0 + 1] * du * (1 - dv)
            + img[v0 + 1, u0] * (1 - du) * dv + img[v0 + 1, u0 + 1] * du * dv)


def projection_owners(space, elements, planes):
    """Asigna un único identificador por píxel. El 255 se reserva al respaldo."""
    k = WORK_W / space.W
    h, w = round(space.H * k), WORK_W
    us = (np.arange(w) + 0.5) / k
    vs = (np.arange(h) + 0.5) / k
    depth = np.full((h, w), np.inf, dtype=np.float32)
    priority = np.full((h, w), -1, dtype=np.int16)
    owners = np.zeros((h, w), dtype=np.uint8)
    transform = lambda p: (p[0] * k - .5, p[1] * k - .5)
    if len(elements) > 254:
        raise ValueError('El mapa de proyección admite hasta 254 superficies reconstruidas.')
    for owner, el in enumerate(elements, 1):
        if el.get('evidence') == 'inferred':
            continue
        mask = polygon_mask((h, w), el['polygon'], el.get('holes', []), transform).copy()
        for part in el.get('projectionParts', []):
            mask |= polygon_mask((h, w), part['polygon'], part.get('holes', []), transform)
        rows, cols = np.nonzero(mask)
        distance = space.ray_t(us[cols], vs[rows], planes[el['id']])
        level = el.get('projectionPriority', 0)
        old = priority[rows, cols]
        closer = distance < depth[rows, cols] - 1e-5
        first = (distance > 0) & np.isfinite(distance) & ((level > old) | ((level == old) & closer))
        rows, cols = rows[first], cols[first]
        depth[rows, cols] = distance[first]
        priority[rows, cols] = level
        owners[rows, cols] = owner
    owners[owners == 0] = 255
    return owners, k


def tile_sampler(space, calib, painting):
    """Regla de las baldosas: el piso oculto se completa repitiendo baldosas REALES.

    Se rectifica una baldosa limpia (sin figuras ni sombras encima): columna 0 de la
    fila 0, contando desde la junta medida en u = 35 px del borde frontal. Se usa
    solo su interior y, en cada celda de la cuadrícula, una de las 8 simetrías del
    cuadrado (el mármol no tiene orientación preferida),
    para que la repetición no se note. Las juntas se dibujan por regla con su
    ancho y color medidos.
    """
    s = calib["tileSizeM"]
    D0 = calib["floorFrontDepthM"]
    X0 = (35 - space.cx) * D0 / space.f  # junta medida a u = 35 px en el borde frontal
    n, inset = 256, 0.05
    samples = []
    for col, row in ((0, 0),):
        g = inset + (1 - 2 * inset) * (np.arange(n) + 0.5) / n
        a = X0 + s * (col + g)
        d = D0 + s * (row + 1 - g)  # fila 0 de la imagen = lado lejano
        A, Dm = np.meshgrid(a, d)
        samples.append(bilinear(painting, space.cx + space.f * A / Dm, space.cy + space.f * space.eye[1] / Dm))
    seam_color = np.array([92.0, 70.0, 52.0])
    seam_w = 0.012  # en unidades de baldosa (≈ 4 mm)

    def sample(X, D):
        gx, gz = (X - X0) / s, (D - D0) / s
        ix, iz = np.floor(gx).astype(int), np.floor(gz).astype(int)
        fx, fz = gx - ix, gz - iz
        hsh = (ix * 73856093) ^ (iz * 19349663)
        which = np.abs(hsh) % len(samples)
        sym = (np.abs(hsh) // 7) % 8
        # Simetrías del cuadrado: intercambiar ejes y/o reflejarlos
        p, q = np.where(sym & 1, fz, fx), np.where(sym & 1, fx, fz)
        p = np.where(sym & 2, 1 - p, p)
        q = np.where(sym & 4, 1 - q, q)
        out = np.zeros(X.shape + (3,), np.float32)
        for i, t in enumerate(samples):
            m = which == i
            out[m] = bilinear(t, p[m] * (n - 1), (1 - q[m]) * (n - 1))
        seam = (np.minimum(fx, 1 - fx) < seam_w / 2) | (np.minimum(fz, 1 - fz) < seam_w / 2)
        out[seam] = seam_color
        return out

    return sample


def inpaint(color, known, max_side=360, fade_px=40):
    """Rellena lo desconocido con FSR (Frequency Selective Reconstruction, OpenCV
    xphoto), que reconstruye textura y no solo color. Es costoso, así que trabaja
    a resolución reducida: lo visto se conserva a resolución completa y solo lo
    inferido sale de la versión pequeña. Si FSR falla, se usa Telea."""
    h, w = known.shape
    scale = min(1.0, max_side / max(w, h))
    sw, sh = max(8, round(w * scale)), max(8, round(h * scale))
    src = cv2.resize(color.clip(0, 255).astype(np.uint8), (sw, sh), interpolation=cv2.INTER_AREA)
    mask = cv2.resize(known.astype(np.uint8) * 255, (sw, sh), interpolation=cv2.INTER_NEAREST)
    try:
        dst = np.zeros_like(src)
        cv2.xphoto.inpaint(src, mask, dst, cv2.xphoto.INPAINT_FSR_FAST)
    except cv2.error:
        dst = cv2.inpaint(src, 255 - mask, 7, cv2.INPAINT_TELEA)
    # Lejos de los datos el inpainting solo estira vetas: a partir de ~fade_px
    # texels (a escala reducida) se funde con el color medio de lo visto.
    dist = cv2.distanceTransform((mask == 0).astype(np.uint8), cv2.DIST_L2, 5)
    weight = np.clip(1 - dist / fade_px, 0, 1)[..., None]
    mean = np.median(src[mask > 0], axis=0) if (mask > 0).any() else np.array([201, 187, 162])
    dst = dst * weight + mean * (1 - weight)
    filled = cv2.resize(dst.astype(np.float32), (w, h), interpolation=cv2.INTER_CUBIC)
    return filled[~known]


def neighbor_fill(color, known):
    """Propaga el color local y suaviza sus bordes sin cambiar los texeles vistos."""
    distance, labels = cv2.distanceTransformWithLabels((~known).astype(np.uint8), cv2.DIST_L2, 5,
                                                       labelType=cv2.DIST_LABEL_PIXEL)
    values = np.zeros((int(labels.max()) + 1, 3), dtype=np.float32)
    values[labels[known]] = color[known]
    local = cv2.GaussianBlur(values[labels], (0, 0), 4)[~known]
    coarse = cv2.GaussianBlur(values[labels], (0, 0), 16)[~known]
    weight = np.exp(-distance[~known, None] / 14)
    average = np.median(color[known], axis=0)
    return local * weight + (coarse * .28 + average * .72) * (1 - weight)


def vertical_fill(color, known):
    """Continúa las jambas y listones verticales al pasar detrás de un recorte."""
    filled = color.copy()
    filled[~known] = neighbor_fill(color, known)
    for col in range(color.shape[1]):
        rows = np.flatnonzero(known[:, col])
        missing = np.flatnonzero(~known[:, col])
        if len(rows) < 3 or not len(missing):
            continue
        for channel in range(3):
            filled[missing, col, channel] = np.interp(missing, rows, color[rows, col, channel])
    return filled[~known]


def bake_element(space, el, plane, painting, owners, k, owner, tiles, palettes):
    kind = plane["type"]
    P3 = lift(space, el.get('modelPolygon', el['polygon']), plane)
    loc = to_local(kind, P3)
    holes = [] if 'modelPolygon' in el else [to_local(kind, lift(space, h, plane)) for h in el.get('holes', [])]
    amin, bmin = loc.min(axis=0)
    amax, bmax = loc.max(axis=0)
    limit = 384 if el.get('evidence') == 'inferred' else MAX_SIDE
    w = int(np.clip((amax - amin) * PPM, 32, limit))
    h = int(np.clip((bmax - bmin) * PPM, 32, limit))

    # Centros de texel -> coordenadas del plano. La fila 0 corresponde a b = bmax
    # (igual que una textura de three.js con flipY: uv.y = 1 arriba).
    a = amin + (np.arange(w) + 0.5) / w * (amax - amin)
    b = bmax - (np.arange(h) + 0.5) / h * (bmax - bmin)
    A, B = np.meshgrid(a, b)
    P = from_local(kind, plane["c"], A, B)
    u, v, D = space.project(P)

    to_tex = lambda p: ((p[0] - amin) / (amax - amin) * w, (bmax - p[1]) / (bmax - bmin) * h)
    inside = polygon_mask((h, w), loc, holes, to_tex)

    in_img = (D > 0) & (u >= 0) & (u < space.W) & (v >= 0) & (v < space.H)
    ui = np.clip((u * k).astype(int), 0, owners.shape[1] - 1)
    vi = np.clip((v * k).astype(int), 0, owners.shape[0] - 1)
    known = inside & in_img & (owners[vi, ui] == owner)

    color = np.zeros((h, w, 3), np.float32)
    color[known] = bilinear(painting, u[known], v[known])

    frac = float(known.sum() / max(inside.sum(), 1))
    method = el.get("fill", "inpaint")
    if method == "tiles":
        X = P[..., 0]
        fill = tiles(X, D)
        color[~known] = fill[~known]
    elif known.sum() > 50 and method == 'inpaint' and el['kind'] == 'figure':
        color[~known] = inpaint(color, known)
    elif known.any() and method == 'vertical':
        color[~known] = vertical_fill(color, known)
    elif known.any():
        color[~known] = neighbor_fill(color, known)
        method = 'neighbor'
    elif el.get('fillFrom') in palettes:
        palette, bounds, donor_type = palettes[el['fillFrom']]
        if donor_type == kind:
            a0, b0, a1, b1 = bounds
            map_a = ((A - a0) * (palette.shape[1] - 1) / (a1 - a0)).astype(np.float32)
            map_b = ((b1 - B) * (palette.shape[0] - 1) / (b1 - b0)).astype(np.float32)
            adjacent = cv2.remap(palette, map_a, map_b, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        else:
            adjacent = cv2.resize(palette, (w, h))
        color[:] = palette.mean(axis=(0, 1)) * .46 + adjacent * .54
        method = 'neighbor'
    else:
        color[:] = np.mean(painting[405:530, 470:715], axis=(0, 1))
        method = 'neighbor'

    back = color[known].mean(axis=0) if known.any() else color.mean(axis=(0, 1))
    return color, known, inside, {
        "bounds": [float(amin), float(bmin), float(amax), float(bmax)],
        "size": [w, h],
        "seenFraction": round(frac, 3),
        "method": method,
        "owner": owner,
        "meanColor": "#%02x%02x%02x" % tuple(int(x) for x in back.clip(0, 255)),
        "backColor": "#%02x%02x%02x" % tuple(int(x) for x in back * .83),
    }


def main():
    calib = json.loads((ROOT / "public/data/calibration.json").read_text(encoding="utf-8"))
    scene = json.loads((ROOT / "public/data/scene.json").read_text(encoding="utf-8"))
    painting = np.asarray(Image.open(ROOT / "analysis/source/crivelli_ng739.jpg").convert("RGB"), np.float32)

    space = PictureSpace(calib)
    elements = scene["elements"]
    planes = resolve_planes(space, elements)
    owners, k = projection_owners(space, elements, planes)
    tiles = tile_sampler(space, calib, painting)

    out_dir = ROOT / "public/textures"
    out_dir.mkdir(parents=True, exist_ok=True)
    meta, thumbs, palettes = {}, [], {}
    for owner, el in enumerate(elements, 1):
        t0 = time.time()
        color, known, inside, info = bake_element(space, el, planes[el["id"]], painting,
                                                  owners, k, owner, tiles, palettes)
        palettes[el['id']] = (cv2.resize(color, (32, 32), interpolation=cv2.INTER_AREA),
                              info['bounds'], planes[el['id']]['type'])
        img = Image.fromarray(color.clip(0, 255).astype(np.uint8))
        img.save(out_dir / f"{el['id']}.jpg", quality=86)
        info["file"] = f"textures/{el['id']}.jpg"
        meta[el["id"]] = info
        thumbs.append((el, color, known, inside, info))
        print(f"{el['id']:18s} {info['size'][0]:5d}x{info['size'][1]:<5d} visto {info['seenFraction'] * 100:5.1f}%  "
              f"{info['method']:8s} {time.time() - t0:5.1f}s")

    (ROOT / "public/data/textures.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False), encoding="utf-8")
    Image.fromarray(owners).save(ROOT / 'public/data/proyeccion.png', optimize=True)
    evidence_sheet(thumbs)


def evidence_sheet(thumbs):
    """Lámina para la presentación: cada textura con lo inferido en rosa translúcido."""
    cell, cols = 220, 6
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * (cell + 30)), (245, 240, 230))
    dr = ImageDraw.Draw(sheet)
    for i, (el, color, known, inside, info) in enumerate(thumbs):
        vis = color.copy()
        unk = inside & ~known
        vis[unk] = vis[unk] * 0.45 + np.array([230, 90, 150]) * 0.55
        vis[~inside] = (245, 240, 230)
        im = Image.fromarray(vis.clip(0, 255).astype(np.uint8))
        im.thumbnail((cell - 10, cell - 10))
        x, y = (i % cols) * cell, (i // cols) * (cell + 30)
        sheet.paste(im, (x + (cell - im.width) // 2, y + 5))
        tag = {'assumed': 'supuesto', 'inferred': 'inferido', 'measured': 'medido'}[el['evidence']]
        dr.text((x + 6, y + cell + 2), f"{el['id']} · {info['seenFraction'] * 100:.0f}% visto · {tag}", fill=(20, 20, 20))
    sheet.save(ROOT / "docs/07_mascaras_de_evidencia.jpg", quality=88)


if __name__ == "__main__":
    main()
