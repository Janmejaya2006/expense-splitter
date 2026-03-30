import test from "node:test";
import assert from "node:assert/strict";
import { canAccessGroup, scopeDbForUser } from "../lib/access.js";

const DB_FIXTURE = {
  groups: [
    { id: 1, name: "Trip A", ownerUserId: 11 },
    { id: 2, name: "Trip B", ownerUserId: 99 },
  ],
  members: [
    { id: 101, groupId: 1, email: "owner@example.com", userId: 11, role: "owner" },
    { id: 102, groupId: 2, email: "other@example.com", userId: 22, role: "member" },
  ],
  expenses: [
    { id: 201, groupId: 1, amount: 100 },
    { id: 202, groupId: 2, amount: 250 },
  ],
  notificationLogs: [
    { id: 301, groupId: 1 },
    { id: 302, groupId: 2 },
  ],
  notificationQueue: [
    { id: 401, groupId: 1 },
    { id: 402, groupId: 2 },
  ],
  settlementPayments: [
    { id: 501, groupId: 1 },
    { id: 502, groupId: 2 },
  ],
  groupInvites: [
    { id: 601, groupId: 1 },
    { id: 602, groupId: 2 },
  ],
};

test("canAccessGroup honors owner/member isolation", () => {
  const ownerSession = { userId: 11, email: "owner@example.com" };
  assert.equal(canAccessGroup(DB_FIXTURE, 1, ownerSession), true);
  assert.equal(canAccessGroup(DB_FIXTURE, 2, ownerSession), false);
});

test("scopeDbForUser returns only visible group records", () => {
  const ownerSession = { userId: 11, email: "owner@example.com" };
  const scoped = scopeDbForUser(DB_FIXTURE, ownerSession);

  assert.deepEqual(
    scoped.groups.map((group) => group.id),
    [1]
  );
  assert.deepEqual(
    scoped.expenses.map((item) => item.groupId),
    [1]
  );
  assert.deepEqual(
    scoped.notificationQueue.map((item) => item.groupId),
    [1]
  );
});
