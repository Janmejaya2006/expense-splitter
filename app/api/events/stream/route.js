import { requireAuth } from "@/lib/auth";
import { visibleGroupsForUser } from "@/lib/access";
import { readDB } from "@/lib/store";
import { subscribeRealtimeEvents } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseFrame(eventName, payload) {
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(request) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  const encoder = new TextEncoder();

  let closed = false;
  let unsubscribe = () => {};
  let heartbeat = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (eventName, payload) => {
        if (closed) return;
        controller.enqueue(encoder.encode(sseFrame(eventName, payload)));
      };

      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        try {
          unsubscribe();
        } catch {
          // Ignore unsubscribe errors.
        }
        try {
          controller.close();
        } catch {
          // Ignore already-closed stream errors.
        }
      };

      const emitIfVisible = async (eventPayload) => {
        if (closed) return;
        const safeEvent = eventPayload && typeof eventPayload === "object" ? eventPayload : {};
        const changedGroupIds = Array.isArray(safeEvent.changedGroupIds) ? safeEvent.changedGroupIds : [];

        if (changedGroupIds.length === 0) {
          send("update", safeEvent);
          return;
        }

        const db = await readDB();
        const visibleIds = new Set(
          visibleGroupsForUser(db, session)
            .map((group) => Number(group?.id || 0))
            .filter((id) => Number.isFinite(id) && id > 0)
        );

        const allowedGroupIds = changedGroupIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0 && visibleIds.has(id));

        if (!allowedGroupIds.length) {
          return;
        }

        send("update", {
          ...safeEvent,
          changedGroupIds: allowedGroupIds,
        });
      };

      send("ready", {
        ok: true,
        now: new Date().toISOString(),
      });

      unsubscribe = subscribeRealtimeEvents((eventPayload) => {
        void emitIfVisible(eventPayload);
      });

      heartbeat = setInterval(() => {
        send("ping", {
          now: new Date().toISOString(),
        });
      }, 25_000);

      request.signal.addEventListener("abort", close);
    },
    cancel() {
      if (closed) return;
      closed = true;
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      try {
        unsubscribe();
      } catch {
        // Ignore unsubscribe errors.
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
