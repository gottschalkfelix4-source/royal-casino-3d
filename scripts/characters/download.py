#!/usr/bin/env python3
"""Fetch the specific CC0 data assets used by the character build (standard library only).
Uses HTTP ranges to avoid downloading the unrelated 267 MB system pack.
Usage: python3 scripts/characters/download.py /tmp/royal-human-source
"""
import concurrent.futures, hashlib, io, json, pathlib, struct, sys, urllib.request, zipfile, zlib, binascii
DEST = pathlib.Path(sys.argv[1]); DEST.mkdir(parents=True, exist_ok=True)
COMMIT = 'a8bc2d54ff0ac92e78ff71431b1023eda42bf482'
REPO = f'https://raw.githubusercontent.com/makehumancommunity/makehuman/{COMMIT}/'
PACK = 'https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip'
CORE = ['LICENSE.md','LICENSE.ASSETS.md','makehuman/data/3dobjs/base.obj','makehuman/data/rigs/default.mhskel','makehuman/data/rigs/default_weights.mhw']
CORE += [f'makehuman/data/targets/macrodetails/{n}.target' for n in ['caucasian-male-young','caucasian-female-young','african-male-young','universal-male-young-averagemuscle-averageweight','universal-female-young-averagemuscle-averageweight']]
CORE += [f'makehuman/data/targets/expression/units/{group}/eye-{side}-closure.target' for group in ['caucasian','african'] for side in ['left','right']]
PREFIXES = ['clothes/male_elegantsuit01/','clothes/shoes03/','hair/short04/','hair/short01/','hair/ponytail01/','eyebrows/eyebrow001/','eyes/low-poly/','eyes/materials/brown_eye.png','skins/young_caucasian_male/','skins/young_caucasian_female/','skins/young_african_male/']
records = []
def store(path, data, source):
    if '..' in pathlib.PurePosixPath(path).parts or path.startswith('/'): raise ValueError(path)
    out = DEST/path; out.parent.mkdir(parents=True, exist_ok=True); out.write_bytes(data)
    return {'path':path,'source':source,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
def fetch_core(path):
    return store(path,urllib.request.urlopen(REPO+path,timeout=60).read(),REPO+path)
with concurrent.futures.ThreadPoolExecutor(6) as pool: records.extend(pool.map(fetch_core,CORE))

def request_range(start, end=None):
    value=f'bytes={start}-{end}' if end is not None else f'bytes=-{start}'
    response=urllib.request.urlopen(urllib.request.Request(PACK,headers={'Range':value}),timeout=60)
    if response.status!=206: raise RuntimeError('Asset server does not support byte ranges')
    return response.read(), response.headers

tail, headers = request_range(65536)
size = int(headers['Content-Range'].split('/')[-1])
eocd = tail.rfind(b'PK\x05\x06')
record = struct.unpack_from('<4s4H2LH',tail,eocd)
central_size, central_offset = record[5:7]
central, _ = request_range(central_offset,size-1)
# A compact in-memory ZIP directory; patch the end record to remove its old file offset.
compact = bytearray(central); compact_eocd = compact.rfind(b'PK\x05\x06')
struct.pack_into('<I',compact,compact_eocd+16,0)
archive = zipfile.ZipFile(io.BytesIO(compact))
selected=[i for i in archive.infolist() if i.file_size and any(i.filename.startswith(prefix) for prefix in PREFIXES)]
def fetch_asset(info):
    data,_=request_range(info.header_offset,info.header_offset+30+len(info.filename.encode())+4096+info.compress_size)
    header=struct.unpack_from('<4s5H3L2H',data); start=30+header[-2]+header[-1]
    compressed=data[start:start+info.compress_size]
    raw=zlib.decompress(compressed,-15) if info.compress_type==8 else compressed
    if len(raw)!=info.file_size or binascii.crc32(raw)!=info.CRC: raise ValueError('Asset CRC mismatch: '+info.filename)
    return store('system/'+info.filename,raw,PACK+'#'+info.filename)
with concurrent.futures.ThreadPoolExecutor(6) as pool: records.extend(pool.map(fetch_asset,selected))
(DEST/'source-manifest.json').write_text(json.dumps({'coreCommit':COMMIT,'packLastModified':headers.get('Last-Modified'),'files':sorted(records,key=lambda x:x['path'])},indent=2)+'\n')
print(f'Downloaded {len(records)} verified source assets to {DEST}')
