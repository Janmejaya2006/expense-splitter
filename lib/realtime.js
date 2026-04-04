let nextListenerId = 1;
let nextEventId = 1;

const listeners = new Map();

function normalizeGroupIds(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  out.sort((a, b) => a - b);
  return out;
}

function normalizeRealtimeEvent(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const eventType = String(source.type || "db.updated").trim() || "db.updated";
  const occurredAt = String(source.occurredAt || new Date().toISOString());
  const changedGroupIds = normalizeGroupIds(source.changedGroupIds);

  return {
    id: Number(nextEventId++),
    type: eventType,
    occurredAt,
    changedGroupIds,
  };
}

export function publishRealtimeEvent(payload = {}) {
  const event = normalizeRealtimeEvent(payload);
  const subscribers = Array.from(listeners.values());
  for (const listener of subscribers) {
    try {
      listener(event);
    } catch {
      // Ignore listener failures so one broken client does not block others.
    }
  }
  return event;
}

export function subscribeRealtimeEvents(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  const id = Number(nextListenerId++);
  listeners.set(id, listener);
  return () => {
    listeners.delete(id);
  };
}
