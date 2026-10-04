import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { VolunteerMember } from '../../types';

export const VolunteerApprovals: React.FC = () => {
  const { currentUser, volunteers, pendingVolunteers, approveVolunteer, rejectVolunteer } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [ackChecked, setAckChecked] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [decisionAlert, setDecisionAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const authorizedCount = volunteers.length;

  const [selectedVolId, setSelectedVolId] = useState<string>(() => {
    return pendingVolunteers[0]?.id || '';
  });

  // Ensure selected volunteer tracks current pending queue
  const selectedVolunteer: VolunteerMember | undefined =
    pendingVolunteers.find(v => v.id === selectedVolId) ||
    pendingVolunteers[0];

  const filteredPending = pendingVolunteers.filter(
    v =>
      v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleApprove = async () => {
    if (!selectedVolunteer || isSubmitting) return;
    if (!ackChecked) {
      setDecisionAlert({
        type: 'error',
        message: 'Officer verification acknowledgement is mandatory before authorizing dispatch privileges.',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      await approveVolunteer(selectedVolunteer.id);
      setDecisionAlert({
        type: 'success',
        message: `Volunteer ${selectedVolunteer.name} has been authorized and issued active deployment credentials.`,
      });
    } catch (err: any) {
      setDecisionAlert({
        type: 'error',
        message: err.message || 'Failed to authorize volunteer.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selectedVolunteer || isSubmitting) return;
    if (confirm(`Confirm rejection of application for ${selectedVolunteer.name}?`)) {
      try {
        setIsSubmitting(true);
        await rejectVolunteer(selectedVolunteer.id);
        setDecisionAlert({
          type: 'error',
          message: `Application for ${selectedVolunteer.name} was rejected.`,
        });
      } catch (err: any) {
        setDecisionAlert({
          type: 'error',
          message: err.message || 'Failed to reject volunteer.',
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* Top Alert & Page Context Bar */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-1 text-left">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded bg-[#eff4ff] text-[10px] font-bold text-[#0051d5] uppercase tracking-wider">
              CIVIC VETTING GATEWAY
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#ffdad6] text-[#ba1a1a] text-[10px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ba1a1a] animate-ping" />
              {pendingVolunteers.length} Pending Verification
            </span>
          </div>
          <h1 className="text-3xl font-bold text-[#0b1c30] tracking-tight font-display">
            Volunteer Approvals
          </h1>
          <p className="text-sm text-[#45464d] max-w-2xl">
            Review and authorize civic volunteer applications prior to active dispatch deployment across tactical zones.
          </p>
        </div>

        {/* Quick Metrics Strip */}
        <div className="flex items-center gap-2 bg-white p-2 rounded-xl shadow-xs border border-[#e2e8f0]">
          <div className="flex items-center gap-2 px-3 py-1">
            <div className="w-8 h-8 rounded bg-[#eff4ff] flex items-center justify-center text-[#0051d5]">
              <span className="material-symbols-outlined text-[18px]">verified_user</span>
            </div>
            <div className="flex flex-col text-left">
              <span className="text-base font-bold text-[#0b1c30] leading-none">{authorizedCount}</span>
              <span className="text-[10px] text-[#76777d] uppercase font-bold">Authorized</span>
            </div>
          </div>

          <div className="w-px h-8 bg-[#e2e8f0]" />

          <div className="flex items-center gap-2 px-3 py-1">
            <div className="w-8 h-8 rounded bg-[#ffdad6] flex items-center justify-center text-[#ba1a1a]">
              <span className="material-symbols-outlined text-[18px]">pending_actions</span>
            </div>
            <div className="flex flex-col text-left">
              <span className="text-base font-bold text-[#ba1a1a] leading-none">
                0{pendingVolunteers.length}
              </span>
              <span className="text-[10px] text-[#76777d] uppercase font-bold">Awaiting Action</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Workspace Layout: List Panel + Review Card */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Primary Applications Table Section (7 Cols) */}
        <div className="xl:col-span-7 flex flex-col gap-4">
          {/* Filter & Search Toolbar */}
          <div className="bg-white rounded-xl p-3.5 shadow-xs border border-[#e2e8f0] flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#76777d] text-[18px]">
                search
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Filter by name, ID or badge..."
                className="w-full bg-[#eff4ff] pl-9 pr-3 py-1.5 rounded-lg text-xs text-[#0b1c30] placeholder:text-[#76777d] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0051d5] transition-all border border-transparent"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <span className="text-xs text-[#76777d] font-semibold">Queue: Pending ({pendingVolunteers.length})</span>
            </div>
          </div>

          {/* Verification Table */}
          <div className="bg-white rounded-xl shadow-xs border border-[#e2e8f0] overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-[#eff4ff] text-[#45464d] text-[11px] uppercase tracking-wider border-b border-[#dce9ff]">
                    <th className="py-3 px-4 font-bold">Applicant Name</th>
                    <th className="py-3 px-3 font-bold hidden md:table-cell">Contact</th>
                    <th className="py-3 px-3 font-bold">Submitted</th>
                    <th className="py-3 px-3 font-bold">Status</th>
                    <th className="py-3 px-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9] text-sm">
                  {filteredPending.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-xs text-[#76777d]">
                        No pending volunteer applications in queue.
                      </td>
                    </tr>
                  ) : (
                    filteredPending.map(vol => {
                      const isSelected = selectedVolunteer?.id === vol.id;

                      return (
                        <tr
                          key={vol.id}
                          onClick={() => {
                            setSelectedVolId(vol.id);
                            setDecisionAlert(null);
                          }}
                          className={`transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-[#dce9ff]/50 hover:bg-[#dce9ff]/70'
                              : 'hover:bg-[#f8f9ff]'
                          }`}
                        >
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-[#0051d5] text-white flex items-center justify-center font-bold text-xs shrink-0">
                                {vol.avatarInitials}
                              </div>
                              <div className="flex flex-col text-left">
                                <span className="font-bold text-xs text-[#0b1c30]">
                                  {vol.name}
                                </span>
                                <span className="text-[10px] text-[#0051d5] font-semibold">
                                  ID: {vol.id}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-3 hidden md:table-cell text-left">
                            <div className="flex flex-col">
                              <span className="text-xs text-[#0b1c30] truncate max-w-[160px]">
                                {vol.email}
                              </span>
                              <span className="text-[10px] text-[#76777d]">{vol.phone}</span>
                            </div>
                          </td>

                          <td className="py-3.5 px-3 text-xs text-[#0b1c30] font-medium text-left">
                            {vol.submittedAt}
                          </td>

                          <td className="py-3.5 px-3 text-left">
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#ffdad6] text-[#ba1a1a] text-[10px] font-bold uppercase">
                              Pending
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedVolId(vol.id);
                                setDecisionAlert(null);
                              }}
                              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                                isSelected
                                  ? 'bg-[#000000] text-white shadow-xs'
                                  : 'bg-[#eff4ff] text-[#0b1c30] hover:bg-[#dce9ff]'
                              }`}
                            >
                              Review
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-[#eff4ff] border-t border-[#dce9ff] flex items-center justify-between text-xs text-[#76777d]">
              <span>Showing {filteredPending.length} pending candidate(s)</span>
              <span className="text-[11px] font-semibold text-[#0051d5]">Strict Vetting Protocol Active</span>
            </div>
          </div>
        </div>

        {/* Quick-Action Volunteer Review Card (5 Cols) */}
        <div className="xl:col-span-5 flex flex-col gap-4 text-left">
          {selectedVolunteer ? (
            <div className="bg-white rounded-xl shadow-xs border border-[#e2e8f0] p-5 flex flex-col gap-4">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-[#0051d5] text-white flex items-center justify-center font-bold text-lg shadow-sm">
                    {selectedVolunteer.avatarInitials}
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-base font-bold text-[#0b1c30] font-display">
                        {selectedVolunteer.name}
                      </h2>
                      <span className="material-symbols-outlined text-[#0051d5] text-[18px]">verified</span>
                    </div>
                    <span className="text-xs text-[#45464d]">{selectedVolunteer.roleDescription}</span>
                    <span className="text-[11px] text-[#0051d5] font-mono mt-0.5">
                      AUTH-TOKEN: SAH-V-{selectedVolunteer.id.replace(/\D/g, '') || '9024'}
                    </span>
                  </div>
                </div>

                <span className="px-2 py-0.5 rounded bg-[#dbe1ff] text-[#0051d5] text-[10px] font-bold uppercase">
                  VETTING
                </span>
              </div>

              {/* Profile Metadata Breakdown */}
              <div className="grid grid-cols-2 gap-2.5 bg-[#eff4ff] p-3 rounded-lg border border-[#dce9ff]/60 text-left">
                <div>
                  <span className="text-[10px] text-[#76777d] uppercase font-bold block">Email Address</span>
                  <span className="text-xs text-[#0b1c30] font-semibold block truncate">
                    {selectedVolunteer.email}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#76777d] uppercase font-bold block">Contact Phone</span>
                  <span className="text-xs text-[#0b1c30] font-semibold block">
                    {selectedVolunteer.phone}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#76777d] uppercase font-bold block">Application Date</span>
                  <span className="text-xs text-[#0b1c30] font-semibold block">
                    {selectedVolunteer.applicationDate}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#76777d] uppercase font-bold block">Submission Slot</span>
                  <span className="text-xs text-[#0b1c30] font-semibold block">
                    {selectedVolunteer.submissionSlot}
                  </span>
                </div>
              </div>

              {/* Background Verification Checklist */}
              <div className="bg-[#f8f9ff] p-3.5 rounded-lg border border-[#e2e8f0] flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase font-bold text-[#0b1c30] tracking-wider">
                    Statutory Verification Checks
                  </span>
                  <span className="text-[10px] text-[#0051d5] font-bold">Ready for Sign-off</span>
                </div>

                <div className="flex flex-col gap-1.5 text-xs text-[#0b1c30]">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-[#0051d5]">check_circle</span>
                    <span>Criminal Record Registry: <strong className="font-semibold">{selectedVolunteer.registryCheck}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-[#0051d5]">check_circle</span>
                    <span>Civil Protection & Good Conduct Declaration</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-[#0051d5]">check_circle</span>
                    <span>Emergency First Responder / Vehicle License Validation</span>
                  </div>
                </div>

                {/* Mandatory Acknowledgement Box */}
                <label className="flex items-start gap-2 mt-2 pt-2 border-t border-[#e2e8f0] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={ackChecked}
                    onChange={e => setAckChecked(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-[#0051d5] focus:ring-0 cursor-pointer"
                  />
                  <span className="text-[11px] text-[#45464d] leading-tight">
                    I, {currentUser?.name || 'Authorized Officer'}, confirm that physical documents and state identification have been verified in accordance with Dispatch Protocol Directive 11-A.
                  </span>
                </label>
              </div>

              {/* Assigned Staging Sector Viewport */}
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-[#76777d] uppercase">Assigned Staging Sector</span>
                <div className="w-full h-24 rounded-lg bg-[#e5eeff] relative overflow-hidden flex items-center justify-center border border-[#cbd5e1]">
                  <div
                    className="absolute inset-0 opacity-30"
                    style={{
                      backgroundImage: `radial-gradient(#0051d5 1px, transparent 1px)`,
                      backgroundSize: '16px 16px',
                    }}
                  />
                  <div className="relative z-10 px-3 py-1 bg-white/90 backdrop-blur-xs rounded font-semibold text-xs text-[#0b1c30] shadow-xs border border-[#e2e8f0]">
                    {selectedVolunteer.zone}
                  </div>
                </div>
              </div>

              {/* Primary Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 px-3 rounded-lg bg-[#0051d5] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#003ea8] transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">how_to_reg</span>
                  <span>{isSubmitting ? 'PROCESSING...' : 'APPROVE VOLUNTEER'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleReject}
                  disabled={isSubmitting}
                  className="py-2.5 px-3 rounded-lg bg-[#eff4ff] text-[#ba1a1a] hover:bg-[#ffdad6] text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">cancel</span>
                  <span>REJECT</span>
                </button>
              </div>

              {/* Decision Alert */}
              {decisionAlert && (
                <div
                  className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
                    decisionAlert.type === 'success'
                      ? 'bg-[#dce9ff] text-[#0051d5]'
                      : 'bg-[#ffdad6] text-[#ba1a1a]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {decisionAlert.type === 'success' ? 'check_circle' : 'error'}
                  </span>
                  <span>{decisionAlert.message}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-xs border border-[#e2e8f0] p-8 text-center text-xs text-[#76777d]">
              No volunteer selected for review.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
