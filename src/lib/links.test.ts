import { describe, expect, it } from "vitest";
import {
  allianceLogoUrl,
  allianceZkillUrl,
  characterPortraitUrl,
  characterZkillUrl,
  corporationLogoUrl,
  corporationZkillUrl,
  killmailZkillUrl,
  shipIconUrl
} from "./links";

describe("links", () => {
  it("builds zKill URLs", () => {
    expect(characterZkillUrl(93227004)).toBe("https://zkillboard.com/character/93227004/");
    expect(corporationZkillUrl(1000169)).toBe("https://zkillboard.com/corporation/1000169/");
    expect(allianceZkillUrl(99011193)).toBe("https://zkillboard.com/alliance/99011193/");
    expect(killmailZkillUrl(123456789)).toBe("https://zkillboard.com/kill/123456789/");
  });

  it("builds EVE image URLs", () => {
    expect(characterPortraitUrl(93227004)).toBe("https://images.evetech.net/characters/93227004/portrait?size=64");
    expect(characterPortraitUrl(93227004, 128)).toBe(
      "https://images.evetech.net/characters/93227004/portrait?size=128"
    );
    expect(corporationLogoUrl(1000169)).toBe("https://images.evetech.net/corporations/1000169/logo?size=64");
    expect(allianceLogoUrl(99011193)).toBe("https://images.evetech.net/alliances/99011193/logo?size=64");
  });

  it("uses fallback ship icon id when type id is missing or invalid", () => {
    expect(shipIconUrl(22456)).toBe("https://images.evetech.net/types/22456/icon?size=64");
    expect(shipIconUrl(undefined)).toBe("https://images.evetech.net/types/587/icon?size=64");
    expect(shipIconUrl(0, 128, 42)).toBe("https://images.evetech.net/types/42/icon?size=128");
  });
});
