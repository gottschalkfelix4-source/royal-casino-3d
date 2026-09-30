#!/usr/bin/env python3
"""Build clothed, skinned glTF models from CC0 MakeHuman data, without Blender.

Usage: python3 scripts/characters/build.py /path/to/source
Source layout and download provenance are documented alongside the runtime assets.
Requires numpy and Pillow. Only data assets are consumed; no MakeHuman application code.
"""
import json, math, pathlib, re, shutil, struct, sys, hashlib
import numpy as np
from PIL import Image

SOURCE = pathlib.Path(sys.argv[1])
DEST = pathlib.Path(__file__).resolve().parents[2] / 'public/assets/characters'
MH = SOURCE / 'makehuman/data'
ASSETS = SOURCE / 'system'
DEST.mkdir(parents=True, exist_ok=True)


def obj(path):
    positions, uv, faces = [], [], []
    group = ''
    for line in path.read_text().splitlines():
        words = line.split()
        if not words: continue
        if words[0] == 'v': positions.append(list(map(float, words[1:4])))
        elif words[0] == 'vt': uv.append(list(map(float, words[1:3])))
        elif words[0] == 'g': group = words[1]
        elif words[0] == 'f':
            corners = [tuple(int(x) - 1 for x in w.split('/')[:2]) for w in words[1:]]
            for i in range(1, len(corners) - 1): faces.append((group, [corners[0], corners[i], corners[i+1]]))
    return np.array(positions), np.array(uv), faces


BASE, BASE_UV, BASE_FACES = obj(MH / '3dobjs/base.obj')
RIG = json.loads((MH / 'rigs/default.mhskel').read_text())
WEIGHTS = json.loads((MH / 'rigs/default_weights.mhw').read_text())['weights']
# Keep the body and finger rig. Facial weights are combined onto the head; eyelids use a morph.
KEEP = {'root', 'head', 'jaw'} | {n for n in RIG['bones'] if n.startswith(('spine', 'neck', 'pelvis', 'clavicle', 'shoulder', 'upperarm', 'lowerarm', 'wrist', 'upperleg', 'lowerleg', 'foot', 'toe', 'finger', 'metacarpal'))}
BONES = []
def visit(name):
    BONES.append(name)
    for child, data in RIG['bones'].items():
        if child in KEEP and data['parent'] == name: visit(child)
visit('root')
assert set(BONES) == KEEP
BONE_INDEX = {n: i for i, n in enumerate(BONES)}
BASE_WEIGHTS = np.zeros((len(BASE), len(BONES)))
for name, values in WEIGHTS.items():
    while name not in KEEP: name = RIG['bones'][name]['parent']
    for index, weight in values: BASE_WEIGHTS[index, BONE_INDEX[name]] += weight


def target(name):
    lines = [l for l in (MH / ('targets/' + name + '.target')).read_text().splitlines() if l.strip() and not l.lstrip().startswith('#')]
    result = np.zeros_like(BASE)
    if not lines: return result
    rows = np.loadtxt(lines, ndmin=2)
    result[rows[:, 0].astype(int)] = rows[:, 1:4]
    return result


def clothing(folder, base):
    path = ASSETS / folder
    file = next(path.glob('*.mhclo'))
    lines = [l.split('#', 1)[0].strip() for l in file.read_text().splitlines()]
    mapping, offsets, weights, delete = [], [], [], set()
    scales = np.ones(3); section = None
    for line in lines:
        words = line.split()
        if not words: continue
        key = words[0]
        if key in ['x_scale', 'y_scale', 'z_scale']:
            axis = 'xyz'.index(key[0]); a, b = map(int, words[1:3])
            scales[axis] = abs(base[a, axis] - base[b, axis]) / float(words[3])
        elif key == 'obj_file': model_path = path / words[1]
        elif key == 'verts': section = 'verts'
        elif key == 'delete_verts': section = 'delete'
        elif key[0].isdigit() and section == 'verts':
            if len(words) == 1:
                mapping.append([int(key)] * 3); weights.append([1, 0, 0]); offsets.append([0, 0, 0])
            else:
                mapping.append(list(map(int, words[:3]))); weights.append(list(map(float, words[3:6]))); offsets.append(list(map(float, words[6:9])))
        elif section == 'delete':
            for match in re.finditer(r'(\d+)\s*-\s*(\d+)|(\d+)', line):
                if match[3]: delete.add(int(match[3]))
                else: delete.update(range(int(match[1]), int(match[2])+1))
    indices, bary = np.array(mapping), np.array(weights)
    positions = (base[indices] * bary[:, :, None]).sum(1) + np.array(offsets) * scales
    skin = np.maximum(0, (BASE_WEIGHTS[indices] * bary[:, :, None]).sum(1))
    original, uv, faces = obj(model_path)
    assert len(original) == len(positions), folder
    return positions, uv, faces, skin, delete


class GLB:
    def __init__(self):
        self.data = bytearray()
        self.doc = {'asset': {'version': '2.0', 'generator': 'Royal Casino CC0 character builder'}, 'scene': 0,
                    'scenes': [{'nodes': [0]}], 'nodes': [{'name': 'Human', 'children': []}],
                    'meshes': [], 'skins': [], 'accessors': [], 'bufferViews': [], 'materials': [],
                    'images': [], 'textures': [], 'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]}
    def accessor(self, values, kind, component=5126, bounds=False):
        array = np.asarray(values, dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[component])
        while len(self.data) % 4: self.data.append(0)
        view = len(self.doc['bufferViews'])
        self.doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(self.data), 'byteLength': array.nbytes})
        self.data.extend(array.tobytes())
        entry = {'bufferView': view, 'componentType': component, 'count': len(array), 'type': kind}
        if bounds: entry.update(min=array.min(0).tolist(), max=array.max(0).tolist())
        self.doc['accessors'].append(entry)
        return len(self.doc['accessors']) - 1
    def material(self, name, texture, roughness, alpha=False, normal=None):
        def image(src):
            file = ASSETS / src; destination = DEST / (file.stem + '.webp')
            if not destination.exists():
                with Image.open(file) as image:
                    limit = 2048 if name == 'Skin' else 512 if name in ['Eyes','Brows'] else 1024
                    image.thumbnail((limit, limit), Image.Resampling.LANCZOS)
                    image.save(destination, 'WEBP', quality=94, method=6)
            self.doc['images'].append({'uri': destination.name})
            self.doc['textures'].append({'sampler': 0, 'source': len(self.doc['images'])-1})
            return {'index': len(self.doc['textures'])-1}
        mat = {'name': name, 'pbrMetallicRoughness': {'baseColorTexture': image(texture), 'metallicFactor': 0, 'roughnessFactor': roughness}, 'doubleSided': alpha}
        if alpha: mat.update(alphaMode='MASK', alphaCutoff=0.35)
        if normal: mat['normalTexture'] = dict(image(normal), scale=0.5)
        self.doc['materials'].append(mat)
        return len(self.doc['materials'])-1
    def mesh(self, name, positions, uv, faces, skin, material, morph=None):
        # Smooth in original topology before splitting UV seams.
        triangles = np.array([[c[0] for c in f[1]] for f in faces])
        normals = np.zeros_like(positions)
        a, b, c = (positions[triangles[:, i]] for i in range(3))
        face_normals = np.cross(b-a, c-a)
        for i in range(3): np.add.at(normals, triangles[:, i], face_normals)
        lengths = np.linalg.norm(normals, axis=1); normals /= np.maximum(lengths[:, None], 1e-12)
        lookup, split, indices = {}, [], []
        for _, face in faces:
            for pair in face:
                if pair not in lookup: lookup[pair] = len(split); split.append(pair)
                indices.append(lookup[pair])
        source = np.array([p[0] for p in split]); uv_indices = np.array([p[1] for p in split])
        bone_indices = np.argsort(-skin[source], axis=1)[:, :4]
        amounts = np.take_along_axis(skin[source], bone_indices, axis=1)
        amounts /= np.maximum(amounts.sum(1)[:, None], 1e-12)
        assert np.all(np.abs(amounts.sum(1)-1) < 1e-5), name
        attributes = {'POSITION': self.accessor(positions[source], 'VEC3', bounds=True),
                      'NORMAL': self.accessor(normals[source], 'VEC3'),
                      'TEXCOORD_0': self.accessor(uv[uv_indices] * [1, -1] + [0, 1], 'VEC2'),
                      'JOINTS_0': self.accessor(bone_indices, 'VEC4', 5123),
                      'WEIGHTS_0': self.accessor(amounts, 'VEC4')}
        prim = {'attributes': attributes, 'indices': self.accessor(indices, 'SCALAR', 5123 if len(source)<65536 else 5125), 'material': material}
        mesh = {'name': name, 'primitives': [prim]}
        if morph is not None:
            prim['targets'] = [{'POSITION': self.accessor(morph[source], 'VEC3', bounds=True)}]
            mesh.update(weights=[0], extras={'targetNames': ['Blink']})
        self.doc['meshes'].append(mesh)
        self.doc['nodes'][0]['children'].append(len(self.doc['nodes']))
        self.doc['nodes'].append({'name': name, 'mesh': len(self.doc['meshes'])-1, 'skin': 0})
        return len(source), len(indices)//3
    def save(self, path):
        while len(self.data) % 4: self.data.append(0)
        self.doc['buffers'] = [{'byteLength': len(self.data)}]
        blob = json.dumps(self.doc, separators=(',',':')).encode()
        blob += b' ' * (-len(blob)%4)
        total = 12 + 8 + len(blob) + 8 + len(self.data)
        path.write_bytes(struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<I4s',len(blob),b'JSON') + blob + struct.pack('<I4s',len(self.data),b'BIN\0') + self.data)


VARIANTS = [
    ('man', 'caucasian-male-young', 'male', 'short04', 'young_caucasian_male/young_lightskinned_male_diffuse.png', 1.80),
    ('man-dark', 'african-male-young', 'male', 'short01', 'young_african_male/young_darkskinned_male_diffuse.png', 1.83),
    ('woman', 'caucasian-female-young', 'female', 'ponytail01', 'young_caucasian_female/young_lightskinned_female_diffuse.png', 1.70),
]
summary = []
for name, shape, gender, hair, skin_texture, height in VARIANTS:
    base = BASE + target('macrodetails/' + shape) + target(f'macrodetails/universal-{gender}-young-averagemuscle-averageweight')
    assets = [('Suit', 'clothes/male_elegantsuit01'), ('Shoes', 'clothes/shoes03'), ('Hair', f'hair/{hair}'), ('Brows', 'eyebrows/eyebrow001'), ('Eyes','eyes/low-poly')]
    pieces, hidden = [], set()
    for part, folder in assets:
        pos, uv, faces, skin, delete = clothing(folder, base)
        pieces.append((part, folder, pos, uv, faces, skin)); hidden |= delete
    body_faces = [(group, face) for group, face in BASE_FACES if group == 'body' and not any(c[0] in hidden for c in face)]
    body_vertices = {c[0] for group, face in BASE_FACES if group=='body' for c in face}
    low = min(base[list(body_vertices),1].min(), min(p[2][:,1].min() for p in pieces))
    high = max(base[list(body_vertices),1].max(), max(p[2][:,1].max() for p in pieces))
    scale = height / (high - low)
    def transform(values):
        result = values.copy(); result[:,1] -= low; return result * [-scale, scale, -scale]
    glb = GLB(); root = glb.doc['nodes'][0]
    root['extras'] = {'height': height, 'variant': name, 'license': 'CC0-1.0'}
    joints = {n: base[RIG['joints'][RIG['bones'][n]['head']]].mean(0) for n in BONES}
    transformed = {n: transform(joints[n][None])[0] for n in BONES}
    inverse = []
    for n in BONES:
        b = RIG['bones'][n]; parent = b['parent']; head = transformed[n]
        tail = transform(base[RIG['joints'][b['tail']]].mean(0)[None])[0]
        node = {'name': n.replace('.', '_'), 'translation': (head - transformed[parent] if parent else head).tolist(),
                'extras': {'restHead': head.tolist(), 'restTail': tail.tolist()}, 'children': []}
        index = len(glb.doc['nodes']); glb.doc['nodes'].append(node)
        glb.doc['nodes'][1+BONE_INDEX[parent] if parent else 0]['children'].append(index)
        inv = np.eye(4); inv[:3,3] = -head; inverse.append(inv.T.flatten())
    glb.doc['skins'].append({'name': 'HumanRig', 'skeleton': 1, 'joints': list(range(1,1+len(BONES))), 'inverseBindMatrices': glb.accessor(inverse,'MAT4')})
    body_mat = glb.material('Skin', 'skins/'+skin_texture, 0.7)
    blink_group = 'african' if shape.startswith('african') else 'caucasian'
    blink = (target(f'expression/units/{blink_group}/eye-left-closure') + target(f'expression/units/{blink_group}/eye-right-closure')) * [-scale,scale,-scale]
    counts = [glb.mesh('Skin', transform(base), BASE_UV, body_faces, BASE_WEIGHTS, body_mat, blink)]
    for part, folder, pos, uv, faces, skin in pieces:
        basename = folder.split('/')[-1]
        texture = folder+'/'+basename+('_diffuse.png' if part not in ['Eyes','Brows'] else '.png')
        if part == 'Eyes': texture = 'eyes/materials/brown_eye.png'
        normal = folder+'/'+basename+'_normal.png' if folder=='clothes/female_elegantsuit01' and part=='Suit' else None
        mat = glb.material(part,texture,{'Suit':0.93,'Shoes':0.42,'Hair':0.88,'Brows':0.92,'Eyes':0.25}[part],part in ['Hair','Brows'],normal)
        counts.append(glb.mesh(part,transform(pos),uv,faces,skin,mat))
    destination = DEST/(name+'.glb');glb.save(destination)
    record = {'name':name,'height':height,'bones':len(BONES),'vertices':sum(v for v,t in counts),'triangles':sum(t for v,t in counts),'bytes':destination.stat().st_size,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()}
    summary.append(record);print(record,flush=True)
(DEST/'models.json').write_text(json.dumps(summary,indent=2)+'\n')
