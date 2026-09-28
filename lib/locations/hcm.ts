export type WardDefinition = {
  name: string;
  aliases?: string[];
};

export type DistrictDefinition = {
  id: string;
  name: string;
  shortName: string;
  aliases: string[];
  wards: WardDefinition[];
};

export const hcmDistricts: DistrictDefinition[] = [
  {
    id: "go-vap",
    name: "Quận Gò Vấp",
    shortName: "Gò Vấp",
    aliases: ["go vap", "quan go vap", "q go vap", "qgv"],
    wards: [
      { name: "Phường 1", aliases: ["p1"] },
      { name: "Phường 3", aliases: ["p3"] },
      { name: "Phường 4", aliases: ["p4"] },
      { name: "Phường 5", aliases: ["p5"] },
      { name: "Phường 6", aliases: ["p6"] },
      { name: "Phường 7", aliases: ["p7"] },
      { name: "Phường 8", aliases: ["p8"] },
      { name: "Phường 9", aliases: ["p9"] },
      { name: "Phường 10", aliases: ["p10"] },
      { name: "Phường 11", aliases: ["p11"] },
      { name: "Phường 12", aliases: ["p12"] },
      { name: "Phường 13", aliases: ["p13"] },
      { name: "Phường 14", aliases: ["p14"] },
      { name: "Phường 15", aliases: ["p15"] },
      { name: "Phường 16", aliases: ["p16"] },
      { name: "Phường 17", aliases: ["p17"] },
    ],
  },
  {
    id: "quan-12",
    name: "Quận 12",
    shortName: "Quận 12",
    aliases: ["12", "quan 12", "q12", "district 12"],
    wards: [
      { name: "An Phú Đông", aliases: ["apd"] },
      { name: "Đông Hưng Thuận", aliases: ["dht"] },
      { name: "Hiệp Thành", aliases: ["ht"] },
      { name: "Tân Chánh Hiệp", aliases: ["tch"] },
      { name: "Tân Hưng Thuận", aliases: ["tht"] },
      { name: "Tân Thới Hiệp", aliases: ["tth"] },
      { name: "Tân Thới Nhất", aliases: ["ttn"] },
      { name: "Thạnh Lộc", aliases: ["tl"] },
      { name: "Thạnh Xuân", aliases: ["tx"] },
      { name: "Thới An", aliases: ["ta"] },
      { name: "Trung Mỹ Tây", aliases: ["tmt"] },
    ],
  },
  {
    id: "hoc-mon",
    name: "Huyện Hóc Môn",
    shortName: "Hóc Môn",
    aliases: ["hoc mon", "huyen hoc mon", "hocmon", "hm"],
    wards: [
      { name: "Bà Điểm", aliases: ["bd"] },
      { name: "Đông Thạnh", aliases: ["dt"] },
      { name: "Hóc Môn", aliases: ["hm"] },
      { name: "Nhị Bình", aliases: ["nb"] },
      { name: "Tân Hiệp", aliases: ["th"] },
      { name: "Tân Thới Nhì", aliases: ["ttn"] },
      { name: "Tân Xuân", aliases: ["tx"] },
      { name: "Thới Tam Thôn", aliases: ["ttt"] },
      { name: "Trung Chánh", aliases: ["tc"] },
      { name: "Xuân Thới Đông", aliases: ["xtd"] },
      { name: "Xuân Thới Sơn", aliases: ["xts"] },
      { name: "Xuân Thới Thượng", aliases: ["xtt"] },
    ],
  },
  {
    id: "binh-thanh",
    name: "Quận Bình Thạnh",
    shortName: "Bình Thạnh",
    aliases: ["binh thanh", "quan binh thanh", "q binh thanh", "qbt"],
    wards: [
      { name: "Phường 1", aliases: ["p1"] },
      { name: "Phường 2", aliases: ["p2"] },
      { name: "Phường 3", aliases: ["p3"] },
      { name: "Phường 5", aliases: ["p5"] },
      { name: "Phường 6", aliases: ["p6"] },
      { name: "Phường 7", aliases: ["p7"] },
      { name: "Phường 11", aliases: ["p11"] },
      { name: "Phường 12", aliases: ["p12"] },
      { name: "Phường 13", aliases: ["p13"] },
      { name: "Phường 14", aliases: ["p14"] },
      { name: "Phường 15", aliases: ["p15"] },
      { name: "Phường 17", aliases: ["p17"] },
      { name: "Phường 19", aliases: ["p19"] },
      { name: "Phường 21", aliases: ["p21"] },
      { name: "Phường 22", aliases: ["p22"] },
      { name: "Phường 24", aliases: ["p24"] },
      { name: "Phường 25", aliases: ["p25"] },
      { name: "Phường 26", aliases: ["p26"] },
      { name: "Phường 27", aliases: ["p27"] },
      { name: "Phường 28", aliases: ["p28"] },
    ],
  },
  {
    id: "quan-3",
    name: "Quận 3",
    shortName: "Quận 3",
    aliases: ["3", "quan 3", "q3", "district 3"],
    wards: [
      { name: "Phường Võ Thị Sáu", aliases: ["vo thi sau", "vts", "p vo thi sau"] },
      { name: "Phường 1", aliases: ["p1"] },
      { name: "Phường 2", aliases: ["p2"] },
      { name: "Phường 3", aliases: ["p3"] },
      { name: "Phường 4", aliases: ["p4"] },
      { name: "Phường 5", aliases: ["p5"] },
      { name: "Phường 6", aliases: ["p6"] },
      { name: "Phường 7", aliases: ["p7"] },
      { name: "Phường 8", aliases: ["p8"] },
      { name: "Phường 9", aliases: ["p9"] },
      { name: "Phường 10", aliases: ["p10"] },
      { name: "Phường 11", aliases: ["p11"] },
      { name: "Phường 12", aliases: ["p12"] },
      { name: "Phường 13", aliases: ["p13"] },
      { name: "Phường 14", aliases: ["p14"] },
    ],
  },
  {
    id: "quan-2",
    name: "Quận 2",
    shortName: "Quận 2",
    aliases: ["2", "quan 2", "q2", "district 2", "thu duc quan 2"],
    wards: [
      { name: "An Khánh", aliases: ["ak"] },
      { name: "An Lợi Đông", aliases: ["ald"] },
      { name: "An Phú", aliases: ["ap"] },
      { name: "Bình An", aliases: ["ba"] },
      { name: "Bình Khánh", aliases: ["bk"] },
      { name: "Bình Trưng Đông", aliases: ["btd", "btđ"] },
      { name: "Bình Trưng Tây", aliases: ["btt"] },
      { name: "Cát Lái", aliases: ["cl"] },
      { name: "Thạnh Mỹ Lợi", aliases: ["tml"] },
      { name: "Thảo Điền", aliases: ["td"] },
      { name: "Thủ Thiêm", aliases: ["tt"] },
    ],
  },
  {
    id: "quan-9",
    name: "Quận 9",
    shortName: "Quận 9",
    aliases: ["9", "quan 9", "q9", "district 9", "thu duc quan 9"],
    wards: [
      { name: "Hiệp Phú", aliases: ["hp"] },
      { name: "Long Bình", aliases: ["lb"] },
      { name: "Long Phước", aliases: ["lp"] },
      { name: "Long Thạnh Mỹ", aliases: ["ltm"] },
      { name: "Long Trường", aliases: ["lt"] },
      { name: "Phú Hữu", aliases: ["ph"] },
      { name: "Phước Bình", aliases: ["pb"] },
      { name: "Phước Long A", aliases: ["pla"] },
      { name: "Phước Long B", aliases: ["plb"] },
      { name: "Tân Phú", aliases: ["tp"] },
      { name: "Tăng Nhơn Phú A", aliases: ["tnpa"] },
      { name: "Tăng Nhơn Phú B", aliases: ["tnpb"] },
      { name: "Trường Thạnh", aliases: ["tt"] },
    ],
  },
  // KV1–KV4 (wards se bo sung sau, hien de trong).
  { id: "quan-1", name: "Quận 1", shortName: "Quận 1", aliases: ["1", "quan 1", "q1", "district 1"], wards: [] },
  { id: "quan-4", name: "Quận 4", shortName: "Quận 4", aliases: ["4", "quan 4", "q4", "district 4"], wards: [] },
  { id: "quan-5", name: "Quận 5", shortName: "Quận 5", aliases: ["5", "quan 5", "q5", "district 5"], wards: [] },
  { id: "quan-6", name: "Quận 6", shortName: "Quận 6", aliases: ["6", "quan 6", "q6", "district 6"], wards: [] },
  { id: "quan-7", name: "Quận 7", shortName: "Quận 7", aliases: ["7", "quan 7", "q7", "district 7"], wards: [] },
  { id: "quan-10", name: "Quận 10", shortName: "Quận 10", aliases: ["10", "quan 10", "q10", "district 10"], wards: [] },
  { id: "quan-11", name: "Quận 11", shortName: "Quận 11", aliases: ["11", "quan 11", "q11", "district 11"], wards: [] },
  { id: "tan-binh", name: "Quận Tân Bình", shortName: "Tân Bình", aliases: ["tan binh", "quan tan binh", "q tan binh"], wards: [] },
  { id: "phu-nhuan", name: "Quận Phú Nhuận", shortName: "Phú Nhuận", aliases: ["phu nhuan", "quan phu nhuan", "q phu nhuan"], wards: [] },
  { id: "thu-duc", name: "Thành phố Thủ Đức", shortName: "Thủ Đức", aliases: ["thu duc", "thanh pho thu duc", "tp thu duc", "tptd"], wards: [] },
  { id: "binh-tan", name: "Quận Bình Tân", shortName: "Bình Tân", aliases: ["binh tan", "quan binh tan", "q binh tan"], wards: [] },
  { id: "tan-phu", name: "Quận Tân Phú", shortName: "Tân Phú", aliases: ["tan phu", "quan tan phu", "q tan phu"], wards: [] },
  { id: "binh-chanh", name: "Huyện Bình Chánh", shortName: "Bình Chánh", aliases: ["binh chanh", "huyen binh chanh", "bc"], wards: [] },
];

export const KV_OPTIONS = ["KV1", "KV2", "KV3", "KV4", "KV5", "KV6"];

// Quan/huyen thuoc tung khu vuc. KV5/KV6 giu nguyen danh sach chung (hcmDistricts).
export const KV_DISTRICTS: Record<string, string[]> = {
  KV1: ["Quận 5", "Quận 6", "Quận 11", "Huyện Bình Chánh"],
  KV2: ["Quận Tân Bình", "Quận Phú Nhuận", "Thành phố Thủ Đức"],
  KV3: ["Quận Bình Tân", "Quận Tân Phú", "Huyện Bình Chánh"],
  KV4: ["Quận 1", "Quận 4", "Quận 7", "Quận 10"],
};

export function districtsForKv(
  kv: string | null | undefined,
  districts: DistrictDefinition[] = hcmDistricts,
) {
  const list = KV_DISTRICTS[(kv ?? "").trim().toUpperCase()];
  if (!list) return districts.map((district) => district.name);
  return list;
}

export function districtDefinitionFor(
  value: string | null | undefined,
  districts: DistrictDefinition[] = hcmDistricts,
) {
  const normalized = normalizeDistrict(value);
  if (!normalized) return undefined;
  return districts.find((district) => {
    const keys = [district.name, district.shortName, ...district.aliases].map(normalizeDistrict);
    return keys.some((key) => normalized === key || normalized.startsWith(`${key} `));
  });
}

export function wardDefinitionFor(
  districtValue: string | null | undefined,
  wardValue: string | null | undefined,
  districts: DistrictDefinition[] = hcmDistricts,
) {
  const district = districtDefinitionFor(districtValue, districts);
  const normalized = normalizeWard(wardValue);
  if (!district || !normalized) return undefined;
  return district.wards.find((ward) =>
    [ward.name, ...(ward.aliases ?? [])].map(normalizeWard).some((key) => key === normalized),
  );
}

export function canonicalDistrictName(
  value: string | null | undefined,
  districts: DistrictDefinition[] = hcmDistricts,
) {
  return districtDefinitionFor(value, districts)?.name ?? "";
}

export function canonicalDistrictShortName(
  value: string | null | undefined,
  districts: DistrictDefinition[] = hcmDistricts,
) {
  return districtDefinitionFor(value, districts)?.shortName ?? value?.trim() ?? "";
}

export function canonicalWardNames(
  districtValue: string | null | undefined,
  rawWardValue: string | null | undefined,
  districts: DistrictDefinition[] = hcmDistricts,
) {
  const names = new Map<string, string>();
  for (const part of splitLocationParts(rawWardValue)) {
    const ward = wardDefinitionFor(districtValue, part, districts);
    if (ward) names.set(normalizeWard(ward.name), ward.name);
  }
  return Array.from(names.values());
}

export function wardNamesForDistrict(
  districtValue: string | null | undefined,
  districts: DistrictDefinition[] = hcmDistricts,
) {
  return districtDefinitionFor(districtValue, districts)?.wards.map((ward) => ward.name) ?? [];
}

export function districtMatches(
  value: string | null | undefined,
  filter: string,
  districts: DistrictDefinition[] = hcmDistricts,
) {
  const selected = districtDefinitionFor(filter, districts);
  const candidate = districtDefinitionFor(value, districts);
  if (selected && candidate) return selected.id === candidate.id;
  return normalizeDistrict(value) === normalizeDistrict(filter);
}

export function wardMatches(
  districtValue: string | null | undefined,
  rawWardValue: string | null | undefined,
  filter: string,
  districts: DistrictDefinition[] = hcmDistricts,
) {
  const selected = wardDefinitionFor(districtValue, filter, districts);
  const selectedKeys = selected
    ? [selected.name, ...(selected.aliases ?? [])].map(normalizeWard)
    : [filter].map(normalizeWard);
  const rawParts = splitLocationParts(rawWardValue).map(normalizeWard);
  return rawParts.some((part) => selectedKeys.includes(part));
}

export function splitLocationParts(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return [];
  const initialParts = raw
    .replace(/\s+(và|and)\s+/gi, ",")
    .replace(/[;/&+\n]+/g, ",")
    .replace(/\s*\/\s*/g, ",")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const expanded = new Map<string, string>();
  let previousWords: string[] = [];

  for (const part of initialParts) {
    expanded.set(normalizeWard(part), part);

    if (previousWords.length > 1 && shouldExpandSuffix(part)) {
      const inferred = `${previousWords.slice(0, -1).join(" ")} ${part}`;
      expanded.set(normalizeWard(inferred), inferred);
      previousWords = inferred.split(/\s+/).filter(Boolean);
    } else {
      previousWords = part.split(/\s+/).filter(Boolean);
    }
  }

  return Array.from(expanded.values());
}

export function normalizeLocation(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[.,/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDistrict(value: string | null | undefined) {
  return normalizeLocation(value)
    .replace(/\b(quan|huyen|district|q)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWard(value: string | null | undefined) {
  return normalizeLocation(value)
    .replace(/\b(phuong|ward|xa|thi tran|tt|p)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldExpandSuffix(value: string) {
  const normalized = normalizeWard(value);
  return normalized.length > 0 && normalized.split(/\s+/).length === 1;
}
