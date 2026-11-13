/**
 * lib/project-schema.ts
 * ─────────────────────────────────────────────────────────────────────────
 * JSON-LD for a project page, as one @graph of three nodes (brief 29,
 * Ahrefs "schema.org validation error" ×20 and "Missing required address
 * for Local Business" ×12):
 *
 *   RealEstateListing        the page — name, url, description, image,
 *                            about → the community, provider → the company
 *   GatedResidenceCommunity  the development — address in parts, geo,
 *                            amenities, unit count and site area, and one
 *                            SingleFamilyResidence per house type
 *   RealEstateAgent          the company, with its full address, under one
 *                            @id shared by every page (organizationNode)
 *
 * What it replaces put address, numberOfAccommodationUnits and floorSize
 * on the listing (a WebPage type, so "unexpected property"), gave the
 * WHOLE SITE AREA as floorSize, and named a RealEstateAgent — a
 * LocalBusiness — with no address. No offers / price and no
 * aggregateRating: the site publishes neither.
 *
 * Pure: the page passes data in, the test checks the shape.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { siteConfig } from "@/config/site";
import { PROJECT_ADDRESSES } from "@/content/project-addresses";

export const ORGANIZATION_ID = `${siteConfig.url}/#organization`;

type PostalParts = {
  streetAddress: string;
  addressLocality?: string;
  addressRegion: string;
  postalCode?: string;
  addressCountry: string;
};

/** The company, as every page that names it should. */
export function organizationNode(input: {
  telephone?: string;
  email?: string;
  logoUrl?: string | null;
  /** The company's own profiles elsewhere (settings → social). */
  sameAs?: readonly (string | null | undefined)[];
}) {
  // Always a logo: the committed one when no upload is set. Without it
  // (and without sameAs) audits read the node as an incomplete Organization.
  const logo = input.logoUrl || `${siteConfig.url}${siteConfig.branding.logo}`;
  const sameAs = [...new Set((input.sameAs ?? []).map((url) => url?.trim()).filter((url): url is string => Boolean(url && /^https?:\/\//i.test(url))))];
  return {
    "@type": "RealEstateAgent",
    "@id": ORGANIZATION_ID,
    name: siteConfig.legalName,
    url: siteConfig.url,
    logo,
    // LocalBusiness types want a picture of the business; the share image
    // is the one the site already stands behind.
    image: `${siteConfig.url}${siteConfig.seo.ogImage}`,
    ...(sameAs.length > 0 && { sameAs }),
    ...(input.telephone && { telephone: input.telephone.replace(/[^\d+]/g, "") }),
    ...(input.email && { email: input.email }),
    foundingDate: siteConfig.organization.foundingDate,
    address: { "@type": "PostalAddress", ...siteConfig.organization.address },
    areaServed: { "@type": "AdministrativeArea", name: "Phuket" },
  };
}

/** The address a project has on file, or one built from its location line. */
export function projectAddress(slug: string, location: string): PostalParts {
  const known = PROJECT_ADDRESSES[slug];
  if (known) return { addressRegion: "Phuket", addressCountry: "TH", ...known };
  return { streetAddress: location, addressRegion: "Phuket", addressCountry: "TH" };
}

export type OrganizationInput = Parameters<typeof organizationNode>[0];

export type ProjectSchemaInput = {
  locale: string;
  inLanguage: string;
  pageUrl: string;
  slug: string;
  name: string;
  description: string;
  location: string;
  images: string[];
  latitude: number | null;
  longitude: number | null;
  totalUnits: number | null;
  landAreaSqm: number | null;
  amenities: string[];
  houseTypes: { name: string; bedrooms: number | null; livingAreaSqm: number | null }[];
  organization: OrganizationInput;
};

export function projectSchemaGraph(input: ProjectSchemaInput) {
  const listingId = `${input.pageUrl}#listing`;
  const communityId = `${input.pageUrl}#community`;

  const additionalProperty = [
    input.totalUnits !== null && { "@type": "PropertyValue", name: "Total units", value: input.totalUnits },
    input.landAreaSqm !== null && {
      "@type": "PropertyValue",
      name: "Site area",
      value: input.landAreaSqm,
      unitCode: "MTK", // UN/CEFACT: square metre
    },
  ].filter(Boolean);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "RealEstateListing",
        "@id": listingId,
        url: input.pageUrl,
        name: input.name,
        ...(input.description && { description: input.description }),
        inLanguage: input.inLanguage,
        ...(input.images.length && { image: input.images }),
        about: { "@id": communityId },
        provider: { "@id": ORGANIZATION_ID },
      },
      {
        "@type": "GatedResidenceCommunity",
        "@id": communityId,
        name: input.name,
        address: { "@type": "PostalAddress", ...projectAddress(input.slug, input.location) },
        ...(input.latitude !== null &&
          input.longitude !== null && {
            geo: { "@type": "GeoCoordinates", latitude: input.latitude, longitude: input.longitude },
          }),
        ...(input.amenities.length && {
          amenityFeature: input.amenities.map((name) => ({
            "@type": "LocationFeatureSpecification",
            name,
            value: true,
          })),
        }),
        ...(additionalProperty.length && { additionalProperty }),
        ...(input.houseTypes.length && {
          containsPlace: input.houseTypes.map((type) => ({
            "@type": "SingleFamilyResidence",
            name: `${input.name} ${type.name}`.trim(),
            ...(type.bedrooms !== null && { numberOfBedrooms: type.bedrooms }),
            ...(type.livingAreaSqm !== null && {
              floorSize: { "@type": "QuantitativeValue", value: type.livingAreaSqm, unitCode: "MTK" },
            }),
            accommodationCategory: "Pool villa",
          })),
        }),
      },
      organizationNode(input.organization),
    ],
  };
}
