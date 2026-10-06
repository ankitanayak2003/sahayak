import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { VolunteerMember } from '../../types';

export const VolunteerManagement: React.FC = () => {
  const { volunteers, refreshVolunteers } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ON BREAK' | 'INACTIVE'>('ALL');
  const [messageModalVolunteer, setMessageModalVolunteer] = useState<VolunteerMember | null>(null);
  const [directMessageText, setDirectMessageText] = useState('');
  const [messageSent, setMessageSent] = useState(false);

  useEffect(() => {
    refreshVolunteers();
  }, [refreshVolunteers]);

  // Filter roster
  const activeRoster = volunteers.filter(v => v.accountStatus === 'active');
  const currentlyDeployed = activeRoster.filter(v => v.activeAssignments > 0).length;
  const availableCount = activeRoster.filter(v => v.isAvailable === true).length;

  const filteredVolunteers = activeRoster.filter(vol => {
    const matchesSearch =
      vol.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vol.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vol.email.toLowerCase().includes(searchTerm.toLowerCase());

    const isVolActive = vol.isAvailable === true;
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && isVolActive) ||
      (statusFilter === 'ON BREAK' && vol.status === 'On Break') ||
      (statusFilter === 'INACTIVE' && !isVolActive);

    return matchesSearch && matchesStatus;
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!directMessageText.trim()) return;
    setMessageSent(true);
    setTimeout(() => {
      setMessageSent(false);
      setDirectMessageText('');
      setMessageModalVolunteer(null);
    }, 1500);
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* Dispatch Direct Message Modal */}
      {messageModalVolunteer && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-[#e2e8f0]">
            <div className="flex items-center justify-between pb-3 border-b border-[#f1f5f9]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#0051d5] text-[20px]">chat</span>
                <h3 className="text-base font-bold text-[#0b1c30] font-display">
                  Direct Dispatch Message
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setMessageModalVolunteer(null)}
                className="text-[#76777d] hover:text-[#0b1c30]"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="my-3 p-2.5 bg-[#eff4ff] rounded-lg flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#0051d5] text-white flex items-center justify-center font-bold text-xs">
                {messageModalVolunteer.avatarInitials}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs font-bold text-[#0b1c30]">{messageModalVolunteer.name}</span>
                <span className="text-[10px] text-[#76777d]">{messageModalVolunteer.certification}</span>
              </div>
            </div>

            {messageSent ? (
              <div className="p-3 bg-[#dce9ff] text-[#0051d5] text-xs font-semibold rounded-lg flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">verified</span>
                <span>Encrypted telemetry transmission acknowledged by field unit.</span>
              </div>
            ) : (
              <form onSubmit={handleSendMessage} className="flex flex-col gap-3">
                <textarea
                  required
                  rows={3}
                  value={directMessageText}
                  onChange={e => setDirectMessageText(e.target.value)}
                  placeholder="Enter direct dispatch instructions or staging advisory..."
                  className="w-full p-3 rounded-lg bg-[#f8f9ff] text-xs text-[#0b1c30] border border-[#cbd5e1] focus:outline-none focus:ring-2 focus:ring-[#0051d5]"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setMessageModalVolunteer(null)}
                    className="px-3 py-1.5 text-xs text-[#45464d] hover:bg-[#eff4ff] rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-[#0051d5] text-white text-xs font-bold rounded-lg hover:bg-[#003ea8] transition-colors"
                  >
                    Transmit Dispatch Note
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Header Section with Operational Metric Pills */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-xl shadow-xs border border-[#e2e8f0]">
        <div className="flex flex-col gap-1 text-left">
          <div className="flex items-center gap-1.5 text-[#0051d5]">
            <span className="material-symbols-outlined text-[20px]">badge</span>
            <span className="text-[11px] font-bold uppercase tracking-wider">Field Personnel Registry</span>
          </div>
          <h1 className="text-3xl font-bold text-[#0b1c30] tracking-tight font-display">
            Volunteer Management
          </h1>
          <p className="text-sm text-[#45464d]">
            Active civic volunteer registry and live availability status
          </p>
        </div>

        {/* Quick Metrics Strip */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2.5 px-4 py-2 bg-[#eff4ff] rounded-lg border border-[#dce9ff]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#76777d]" />
            <div className="flex flex-col text-left">
              <span className="text-[10px] text-[#76777d] uppercase font-bold leading-none">Total Roster</span>
              <span className="text-sm font-bold text-[#0b1c30] leading-tight">{activeRoster.length}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 px-4 py-2 bg-[#eff4ff] rounded-lg border border-[#dce9ff]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0051d5] animate-pulse" />
            <div className="flex flex-col text-left">
              <span className="text-[10px] text-[#0051d5] uppercase font-bold leading-none">Currently Deployed</span>
              <span className="text-sm font-bold text-[#0051d5] leading-tight">
                {currentlyDeployed}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 px-4 py-2 bg-[#eff4ff] rounded-lg border border-[#dce9ff]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#000000]" />
            <div className="flex flex-col text-left">
              <span className="text-[10px] text-[#76777d] uppercase font-bold leading-none">Available</span>
              <span className="text-sm font-bold text-[#0b1c30] leading-tight">
                {availableCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Dispatch Query Bar */}
      <div className="bg-white p-3.5 rounded-xl shadow-xs border border-[#e2e8f0] flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-96 flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-[#76777d] text-[20px] pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search volunteer by name or ID..."
            className="w-full pl-10 pr-3 py-2 bg-[#eff4ff] rounded-lg text-xs text-[#0b1c30] placeholder:text-[#76777d] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0051d5] transition-all border border-transparent"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <span className="text-xs text-[#45464d] whitespace-nowrap font-medium">Filter Status:</span>
          <div className="relative inline-block w-full md:w-44">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="w-full appearance-none bg-[#eff4ff] px-3 py-2 pr-8 rounded-lg text-xs font-semibold text-[#0b1c30] focus:outline-none cursor-pointer border border-transparent"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="ON BREAK">On Break</option>
              <option value="INACTIVE">Inactive</option>
            </select>
            <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[#76777d] text-[18px] pointer-events-none">
              unfold_more
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setStatusFilter('ALL');
            }}
            title="Reset View"
            className="p-2 bg-[#eff4ff] hover:bg-[#dce9ff] rounded-lg text-[#45464d] hover:text-[#0b1c30] transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>
        </div>
      </div>

      {/* Data Table Card Container */}
      <div className="bg-white rounded-xl shadow-xs border border-[#e2e8f0] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[#eff4ff] text-[#45464d] text-[11px] uppercase tracking-wider border-b border-[#dce9ff]">
                <th className="py-3 px-5 font-bold">Volunteer</th>
                <th className="py-3 px-4 font-bold">Verification</th>
                <th className="py-3 px-4 font-bold">Readiness</th>
                <th className="py-3 px-4 font-bold">Current Workload</th>
                <th className="py-3 px-4 font-bold">Status</th>
                <th className="py-3 px-5 font-bold">Contact</th>
                <th className="py-3 px-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9] text-sm text-[#0b1c30]">
              {filteredVolunteers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-[#76777d]">
                    No volunteers matching query.
                  </td>
                </tr>
              ) : (
                filteredVolunteers.map(vol => {
                  const isAvailable = vol.isAvailable === true;

                  return (
                    <tr key={vol.id} className="hover:bg-[#f8f9ff] transition-colors">
                      {/* Volunteer ID & Name */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#0051d5] text-white flex items-center justify-center font-bold text-xs shrink-0">
                            {vol.avatarInitials}
                          </div>
                          <div className="flex flex-col text-left">
                            <span className="font-bold text-xs text-[#0b1c30]">{vol.name}</span>
                            <span className="text-[11px] text-[#76777d] font-mono">ID {vol.id}</span>
                          </div>
                        </div>
                      </td>

                      {/* Verification */}
                      <td className="py-3.5 px-4 text-left">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#dbe1ff] text-[#0051d5]">
                          <span className="material-symbols-outlined text-[14px]">verified</span>
                          <span>Verified</span>
                        </span>
                      </td>

                      {/* Readiness */}
                      <td className="py-3.5 px-4 text-left">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            isAvailable
                              ? 'bg-[#eff4ff] text-[#0051d5]'
                              : 'bg-[#ffdad6] text-[#ba1a1a]'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isAvailable ? 'bg-[#0051d5] animate-pulse' : 'bg-[#ba1a1a]'
                            }`}
                          />
                          {isAvailable ? 'On Duty' : 'Off Duty'}
                        </span>
                      </td>

                      {/* Current Workload / Queue count */}
                      <td className="py-3.5 px-4 text-left">
                        {vol.activeAssignments > 0 ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#dce9ff] rounded text-xs text-[#0051d5] font-semibold">
                            <span className="material-symbols-outlined text-[15px]">assignment</span>
                            <span>{vol.activeAssignments} active/queued</span>
                          </div>
                        ) : (
                          <span className="text-xs text-[#76777d]">0 active/queued</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-left">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            isAvailable
                              ? 'bg-[#eff4ff] text-[#0051d5]'
                              : 'bg-[#f1f5f9] text-[#76777d]'
                          }`}
                        >
                          {vol.status}
                        </span>
                      </td>

                    {/* Contact */}
                    <td className="py-3.5 px-5 text-left">
                      <a
                        href={`mailto:${vol.email}`}
                        className="flex items-center gap-1.5 text-xs text-[#0b1c30] hover:text-[#0051d5] transition-colors"
                      >
                        <span className="material-symbols-outlined text-[15px] text-[#76777d]">mail</span>
                        <span>{vol.email}</span>
                      </a>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setMessageModalVolunteer(vol)}
                        title="Dispatch Direct Message"
                        className="p-1.5 rounded hover:bg-[#eff4ff] text-[#76777d] hover:text-[#0b1c30] transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[18px]">chat_bubble_outline</span>
                      </button>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination & Summary Footer */}
        <div className="px-5 py-3 bg-[#eff4ff] border-t border-[#dce9ff] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#45464d]">
          <span>
            Showing <span className="font-bold text-[#0b1c30]">{filteredVolunteers.length}</span> of {activeRoster.length} active roster records
          </span>

          <div className="flex items-center gap-1">
            <button
              disabled
              type="button"
              className="px-2.5 py-1 rounded bg-white border border-[#e2e8f0] text-[#76777d] opacity-50 cursor-not-allowed"
            >
              Previous
            </button>
            <button
              type="button"
              className="px-2.5 py-1 rounded bg-[#000000] text-white font-bold"
            >
              1
            </button>
            <button
              type="button"
              className="px-2.5 py-1 rounded bg-white border border-[#e2e8f0] text-[#0b1c30] hover:bg-[#f8f9ff]"
            >
              2
            </button>
            <button
              type="button"
              className="px-2.5 py-1 rounded bg-white border border-[#e2e8f0] text-[#0b1c30] hover:bg-[#f8f9ff]"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
