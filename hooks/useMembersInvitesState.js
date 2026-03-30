import { useCallback, useState } from "react";

const EMPTY_MEMBER_FORM = {
  name: "",
  email: "",
  phone: "",
  upiId: "",
  role: "member",
};

const EMPTY_MEMBER_EDIT_MODAL = {
  open: false,
  memberId: null,
  name: "",
  email: "",
  phone: "",
  upiId: "",
};

const EMPTY_INVITE_FORM = {
  email: "",
  role: "member",
};

export default function useMembersInvitesState({
  selectedGroupId,
  selectedGroup,
  canManageMembers,
  canInviteMembers,
  apiRequest,
  loadOverview,
  loadGroupDetail,
  clearMessages,
  setBusy,
  setError,
  setNotice,
}) {
  const [memberForm, setMemberForm] = useState(EMPTY_MEMBER_FORM);
  const [memberEditModal, setMemberEditModal] = useState(EMPTY_MEMBER_EDIT_MODAL);
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE_FORM);
  const [latestInviteLink, setLatestInviteLink] = useState("");

  const handleAddMember = useCallback(
    async (event) => {
      event.preventDefault();
      if (!selectedGroupId || !canManageMembers) return;

      clearMessages();
      setBusy(true);

      try {
        await apiRequest(`/api/groups/${selectedGroupId}/members`, {
          method: "POST",
          body: JSON.stringify(memberForm),
        });

        setMemberForm(EMPTY_MEMBER_FORM);
        setNotice("Member added");
        await loadOverview();
        await loadGroupDetail(selectedGroupId);
      } catch (err) {
        setError(err.message || "Failed to add member");
      } finally {
        setBusy(false);
      }
    },
    [
      selectedGroupId,
      canManageMembers,
      clearMessages,
      setBusy,
      apiRequest,
      memberForm,
      setNotice,
      loadOverview,
      loadGroupDetail,
      setError,
    ]
  );

  const openMemberEditModal = useCallback(
  (member) => {
    if (!member) return;
    setMemberEditModal({
      open: true,
      memberId: Number(member.id),
      name: String(member.name || ""),
      email: String(member.email || ""),
      phone: String(member.phone || ""),
      upiId: String(member.upiId || ""),
    });
  },
  []
);
  const handleSubmitMemberEdit = useCallback(
    async (event) => {
      event.preventDefault();
      if (!selectedGroupId || !memberEditModal.memberId || !canManageMembers) return;

      clearMessages();
      setBusy(true);

      try {
        await apiRequest(`/api/groups/${selectedGroupId}/members/${memberEditModal.memberId}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: String(memberEditModal.name || "").trim(),
            email: String(memberEditModal.email || "").trim(),
            phone: String(memberEditModal.phone || "").trim(),
            upiId: String(memberEditModal.upiId || "").trim(),
          }),
        });
        setNotice("Member updated");
        setMemberEditModal(EMPTY_MEMBER_EDIT_MODAL);
        await loadOverview();
        await loadGroupDetail(selectedGroupId);
      } catch (err) {
        setError(err.message || "Failed to update member");
      } finally {
        setBusy(false);
      }
    },
    [
      selectedGroupId,
      memberEditModal,
      canManageMembers,
      clearMessages,
      setBusy,
      apiRequest,
      setNotice,
      loadOverview,
      loadGroupDetail,
      setError,
    ]
  );

  const handleDeleteMember = useCallback(
    async (member) => {
      if (!selectedGroupId || !member || !canManageMembers) return;
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(`Remove ${member.name} from this group?`);
        if (!confirmed) return;
      }

      clearMessages();
      setBusy(true);

      try {
        await apiRequest(`/api/groups/${selectedGroupId}/members/${member.id}`, {
          method: "DELETE",
        });
        setNotice("Member removed");
        await loadOverview();
        await loadGroupDetail(selectedGroupId);
      } catch (err) {
        setError(err.message || "Failed to remove member");
      } finally {
        setBusy(false);
      }
    },
    [
      selectedGroupId,
      canManageMembers,
      clearMessages,
      setBusy,
      apiRequest,
      setNotice,
      loadOverview,
      loadGroupDetail,
      setError,
    ]
  );

  const handleChangeMemberRole = useCallback(
    async (member, role) => {
      if (!selectedGroupId || !member || !canManageMembers) return;

      clearMessages();
      setBusy(true);

      try {
        await apiRequest(`/api/groups/${selectedGroupId}/members/${member.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            role,
          }),
        });
        setNotice(`Updated role for ${member.name}`);
        await loadGroupDetail(selectedGroupId);
      } catch (err) {
        setError(err.message || "Failed to update member role");
      } finally {
        setBusy(false);
      }
    },
    [
      selectedGroupId,
      canManageMembers,
      clearMessages,
      setBusy,
      apiRequest,
      setNotice,
      loadGroupDetail,
      setError,
    ]
  );

  const handleCreateInvite = useCallback(
    async (event) => {
      event.preventDefault();
      if (!selectedGroupId || !canInviteMembers) return;

      clearMessages();
      setBusy(true);

      try {
        const body = await apiRequest(`/api/groups/${selectedGroupId}/invites`, {
          method: "POST",
          body: JSON.stringify(inviteForm),
        });

        setInviteForm(EMPTY_INVITE_FORM);
        setLatestInviteLink(body.inviteLink || "");
        const delivery = body.invite?.emailDelivery || null;
        if (delivery?.status === "sent") {
          setNotice("Invite created and email sent.");
        } else if (delivery?.status === "failed") {
          setNotice(
            `Invite created, but email was not sent: ${delivery.message || "Email delivery failed"}. Share the invite link manually.`
          );
        } else {
          setNotice("Invite created. Share the invite link manually.");
        }
        await loadGroupDetail(selectedGroupId);
      } catch (err) {
        setError(err.message || "Failed to create invite");
      } finally {
        setBusy(false);
      }
    },
    [
      selectedGroupId,
      canInviteMembers,
      clearMessages,
      setBusy,
      apiRequest,
      inviteForm,
      setNotice,
      loadGroupDetail,
      setError,
    ]
  );

  const handleCopyInviteLink = useCallback(async () => {
    if (!latestInviteLink) return;

    try {
      await navigator.clipboard.writeText(latestInviteLink);
      setNotice("Invite link copied");
    } catch {
      setError("Could not copy invite link");
    }
  }, [latestInviteLink, setNotice, setError]);

  const handleShareInviteOnWhatsApp = useCallback(() => {
    if (!latestInviteLink) return;
    if (typeof window === "undefined") return;

    const groupName = selectedGroup?.name || "Expense Split group";
    const text = `Join "${groupName}" on Expense Split: ${latestInviteLink}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setNotice("Opened WhatsApp share.");
  }, [latestInviteLink, selectedGroup, setNotice]);

  const handleUpdateInvite = useCallback(
    async (invite, payload) => {
      if (!selectedGroupId || !invite || !canInviteMembers) return;

      clearMessages();
      setBusy(true);

      try {
        await apiRequest(`/api/groups/${selectedGroupId}/invites/${invite.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });

        setNotice("Invite updated");
        await loadGroupDetail(selectedGroupId);
      } catch (err) {
        setError(err.message || "Failed to update invite");
      } finally {
        setBusy(false);
      }
    },
    [
      selectedGroupId,
      canInviteMembers,
      clearMessages,
      setBusy,
      apiRequest,
      setNotice,
      loadGroupDetail,
      setError,
    ]
  );

  const handleDeleteInvite = useCallback(
    async (invite) => {
      if (!selectedGroupId || !invite || !canInviteMembers) return;
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(`Delete invite for ${invite.email}?`);
        if (!confirmed) return;
      }

      clearMessages();
      setBusy(true);

      try {
        await apiRequest(`/api/groups/${selectedGroupId}/invites/${invite.id}`, {
          method: "DELETE",
        });

        setNotice("Invite deleted");
        await loadGroupDetail(selectedGroupId);
      } catch (err) {
        setError(err.message || "Failed to delete invite");
      } finally {
        setBusy(false);
      }
    },
    [
      selectedGroupId,
      canInviteMembers,
      clearMessages,
      setBusy,
      apiRequest,
      setNotice,
      loadGroupDetail,
      setError,
    ]
  );

  return {
    memberForm,
    setMemberForm,
    memberEditModal,
    setMemberEditModal,
    inviteForm,
    setInviteForm,
    latestInviteLink,
    setLatestInviteLink,
    handleAddMember,
    openMemberEditModal,
    handleSubmitMemberEdit,
    handleDeleteMember,
    handleChangeMemberRole,
    handleCreateInvite,
    handleCopyInviteLink,
    handleShareInviteOnWhatsApp,
    handleUpdateInvite,
    handleDeleteInvite,
    resetMemberInviteState: () => {
      setLatestInviteLink("");
    },
  };
}
