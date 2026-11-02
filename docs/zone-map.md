# Zone map

The map opens with five operational areas. Clicking an area shows its districts;
clicking a district shows its wards; clicking a ward shows its riders.
The breadcrumb returns to either parent level, and the side list provides the
same navigation using keyboard-accessible buttons. Address lookup and ward
search can open ward detail directly.

Operational district membership comes from `ZONE_KV_DISTRICTS` in
`lib/locations/zone-plan.ts`, derived from the existing plan. The map shows Quận 2
and Quận 9 under KV2 and the former Quận Thủ Đức under KV5, as separate districts.
Source rider rows labelled TP/Thành phố Thủ Đức are resolved by their ward into
these former districts without rewriting stored rider data.
Bình Chánh is split by ward ownership read from the same Plan Sheet1 via the
authenticated `/api/zones/plan` endpoint (60-second server cache). The endpoint
returns only ward/KV mappings and source freshness, not rider identities. KV1
currently covers Bình Hưng and Phong Phú; KV3 covers Phạm Văn Hai, Tân Kiên,
Vĩnh Lộc A and Vĩnh Lộc B. These are read from the source, not hardcoded defaults.
Conflicting KV assignments to the same ward reject the update instead of
choosing an arbitrary owner. The client keeps its previous successful data if
a refresh fails and displays the error.
Static overview geometry reserves the Bình Chánh footprint; live active ward
polygons fill it with the KV color. There is no shared grey region. District
views for KV1/KV3 use only their visible Bình Chánh ward polygons. Other overview
shapes remain district-level operational coverage.
Rider totals are always filtered by the rider's actual KV; district totals also
include riders whose ward is missing. Ward polygons, filter choices, search
results and lists show only wards with at least one rider whose status is not
`inactive`. Backup placeholders are not geographic wards. Explicit combined
ward names such as `Xã Bình Hưng - Xã Phong Phú` expand into the two named wards.
The page loads all rider pages in batches of 1,000 and refreshes data once per
minute while visible, so empty wards cannot be caused by a truncated roster.

The **Chọn khu vực** button in the map header opens a native modal containing
all five KVs and the overview action. Selecting an option resets the district,
ward, search, address and selected-rider detail in React state without navigating
or reloading the page. The modal supports Escape, backdrop dismissal and native
focus management. Clicking a Bình Chánh ward in the overview opens its owning KV.

Boundary source: [GADM 4.1 Vietnam ADM3](https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_VNM_3.json.zip),
matching the legacy administrative names in the plan. The generated assets cover
21 planned districts and 287 wards. These are legacy boundaries, not the new
administrative wards after mergers. Source ward names that do not match a
boundary remain available in the ward list.

To regenerate, install Shapely in a Python environment and run
`python scripts/build-zone-boundaries.py` from the repository root. The script
reads the current district plan, downloads the original GeoJSON, merges area
and district geometry and simplifies it for browser display. Overview shapes
close narrow merge seams (about 55 metres), and their drawn outlines omit inner
rings to avoid stray lines at this scale. Ward geometry used for address lookup
is unchanged by overview smoothing. It produces
`public/data/hcm-operating-regions.geojson`,
`public/data/hcm-legacy-wards.geojson`, and
`lib/locations/hcm-map-wards.json`. No new browser dependency is required.
