import type { ConditionalHeaders } from "../http";
import type { ZkillKillmail, ZkillListCacheEnvelope } from "./types";

export function normalizeListCacheEnvelope(
  value: ZkillKillmail[] | ZkillListCacheEnvelope | null
): ZkillListCacheEnvelope | null {
  if (!value) {
    return null;
  }
  if (Array.isArray(value)) {
    return {
      rows: value,
      validatedAt: 0
    };
  }
  if (typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<ZkillListCacheEnvelope>;
  if (!Array.isArray(candidate.rows)) {
    return null;
  }
  return {
    rows: candidate.rows,
    etag: typeof candidate.etag === "string" ? candidate.etag : undefined,
    lastModified: typeof candidate.lastModified === "string" ? candidate.lastModified : undefined,
    validatedAt:
      typeof candidate.validatedAt === "number" && Number.isFinite(candidate.validatedAt)
        ? candidate.validatedAt
        : 0
  };
}

export function toConditionalHeaders(cachedEnvelope?: ZkillListCacheEnvelope): ConditionalHeaders | undefined {
  if (!cachedEnvelope) {
    return undefined;
  }
  return {
    etag: cachedEnvelope.etag,
    lastModified: cachedEnvelope.lastModified
  };
}

export function buildListCacheEnvelope(
  rows: ZkillKillmail[],
  params: {
    etag?: string;
    lastModified?: string;
    validatedAt: number;
  }
): ZkillListCacheEnvelope {
  return {
    rows,
    etag: params.etag,
    lastModified: params.lastModified,
    validatedAt: params.validatedAt
  };
}
