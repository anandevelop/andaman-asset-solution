/**
 * tests/project-schema.test.ts
 *
 * Brief 29: the project page's JSON-LD as a three-node @graph that passes
 * schema.org and Google's LocalBusiness address check.
 */

import { describe, expect, it } from "vitest";
import { ORGANIZATION_ID, organizationNode, projectAddress, projectSchemaGraph } from "@/lib/project-schema";

const PAGE = "https://andamanassetsolution.com/en/projects/victory";

const graph = projectSchemaGraph({
  locale: "en",
  inLanguage: "en-US",
  pageUrl: PAGE,
  slug: "victory",
  name: "The Victory",
  description: "45 pool villas in Thepkasattri.",
  location: "Thepkasattri, Thalang, Phuket",
  images: ["https://cdn/x.webp"],
  latitude: 8.01,
  longitude: 98.33,
  totalUnits: 45,
  landAreaSqm: 35929.6,
  amenities: ["Restaurant", "Spa"],
  houseTypes: [
    { name: "Type A", bedrooms: 3, livingAreaSqm: 388.9 },
    { name: "Type B", bedrooms: 5, livingAreaSqm: 877.1 },
  ],
  organization: { telephone: "+66-91-038-9178", email: "sales@andamanassetsolution.com", logoUrl: null },
});
const [listing, community, agent] = graph["@graph"] as Record<string, any>[];

describe("projectSchemaGraph", () => {
  it("keeps the listing to page properties and links the other two", () => {
    expect(listing["@type"]).toBe("RealEstateListing");
    expect(listing).not.toHaveProperty("address");
    expect(listing).not.toHaveProperty("floorSize");
    expect(listing).not.toHaveProperty("numberOfAccommodationUnits");
    expect(listing.about).toEqual({ "@id": `${PAGE}#community` });
    expect(listing.provider).toEqual({ "@id": ORGANIZATION_ID });
  });

  it("puts the address, site area and house types on the community", () => {
    expect(community["@type"]).toBe("GatedResidenceCommunity");
    expect(community.address).toMatchObject({ addressLocality: "Thep Krasattri, Thalang", postalCode: "83110" });
    expect(community.additionalProperty).toContainEqual(
      expect.objectContaining({ name: "Site area", value: 35929.6, unitCode: "MTK" }),
    );
    expect(community.containsPlace[1]).toMatchObject({
      "@type": "SingleFamilyResidence",
      name: "The Victory Type B",
      numberOfBedrooms: 5,
      floorSize: { value: 877.1, unitCode: "MTK" },
    });
    expect(community).not.toHaveProperty("floorSize");
  });

  it("gives the company a full address and no price or rating anywhere", () => {
    expect(agent["@id"]).toBe(ORGANIZATION_ID);
    expect(agent.address).toMatchObject({ postalCode: "83110", addressCountry: "TH" });
    expect(agent.telephone).toBe("+66910389178");
    expect(JSON.stringify(graph)).not.toMatch(/offers|price|aggregateRating/i);
  });
});

describe("projectAddress", () => {
  it("falls back to the location line for a project not in the table", () => {
    expect(projectAddress("new-project", "Kamala, Phuket")).toEqual({
      streetAddress: "Kamala, Phuket",
      addressRegion: "Phuket",
      addressCountry: "TH",
    });
  });

  it("organizationNode stands alone for the home page", () => {
    expect(organizationNode({})).toMatchObject({ "@type": "RealEstateAgent", foundingDate: "2021" });
  });
});
