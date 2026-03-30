export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isOwner(group, session) {
  const ownerUserId = Number(group?.ownerUserId || 0);
  const userId = Number(session?.userId || 0);
  return Number.isFinite(ownerUserId) && Number.isFinite(userId) && ownerUserId > 0 && ownerUserId === userId;
}

function hasOwner(group) {
  return Number(group?.ownerUserId || 0) > 0;
}

export function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  if (value === "owner") return "owner";
  if (value === "admin") return "admin";
  return "member";
}

function isMemberEntryForSession(member, session) {
  const memberUserId = Number(member?.userId || 0);
  const userId = Number(session?.userId || 0);
  if (memberUserId > 0 && userId > 0 && memberUserId === userId) return true;

  const memberEmail = normalizeEmail(member?.email);
  const sessionEmail = normalizeEmail(session?.email);
  return Boolean(memberEmail && sessionEmail && memberEmail === sessionEmail);
}

export function canAccessGroup(db, groupId, session) {
  const id = Number(groupId);
  if (!Number.isFinite(id)) return false;

  const group = (db.groups || []).find((item) => Number(item.id) === id);
  if (!group) return false;
  if (isOwner(group, session)) return true;

  const members = (db.members || []).filter((item) => Number(item.groupId) === id);
  return members.some((member) => isMemberEntryForSession(member, session));
}

export function resolveGroupRole(db, groupId, session) {
  const id = Number(groupId);
  if (!Number.isFinite(id)) return null;

  const group = (db.groups || []).find((item) => Number(item.id) === id);
  if (!group) return null;

  if (isOwner(group, session)) return "owner";

  const matchedMember = (db.members || []).find(
    (item) => Number(item.groupId) === id && isMemberEntryForSession(item, session)
  );
  if (matchedMember) {
    return normalizeRole(matchedMember.role);
  }

  // Backward compatibility for legacy groups without owner/mapped roles.
  if (!hasOwner(group) && canAccessGroup(db, id, session)) return "admin";
  return null;
}

function permissionsByRole(role) {
  if (role === "owner") {
    return {
      addExpense: true,
      editExpense: true,
      manageMembers: true,
      inviteMembers: true,
      manageGroup: true,
      deleteGroup: true,
      notifySettlement: true,
      markSettlementPaid: true,
    };
  }

  if (role === "admin") {
    return {
      addExpense: true,
      editExpense: true,
      manageMembers: true,
      inviteMembers: true,
      manageGroup: true,
      deleteGroup: false,
      notifySettlement: true,
      markSettlementPaid: true,
    };
  }

  return {
    addExpense: true,
    editExpense: false,
    manageMembers: false,
    inviteMembers: false,
    manageGroup: false,
    deleteGroup: false,
    notifySettlement: true,
    markSettlementPaid: true,
  };
}

export function groupPermissionsForUser(db, groupId, session) {
  const role = resolveGroupRole(db, groupId, session);
  if (!role) return null;

  return {
    role,
    ...permissionsByRole(role),
  };
}

export function hasGroupPermission(db, groupId, session, permissionKey) {
  const permissions = groupPermissionsForUser(db, groupId, session);
  if (!permissions) return false;
  return Boolean(permissions[permissionKey]);
}

export function canManageGroup(db, groupId, session) {
  return hasGroupPermission(db, groupId, session, "manageGroup");
}

export function visibleGroupsForUser(db, session) {
  return (db.groups || []).filter((group) => canAccessGroup(db, group.id, session));
}

export function scopeDbForUser(db, session) {
  const groups = visibleGroupsForUser(db, session);
  const visibleIds = new Set(groups.map((group) => Number(group.id)));
  const currentUserId = Number(session?.userId || 0);

  return {
    ...db,
    groups,
    members: (db.members || []).filter((item) => visibleIds.has(Number(item.groupId))),
    expenses: (db.expenses || []).filter((item) => visibleIds.has(Number(item.groupId))),
    notificationLogs: (db.notificationLogs || []).filter((item) => visibleIds.has(Number(item.groupId))),
    notificationQueue: (db.notificationQueue || []).filter((item) => visibleIds.has(Number(item.groupId))),
    settlementPayments: (db.settlementPayments || []).filter((item) => visibleIds.has(Number(item.groupId))),
    groupInvites: (db.groupInvites || []).filter((item) => visibleIds.has(Number(item.groupId))),
    recurringExpenses: (db.recurringExpenses || []).filter((item) => visibleIds.has(Number(item.groupId))),
    expenseComments: (db.expenseComments || []).filter((item) => visibleIds.has(Number(item.groupId))),
    activityLogs: (db.activityLogs || []).filter((item) => visibleIds.has(Number(item.groupId))),
    webPushSubscriptions: (db.webPushSubscriptions || []).filter((item) => Number(item.userId) === currentUserId),
  };
}

export function resolveMemberUserIdByEmail(db, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const user = (db.users || []).find((item) => normalizeEmail(item.email) === normalized);
  return user ? Number(user.id) : null;
}
