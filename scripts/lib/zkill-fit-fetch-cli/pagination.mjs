export async function collectZkillLossCandidates({
  shipTypeIds,
  maxRecords,
  beforeKillmailId,
  fetchShipTypeLossPage
}) {
  validateInput(shipTypeIds, maxRecords, beforeKillmailId, fetchShipTypeLossPage);

  if (maxRecords === 0) {
    return [];
  }

  const states = shipTypeIds.map((shipTypeId, order) => ({
    shipTypeId,
    order,
    nextPage: 1,
    buffer: [],
    bufferIndex: 0,
    exhausted: false
  }));

  for (const state of states) {
    // Prime each ship stream with its newest page in deterministic input order.
    await refillStateBuffer(state, beforeKillmailId, fetchShipTypeLossPage);
  }

  const results = [];
  while (results.length < maxRecords) {
    const nextState = selectNextState(states);
    if (!nextState) {
      break;
    }

    const candidate = nextState.buffer[nextState.bufferIndex];
    nextState.bufferIndex += 1;
    results.push({
      shipTypeFilterId: nextState.shipTypeId,
      killmailId: candidate.killmailId,
      killmailHash: candidate.killmailHash,
      zkill: candidate.zkill
    });

    if (nextState.bufferIndex >= nextState.buffer.length) {
      await refillStateBuffer(nextState, beforeKillmailId, fetchShipTypeLossPage);
    }
  }

  return results;
}

function validateInput(shipTypeIds, maxRecords, beforeKillmailId, fetchShipTypeLossPage) {
  if (!Array.isArray(shipTypeIds) || shipTypeIds.length === 0) {
    throw new TypeError("shipTypeIds must be a non-empty array.");
  }

  for (const shipTypeId of shipTypeIds) {
    if (!Number.isInteger(shipTypeId) || shipTypeId <= 0) {
      throw new TypeError("shipTypeIds must contain only positive integers.");
    }
  }

  if (!Number.isInteger(maxRecords) || maxRecords < 0) {
    throw new TypeError("maxRecords must be a non-negative integer.");
  }

  if (
    beforeKillmailId !== undefined &&
    (!Number.isInteger(beforeKillmailId) || beforeKillmailId <= 0)
  ) {
    throw new TypeError("beforeKillmailId must be a positive integer when provided.");
  }

  if (typeof fetchShipTypeLossPage !== "function") {
    throw new TypeError("fetchShipTypeLossPage must be a function.");
  }
}

async function refillStateBuffer(state, beforeKillmailId, fetchShipTypeLossPage) {
  if (state.exhausted) {
    return;
  }

  state.buffer = [];
  state.bufferIndex = 0;

  while (!state.exhausted) {
    const pageEntries = await fetchShipTypeLossPage({
      shipTypeId: state.shipTypeId,
      page: state.nextPage
    });
    state.nextPage += 1;

    const parsedEntries = parsePageEntries(pageEntries, beforeKillmailId);
    if (parsedEntries.length > 0) {
      state.buffer = parsedEntries;
      return;
    }

    if (!Array.isArray(pageEntries) || pageEntries.length === 0) {
      state.exhausted = true;
    }
  }
}

function parsePageEntries(pageEntries, beforeKillmailId) {
  if (!Array.isArray(pageEntries) || pageEntries.length === 0) {
    return [];
  }

  return pageEntries
    .map((entry, index) => toCandidateEntry(entry, index))
    .filter((entry) => Boolean(entry))
    .filter((entry) => beforeKillmailId === undefined || entry.killmailId < beforeKillmailId)
    .sort(compareWithinPage);
}

function selectNextState(states) {
  let selectedState = null;
  for (const state of states) {
    if (state.exhausted || state.bufferIndex >= state.buffer.length) {
      continue;
    }

    if (!selectedState) {
      selectedState = state;
      continue;
    }

    const current = state.buffer[state.bufferIndex];
    const selected = selectedState.buffer[selectedState.bufferIndex];

    const orderResult = compareAcrossStates(current, selected, state.order, selectedState.order);
    if (orderResult < 0) {
      selectedState = state;
    }
  }

  return selectedState;
}

function toCandidateEntry(entry, pageIndex) {
  const killmailId = Number(entry?.killmail_id);
  if (!Number.isInteger(killmailId) || killmailId <= 0) {
    return null;
  }

  return {
    killmailId,
    killmailHash: typeof entry?.zkb?.hash === "string" ? entry.zkb.hash : entry?.hash,
    zkill: entry,
    pageIndex
  };
}

function compareWithinPage(left, right) {
  if (left.killmailId !== right.killmailId) {
    return right.killmailId - left.killmailId;
  }
  return left.pageIndex - right.pageIndex;
}

function compareAcrossStates(left, right, leftOrder, rightOrder) {
  if (left.killmailId !== right.killmailId) {
    return right.killmailId - left.killmailId;
  }
  return leftOrder - rightOrder;
}
