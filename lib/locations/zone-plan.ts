import { hcmDistricts, KV_DISTRICTS } from "./hcm.ts";
import { OPERATING_AREAS, type OperatingArea } from "./operating-areas.ts";

// Map geography uses the three former districts, while stored source labels remain intact.
export const ZONE_DISTRICTS = hcmDistricts.map((district) => district.id === "thu-duc"
  ? { ...district, name: "Quận Thủ Đức", aliases: [...district.aliases, "quan thu duc"] }
  : district);

export const ZONE_KV_DISTRICTS = Object.fromEntries(OPERATING_AREAS.map((area) => [area,
  KV_DISTRICTS[area].flatMap((name) => name === "Thành phố Thủ Đức" ? area === "KV5" ? ["Quận Thủ Đức"] : [] : [name]),
])) as Record<OperatingArea, string[]>;
