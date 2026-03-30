import { useCallback, useEffect, useState } from "react";

export default function useGroupDetail(apiRequest, onError, selectedGroupId) {
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedGroupPermissions, setSelectedGroupPermissions] = useState(null);

  const loadGroupDetail = useCallback(
    async (groupId) => {
      if (!groupId) {
        setSelectedGroup(null);
        setSelectedGroupPermissions(null);
        return;
      }

      try {
        const body = await apiRequest(`/api/groups/${groupId}`);
        setSelectedGroup(body.group);
        setSelectedGroupPermissions(body.permissions || null);
      } catch (err) {
        onError(err.message || "Could not load selected group");
      }
    },
    [apiRequest, onError]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadGroupDetail(selectedGroupId);
  }, [selectedGroupId, loadGroupDetail]);

  return {
    selectedGroup,
    selectedGroupPermissions,
    loadGroupDetail,
  };
}
