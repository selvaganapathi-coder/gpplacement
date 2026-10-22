/** G.P. Pharmacy College — https://gppharmacycollege.com/ */
export const COLLEGE_BRAND = {
  name: "G.P. Pharmacy College",
  shortName: "GP Pharmacy",
  tagline: "The Future of Pharmacy",
  emailDomain: "gppharmacy.edu",
  website: "https://gppharmacycollege.com/",
};

/** Two-letter sidebar / login mark from the portal name. */
export function collegeBrandMark(): string {
  const parts = COLLEGE_BRAND.name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return COLLEGE_BRAND.shortName.slice(0, 2).toUpperCase();
}
