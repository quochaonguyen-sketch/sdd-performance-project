"""Build the operational map from GADM 4.1 and the existing KV district plan.

Requires shapely. Run from the repository root; no Google Sheet data is used.
"""
import io
import json
from pathlib import Path
import subprocess
import unicodedata
import urllib.request
import zipfile

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_VNM_3.json.zip"


def key(value):
    return "".join(c for c in unicodedata.normalize("NFD", value.replace("đ", "d").replace("Đ", "D")).lower() if c.isascii() and c.isalnum())


def spaced(value):
    return "".join((" " if i and char.isupper() and value[i - 1].islower() else "") + char for i, char in enumerate(value))


def overview_geometry(geometry):
    # Close narrow merge seams for overview display; ward/address geometry stays untouched.
    result = geometry.buffer(0.0005, quad_segs=3).buffer(-0.0005, quad_segs=3).simplify(0.0002, preserve_topology=True)
    assert result.is_valid and not result.is_empty
    return mapping(result)


config = json.loads(subprocess.check_output([
    "node", "--input-type=module", "-e",
    "import {ZONE_DISTRICTS,ZONE_KV_DISTRICTS} from './lib/locations/zone-plan.ts'; console.log(JSON.stringify({districts:ZONE_DISTRICTS,areas:ZONE_KV_DISTRICTS}));",
], cwd=ROOT, encoding="utf-8"))
districts = {key(d["shortName"]): d for d in config["districts"]}
archive = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(SOURCE, timeout=60).read()))
source = json.loads(archive.read(archive.namelist()[0]))
wards, by_district, catalog = [], {}, {}
for feature in source["features"]:
    props = feature["properties"]
    if props["GID_1"] != "VNM.25_1":
        continue
    district = districts.get(key(props["NAME_2"]))
    if not district:
        continue
    ward = spaced(props["NAME_3"])
    number = ward.removeprefix("Phường").strip()
    if number.isdigit():
        ward = "Phường " + number
    geometry = shape(feature["geometry"])
    if not geometry.is_valid:
        geometry = geometry.buffer(0)
    by_district.setdefault(district["id"], []).append(geometry)
    catalog.setdefault(district["id"], []).append(ward)
    wards.append({"type": "Feature", "properties": {"districtId": district["id"], "wardKey": key(ward.replace("Phường ", "")), "wardName": ward, "source": "GADM 4.1"}, "geometry": mapping(geometry.simplify(0.00015, preserve_topology=True))})

assert len(by_district) == len(config["districts"]), "A planned district has no boundary"
district_shapes = {id: unary_union(parts) for id, parts in by_district.items()}
regions = []
for district in config["districts"]:
    regions.append({"type": "Feature", "properties": {"kind": "district", "id": district["id"], "name": district["name"], "source": "GADM 4.1"}, "geometry": overview_geometry(district_shapes[district["id"]])})

anchors = {"KV1": "quan-8", "KV2": "quan-7", "KV3": "binh-tan", "KV4": "tan-binh", "KV5": "quan-12"}
area_shapes = {}
for area, names in config["areas"].items():
    ids = [d["id"] for d in config["districts"] if d["name"] in names]
    geometry = unary_union([district_shapes[id] for id in ids])
    assert not geometry.is_empty and geometry.is_valid
    area_shapes[area] = shape(overview_geometry(geometry))

# Reserve shared district footprints for live Plan ward coverage in the browser.
shared = []
for district in config["districts"]:
    owners = [area for area, names in config["areas"].items() if district["name"] in names]
    if len(owners) > 1:
        geometry = shape(overview_geometry(district_shapes[district["id"]]))
        shared.append(geometry)

used = unary_union(shared)
display_shapes = list(shared)
for area, geometry in area_shapes.items():
    geometry = geometry.difference(used)
    assert geometry.is_valid and not geometry.is_empty
    display_shapes.append(geometry)
    used = unary_union([used, geometry])
    anchor = district_shapes[anchors[area]].representative_point()
    regions.append({"type": "Feature", "properties": {"kind": "area", "id": area, "name": "Khu vực " + area[-1], "labelPosition": [anchor.y, anchor.x], "source": "GADM 4.1 / ZONE_KV_DISTRICTS"}, "geometry": mapping(geometry)})

for i, left in enumerate(display_shapes):
    for right in display_shapes[i + 1:]:
        assert left.intersection(right).area < 1e-12, "Overview regions must never overlap"

for path, data in [
    ("public/data/hcm-legacy-wards.geojson", {"type": "FeatureCollection", "features": wards}),
    ("public/data/hcm-operating-regions.geojson", {"type": "FeatureCollection", "features": regions}),
    ("lib/locations/hcm-map-wards.json", catalog),
]:
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"Built {len(wards)} wards, {len(by_district)} districts and {len(anchors)} operating areas.")
