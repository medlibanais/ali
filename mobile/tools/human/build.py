#!/usr/bin/env python3
"""Builds assets/avatar3d/models/human.bin, the realistic human the 3D
avatar viewer shapes and dresses at run time.

Sources (all CC0, see README.md next to this file):
  --mh   a checkout of github.com/makehumancommunity/makehuman (data/ folder:
         base mesh, shape targets, skeleton and weights)
  --assets  one or more unpacked MakeHuman asset packs (skins, eyes, hair,
         clothes ...)

The file is one JSON header followed by raw buffers:
  u32 header length, header JSON (padded to 4 bytes), buffers.
Every array in the header is {"o": offset, "n": count, "t": type}.
"""
import argparse, json, os, re, struct, sys, io, glob
import numpy as np
from PIL import Image

from catalog import HAIR, CLOTHES, EYEBROWS, EYELASHES, SKINS, EYES, TEETH, TONGUE, TEX_SIZE, SKIP_TARGETS

SCALE = 0.1  # MakeHuman works in decimetres


class Bundle:
    def __init__(self):
        self.chunks, self.size = [], 0

    def add(self, arr, t):
        dt = {'f32': '<f4', 'u16': '<u2', 'u32': '<u4', 'i16': '<i2', 'u8': 'u1'}[t]
        raw = np.ascontiguousarray(arr, dtype=dt).tobytes()
        return self.raw(raw, t, len(raw) // np.dtype(dt).itemsize)

    def raw(self, raw, t, n):
        o = self.size
        pad = (-len(raw)) % 4
        self.chunks.append(raw + b'\0' * pad)
        self.size += len(raw) + pad
        return {'o': o, 'n': n, 't': t}

    def write(self, path, header):
        h = json.dumps(header, separators=(',', ':')).encode()
        h += b' ' * ((-len(h)) % 4)
        with open(path, 'wb') as f:
            f.write(struct.pack('<I', len(h)))
            f.write(h)
            for c in self.chunks:
                f.write(c)


def read_obj(path):
    """Positions, and per group the faces as (vertex, uv) index pairs."""
    v, vt, groups, cur = [], [], {}, None
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            p = line.split()
            if not p:
                continue
            if p[0] == 'v':
                v.append((float(p[1]), float(p[2]), float(p[3])))
            elif p[0] == 'vt':
                vt.append((float(p[1]), float(p[2])))
            elif p[0] == 'g':
                cur = groups.setdefault(p[1] if len(p) > 1 else 'default', [])
            elif p[0] == 'f':
                if cur is None:
                    cur = groups.setdefault('default', [])
                face = []
                for c in p[1:]:
                    s = c.split('/')
                    face.append((int(s[0]) - 1, int(s[1]) - 1 if len(s) > 1 and s[1] else -1))
                cur.append(face)
    return np.array(v, dtype=np.float64), np.array(vt, dtype=np.float64) if vt else np.zeros((0, 2)), groups


def split_mesh(faces, vt):
    """Triangles over render vertices: one per distinct (vertex, uv) pair."""
    index, src, uv, tris = {}, [], [], []

    def rv(pair):
        i = index.get(pair)
        if i is None:
            i = index[pair] = len(src)
            src.append(pair[0])
            uv.append(vt[pair[1]] if pair[1] >= 0 else (0.0, 0.0))
        return i

    for face in faces:
        ids = [rv(p) for p in face]
        for k in range(1, len(ids) - 1):
            tris.append((ids[0], ids[k], ids[k + 1]))
    uv = np.array(uv, dtype=np.float64).reshape(-1, 2)
    uv[:, 1] = 1.0 - uv[:, 1]  # image rows start at the top
    return np.array(src), uv, np.array(tris)


def read_target(path):
    idx, d = [], []
    with open(path) as f:
        for line in f:
            if line.startswith('#'):
                continue
            p = line.split()
            if len(p) == 4:
                idx.append(int(p[0]))
                d.append((float(p[1]), float(p[2]), float(p[3])))
    return np.array(idx, dtype=np.int64), np.array(d, dtype=np.float64).reshape(-1, 3)


def collect_targets(root):
    """name -> (indices, deltas). Left/right pairs are merged into one."""
    out = {}
    keep_macro = re.compile(r'-young[-.]')
    for path in sorted(glob.glob(os.path.join(root, '**', '*.target'), recursive=True)):
        rel = os.path.relpath(path, root).replace(os.sep, '/')
        top = rel.split('/')[0]
        name = os.path.basename(rel)[:-7]
        if top in ('asym', 'genitals', 'measure'):
            continue
        if top in ('macrodetails', 'breast') and not keep_macro.search(os.path.basename(rel)):
            continue
        if top == 'expression':
            if '/caucasian/' not in rel:
                continue
            name = 'expr-' + name
        idx, d = read_target(path)
        if not len(idx):
            continue
        m = re.match(r'^[lr]-(.*)$', name)
        if m and top != 'expression':
            name = m.group(1)
        if SKIP_TARGETS.search(name):
            continue
        if name in out:
            dense = {}
            for i, dd in zip(*out[name]):
                dense[int(i)] = dd
            for i, dd in zip(idx, d):
                dense[int(i)] = dense.get(int(i), 0) + dd
            keys = sorted(dense)
            out[name] = (np.array(keys), np.array([dense[k] for k in keys]))
        else:
            out[name] = (idx, d)
    return out


def read_mhclo(path):
    info = {'verts': [], 'delete': [], 'scale': {}, 'dir': os.path.dirname(path)}
    mode = None
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            p = line.split()
            if not p or p[0].startswith('#'):
                continue
            if p[0] == 'verts':
                mode = 'verts'
                continue
            if p[0] == 'delete_verts':
                mode = 'delete'
                continue
            if p[0] in ('weights', 'delete_group'):
                mode = None
                continue
            if mode == 'verts' and re.match(r'^-?\d', p[0]):
                if len(p) == 1:
                    i = int(p[0])
                    info['verts'].append((i, i, i, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0))
                else:
                    info['verts'].append((int(p[0]), int(p[1]), int(p[2])) + tuple(float(x) for x in p[3:9]))
                continue
            if mode == 'delete' and re.match(r'^[\d-]', p[0]):
                i = 0
                while i < len(p):
                    if i + 2 < len(p) and p[i + 1] == '-':
                        info['delete'].extend(range(int(p[i]), int(p[i + 2]) + 1))
                        i += 3
                    else:
                        info['delete'].append(int(p[i]))
                        i += 1
                continue
            if p[0] in ('x_scale', 'y_scale', 'z_scale'):
                info['scale'][p[0][0]] = (int(p[1]), int(p[2]), float(p[3]))
            elif p[0] in ('obj_file', 'material', 'name'):
                info[p[0]] = ' '.join(p[1:])
            elif p[0] == 'z_depth':
                info['z_depth'] = int(p[1])
    return info


def read_mhmat(path):
    m = {'dir': os.path.dirname(path)}
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            p = line.split()
            if len(p) < 2 or p[0].startswith('#') or p[0].startswith('//'):
                continue
            if p[0] in ('diffuseTexture', 'normalmapTexture', 'specularmapTexture'):
                m[p[0]] = ' '.join(p[1:])
            elif p[0] in ('diffuseColor', 'specularColor'):
                m[p[0]] = [float(x) for x in p[1:4]]
            elif p[0] in ('transparent', 'backfaceCull', 'alphaToCoverage'):
                m[p[0]] = p[1].lower() in ('true', '1')
            elif p[0] in ('shininess', 'opacity'):
                m[p[0]] = float(p[1])
    return m


class Textures:
    def __init__(self, bundle):
        self.b, self.seen, self.list = bundle, {}, []

    def add(self, path, size, gray=False):
        key = (os.path.abspath(path), size, gray)
        if key in self.seen:
            return self.seen[key]
        im = Image.open(path)
        alpha = im.mode in ('RGBA', 'LA', 'PA') or (im.mode == 'P' and 'transparency' in im.info)
        im = im.convert('RGBA' if alpha else 'RGB')
        if alpha:
            a = np.asarray(im)[:, :, 3]
            if a.min() > 250:
                alpha, im = False, im.convert('RGB')
        if max(im.size) > size:
            r = size / max(im.size)
            im = im.resize((max(1, round(im.size[0] * r)), max(1, round(im.size[1] * r))), Image.LANCZOS)
        if gray:
            # Keep only light and dark, so the app can tint it any colour.
            arr = np.asarray(im).astype(np.float64)
            lum = arr[:, :, 0] * 0.3 + arr[:, :, 1] * 0.59 + arr[:, :, 2] * 0.11
            solid = arr[:, :, 3] > 40 if alpha else np.ones(lum.shape, bool)
            ref = np.percentile(lum[solid], 92) if solid.any() else 255.0
            lum = np.clip(lum / max(ref, 1.0) * 235.0, 0, 255)
            arr[:, :, 0] = arr[:, :, 1] = arr[:, :, 2] = lum
            im = Image.fromarray(arr.astype(np.uint8), 'RGBA' if alpha else 'RGB')
        buf = io.BytesIO()
        if alpha:
            im.save(buf, 'WEBP', quality=86, method=6)
            mime = 'image/webp'
        else:
            im.save(buf, 'JPEG', quality=86, optimize=True)
            mime = 'image/jpeg'
        raw = buf.getvalue()
        view = self.b.raw(raw, 'u8', len(raw))
        view.update({'mime': mime, 'alpha': bool(alpha), 'w': im.size[0], 'h': im.size[1]})
        self.list.append(view)
        self.seen[key] = len(self.list) - 1
        return self.seen[key]


def find(roots, *parts):
    for r in roots:
        hits = glob.glob(os.path.join(r, '**', *parts), recursive=True)
        if hits:
            return sorted(hits)[0]
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mh', required=True)
    ap.add_argument('--assets', nargs='+', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    data = os.path.join(a.mh, 'makehuman', 'data')
    b = Bundle()
    tex = Textures(b)

    # ---- base body
    v, vt, groups = read_obj(os.path.join(data, '3dobjs', 'base.obj'))
    nv = len(v)
    src, uv, tris = split_mesh(groups['body'], vt)
    header = {
        'version': 1,
        'scale': SCALE,
        'nVerts': nv,
        'base': {
            'pos': b.add(v, 'f32'),
            'src': b.add(src, 'u16'),
            'uv': b.add(uv, 'f32'),
            'tris': b.add(tris, 'u16' if len(src) < 65536 else 'u32'),
        },
    }

    # ---- skeleton
    sk = json.load(open(os.path.join(data, 'rigs', 'default.mhskel')))
    wt = json.load(open(os.path.join(data, 'rigs', 'default_weights.mhw')))['weights']
    names = []

    def visit(name):
        if name in names:
            return
        parent = sk['bones'][name]['parent']
        if parent:
            visit(parent)
        names.append(name)

    for n in sorted(sk['bones']):
        visit(n)
    joints, jflat, joff = {}, [], []
    for n in names:
        for end in ('head', 'tail'):
            ids = sk['joints'][sk['bones'][n][end]]
            joff.append((len(jflat), len(ids)))
            jflat.extend(ids)
    W = np.zeros((nv, len(names)))
    for bone, pairs in wt.items():
        if bone in names:
            bi = names.index(bone)
            for i, w in pairs:
                W[int(i), bi] += float(w)
    top = np.argsort(-W, axis=1)[:, :4]
    topw = np.take_along_axis(W, top, axis=1)
    s = topw.sum(axis=1, keepdims=True)
    topw = np.where(s > 0, topw / np.where(s > 0, s, 1), 0)
    header['skeleton'] = {
        'bones': names,
        'parents': [names.index(sk['bones'][n]['parent']) if sk['bones'][n]['parent'] else -1 for n in names],
        'jointVerts': b.add(jflat, 'u16'),
        'jointRanges': b.add(np.array(joff).reshape(-1), 'u16'),
        'skinIndex': b.add(top, 'u8'),
        'skinWeight': b.add(np.round(topw * 255), 'u8'),
    }

    # ---- shape targets
    targets = collect_targets(os.path.join(data, 'targets'))
    theader = {}
    for name, (idx, d) in sorted(targets.items()):
        peak = float(np.abs(d).max()) or 1.0
        q = np.round(d / peak * 32767)
        keep = np.abs(q).max(axis=1) > 0
        theader[name] = {'i': b.add(idx[keep], 'u16'), 'd': b.add(q[keep], 'i16'), 's': peak / 32767}
    header['targets'] = theader

    # ---- fitted meshes: eyes, hair, clothes ...
    def bone_weights(binding):
        bw = np.zeros((len(binding), len(names)))
        for k in range(3):
            bw += W[binding[:, k].astype(int)] * binding[:, 3 + k][:, None]
        t = np.argsort(-bw, axis=1)[:, :4]
        tw = np.take_along_axis(bw, t, axis=1)
        ss = tw.sum(axis=1, keepdims=True)
        return t, np.where(ss > 0, tw / np.where(ss > 0, ss, 1), 0)

    proxies = {}

    def add_proxy(pid, spec):
        clo_path = find(a.assets, spec['dir'], '*.mhclo')
        if not clo_path:
            print('  missing', pid, spec['dir'])
            return
        clo = read_mhclo(clo_path)
        pv, pvt, pg = read_obj(os.path.join(clo['dir'], clo['obj_file']))
        faces = [f for g in pg.values() for f in g]
        psrc, puv, ptris = split_mesh(faces, pvt)
        binding = np.array(clo['verts'], dtype=np.float64)
        if len(binding) != len(pv):
            print('  bad binding', pid, len(binding), len(pv))
            return
        bi, bw = bone_weights(binding)
        mat = read_mhmat(os.path.join(clo['dir'], spec.get('material') or clo.get('material', '')))
        entry = {
            'kind': spec['kind'],
            'n': len(pv),
            'bind': b.add(binding[:, :3], 'u16'),
            'bindW': b.add(binding[:, 3:6], 'f32'),
            'bindO': b.add(binding[:, 6:9], 'f32'),
            'scale': clo['scale'],
            'src': b.add(psrc, 'u16'),
            'uv': b.add(puv, 'f32'),
            'tris': b.add(ptris, 'u16' if len(psrc) < 65536 else 'u32'),
            'skinIndex': b.add(bi, 'u8'),
            'skinWeight': b.add(np.round(bw * 255), 'u8'),
            'color': mat.get('diffuseColor', [1, 1, 1]),
            'transparent': bool(mat.get('transparent', False)),
            'depth': clo.get('z_depth', 50),
        }
        if 'diffuseTexture' in mat:
            tp = os.path.join(mat['dir'], mat['diffuseTexture'])
            if os.path.exists(tp):
                entry['map'] = tex.add(tp, spec.get('size', TEX_SIZE[spec['kind']]), gray=spec.get('gray', False))
        if 'normalmapTexture' in mat and spec.get('normal'):
            tp = os.path.join(mat['dir'], mat['normalmapTexture'])
            if os.path.exists(tp):
                entry['normalMap'] = tex.add(tp, spec.get('size', TEX_SIZE[spec['kind']]))
        if clo['delete']:
            mask = np.zeros(nv, dtype=np.uint8)
            mask[[i for i in clo['delete'] if i < nv]] = 1
            entry['hide'] = b.add(np.packbits(mask, bitorder='little'), 'u8')
        for k in ('label', 'slot', 'tint', 'for'):
            if k in spec:
                entry[k] = spec[k]
        proxies[pid] = entry
        print('  +', pid, len(pv), 'verts')

    for group in (EYES, TEETH, TONGUE, EYELASHES, EYEBROWS, HAIR, CLOTHES):
        for pid, spec in group.items():
            add_proxy(pid, spec)
    header['proxies'] = proxies

    # ---- skins
    skins = {}
    for sid, spec in SKINS.items():
        mp = find(a.assets, spec['dir'], '*.mhmat')
        if not mp:
            print('  missing skin', sid)
            continue
        mat = read_mhmat(mp)
        tp = os.path.join(mat['dir'], mat['diffuseTexture'])
        # The skin's own tone: the typical colour of its lit pixels.
        small = np.asarray(Image.open(tp).convert('RGB').resize((128, 128))).reshape(-1, 3).astype(np.float64)
        lit = small[small.sum(axis=1) > 240]
        tone = [round(float(x) / 255, 4) for x in np.median(lit, axis=0)]
        skins[sid] = {'map': tex.add(tp, TEX_SIZE['skin']), 'for': spec['for'], 'tone': tone}
        print('  + skin', sid)
    header['skins'] = skins
    header['textures'] = tex.list
    b.write(a.out, header)
    print('wrote', a.out, round(os.path.getsize(a.out) / 1e6, 1), 'MB;', len(theader), 'targets,', len(proxies), 'meshes,', len(tex.list), 'textures')


if __name__ == '__main__':
    main()
