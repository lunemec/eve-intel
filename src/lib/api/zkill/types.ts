export type ZkillCacheEvent = {
  forceNetwork: boolean;
  status: number;
  notModified: boolean;
  requestEtag?: string;
  requestLastModified?: string;
  responseEtag?: string;
  responseLastModified?: string;
};

export type ZkillAttacker = {
  character_id?: number;
  ship_type_id?: number;
};

export type ZkillVictim = {
  character_id?: number;
  ship_type_id?: number;
};

export type ZkillItem = {
  item_type_id: number;
  flag?: number;
  charge_item_type_id?: number;
  quantity_destroyed?: number;
  quantity_dropped?: number;
};

export type ZkillKillmail = {
  killmail_id: number;
  killmail_time: string;
  solar_system_id?: number;
  victim: ZkillVictim & { items?: ZkillItem[] };
  attackers?: ZkillAttacker[];
  zkb?: {
    hash?: string;
    totalValue?: number;
    solo?: boolean;
    labels?: string[];
  };
};

export type ZkillCharacterStats = {
  kills?: number;
  losses?: number;
  solo?: number;
  avgGangSize?: number;
  gangRatio?: number;
  danger?: number;
  iskDestroyed?: number;
  iskLost?: number;
};

export type ZkillListCacheEnvelope = {
  rows: ZkillKillmail[];
  etag?: string;
  lastModified?: string;
  validatedAt: number;
};

export type ZkillSummaryRow = {
  killmail_id: number;
  zkb?: {
    hash?: string;
    totalValue?: number;
  };
};
