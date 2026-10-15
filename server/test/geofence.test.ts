import { describe, expect, it } from "vitest";
import { isWithinParcel, parcelCenter } from "../lib/geofence";

describe("geofence R11", () => {
  const parcel = { lat: 18.4088, lng: 76.5604 };

  it("accepts a pin ~200 m inside the parcel", () => {
    const pin = { lat: 18.4105, lng: 76.5604 };
    const result = isWithinParcel(pin, parcel);
    expect(result.distanceM).toBeLessThanOrEqual(500);
    expect(result.accepted).toBe(true);
  });

  it("rejects a pin ~620 m outside the parcel", () => {
    const pin = { lat: 18.4145, lng: 76.5604 };
    const result = isWithinParcel(pin, parcel);
    expect(result.distanceM).toBeGreaterThan(500);
    expect(result.accepted).toBe(false);
  });

  it("reads GeoJSON Point coordinates", () => {
    expect(parcelCenter({ type: "Point", coordinates: [76.56, 18.4] })).toEqual({
      lng: 76.56,
      lat: 18.4,
    });
  });
});
