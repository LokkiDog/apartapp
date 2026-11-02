export const amenityGroups = [
  { key: "essentials", codes: ["wifi", "air_conditioning", "heating", "tv", "smart_tv", "dedicated_workspace", "soundproofing"] },
  { key: "kitchen", codes: ["kitchen", "refrigerator", "stove", "oven", "microwave", "dishwasher", "electric_kettle", "coffee_machine", "toaster", "cookware", "dishes", "dining_table"] },
  { key: "bathroom", codes: ["washing_machine", "dryer", "hair_dryer", "iron", "ironing_board", "hot_water", "bathtub", "shower", "towels", "toiletries"] },
  { key: "bedroom", codes: ["bed_linen", "blackout_curtains", "wardrobe", "crib", "high_chair"] },
  { key: "outdoor", codes: ["balcony", "terrace", "mountain_view", "garden", "outdoor_furniture", "barbecue"] },
  { key: "building", codes: ["parking", "lift", "ski_storage", "pool", "indoor_pool", "sauna", "hot_tub", "gym", "ev_charger", "step_free_access"] },
  { key: "services", codes: ["self_check_in", "pets_allowed", "luggage_storage", "long_stays"] },
  { key: "safety", codes: ["smoke_alarm", "carbon_monoxide_alarm", "fire_extinguisher", "first_aid_kit", "safe"] },
] as const

export type AmenityCode = typeof amenityGroups[number]['codes'][number]
export type AmenityGroupKey = typeof amenityGroups[number]['key']
export const amenityCodes = amenityGroups.flatMap<AmenityCode>(group => group.codes)
