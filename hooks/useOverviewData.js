import { useCallback, useEffect, useState } from "react";
import { EMPTY_CONFIG_HEALTH } from "@/lib/dashboardUtils";

const EMPTY_ANALYTICS = {
  metrics: {
    totalGroups: 0,
    totalMembers: 0,
    totalExpenses: 0,
    totalSpent: 0,
    pendingSettlements: 0,
  },
  topPayers: [],
};

export default function useOverviewData(apiRequest, onError) {
  const [groups, setGroups] = useState([]);
  const [analytics, setAnalytics] = useState(EMPTY_ANALYTICS);
  const [configHealth, setConfigHealth] = useState(EMPTY_CONFIG_HEALTH);
  const [loading, setLoading] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);

    try {
      const [groupsBody, analyticsBody, configBody] = await Promise.all([
        apiRequest("/api/groups"),
        apiRequest("/api/analytics"),
        apiRequest("/api/health/config").catch(() => null),
      ]);

      setGroups(groupsBody.groups || []);
      setAnalytics(analyticsBody);
      setConfigHealth(configBody || EMPTY_CONFIG_HEALTH);

      setSelectedGroupId((previous) => {
        if (previous && (groupsBody.groups || []).some((group) => group.id === previous)) {
          return previous;
        }
        return groupsBody.groups?.[0]?.id ?? null;
      });
    } catch (err) {
      onError(err.message || "Could not load data");
    } finally {
      setLoading(false);
    }
  }, [apiRequest, onError]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  return {
    groups,
    analytics,
    configHealth,
    loading,
    selectedGroupId,
    setSelectedGroupId,
    loadOverview,
  };
}
