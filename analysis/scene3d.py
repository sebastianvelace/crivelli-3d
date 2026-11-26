"""
Geometría de la escena en Python: la misma matemática que src/core/pictureSpace.js.

Mundo (metros): ojo en E = (0, Hc, 0) mirando hacia -Z; piso y = 0; D = -z.
Rayo por el píxel (u, v):  d = ((u - cx)/f, -(v - cy)/f, -1).
Un plano es (normal n, constante c) con n · p = c; las normales son ejes.
"""

import numpy as np

AXES = {
    "horizontal": np.array([0.0, 1.0, 0.0]),
    "side": np.array([1.0, 0.0, 0.0]),
    "frontal": np.array([0.0, 0.0, 1.0]),
}
MAX_RAY_T = 160.0


class PictureSpace:
    def __init__(self, calib):
        self.W = calib["imageWidth"]
        self.H = calib["imageHeight"]
        self.cx, self.cy = calib["vanishingPoint"]
        self.f = calib["focalPx"]
        self.eye = np.array([0.0, calib["eyeHeightM"], 0.0])

    def rays(self, u, v):
        """Direcciones de los rayos para arreglos de píxeles (u, v); forma (..., 3)."""
        u, v = np.broadcast_arrays(np.asarray(u, float), np.asarray(v, float))
        return np.stack([(u - self.cx) / self.f, -(v - self.cy) / self.f, -np.ones_like(u)], axis=-1)

    def ray_t(self, u, v, plane):
        """Parámetro t del corte rayo-plano. Como d_z = -1, t es la profundidad D."""
        d = self.rays(u, v)
        denom = d @ plane["normal"]
        with np.errstate(divide="ignore", invalid="ignore"):
            t = (plane["c"] - plane["normal"] @ self.eye) / denom
        return np.where(np.abs(denom) < 1e-12, np.inf, t)

    def intersect(self, u, v, plane):
        t = self.ray_t(u, v, plane)
        t = np.minimum(np.where(t > 0, t, np.nan), MAX_RAY_T)
        return self.eye + self.rays(u, v) * t[..., None]

    def project(self, P):
        """Punto(s) 3D -> píxel(es) de la pintura."""
        Q = np.asarray(P, float) - self.eye
        D = -Q[..., 2]
        return self.cx + self.f * Q[..., 0] / D, self.cy - self.f * Q[..., 1] / D, D


def resolve_planes(space, elements):
    """Igual que resolvePlanes() en JS: resuelve los planos en orden, con anclas."""
    planes = {"ground": {"type": "horizontal", "normal": AXES["horizontal"], "c": 0.0}}
    for el in elements:
        spec = el["plane"]
        kind = spec["type"]
        if "anchor" in spec:
            ref = planes[spec["anchor"]["on"]]
            p = space.intersect(*spec["anchor"]["px"], ref)
            c = p[1] if kind == "horizontal" else p[0] if kind == "side" else p[2]
        elif "from" in spec:
            c = planes[spec["from"]]["c"]
        elif kind == "horizontal":
            c = spec.get("y", 0.0)
        elif kind == "side":
            c = spec["x"]
        else:
            c = -spec["depth"]
        off = spec.get("offset", 0.0)
        c = c - off if kind == "frontal" else c + off
        planes[el["id"]] = {"type": kind, "normal": AXES[kind], "c": float(c)}
    return planes


def to_local(kind, P):
    """Coordenadas 2D dentro del plano (mismo orden que to2D() en JS)."""
    P = np.asarray(P, float)
    if kind == "horizontal":
        return P[..., [0, 2]]
    if kind == "side":
        return P[..., [2, 1]]
    return P[..., [0, 1]]


def from_local(kind, c, a, b):
    """Inversa de to_local: (a, b) en el plano -> punto 3D."""
    a, b = np.broadcast_arrays(np.asarray(a, float), np.asarray(b, float))
    cc = np.full_like(a, c)
    if kind == "horizontal":
        return np.stack([a, cc, b], axis=-1)
    if kind == "side":
        return np.stack([cc, b, a], axis=-1)
    return np.stack([a, b, cc], axis=-1)


def lift(space, polygon, plane):
    pts = np.array(polygon, float)
    return space.intersect(pts[:, 0], pts[:, 1], plane)
