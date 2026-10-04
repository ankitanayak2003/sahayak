import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export const VolunteerRequests: React.FC = () => {
  const { requests, navigate, updateRequestStatus } = useApp();
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'queued' | 'inprogress' | 'resolved'>('all');
  const [guidelinesModalOpen, setGuidelinesModalOpen] = useState(false);

  const pendingRequests = requests.filter(r => r.status === 'Assigned');
  const queuedRequests = requests.filter(r => r.status === 'Queued');
  const inProgressRequests = requests.filter(r => r.status === 'In Progress' || r.status === 'Accepted');
  const resolvedRequests = requests.filter(r => r.status === 'Resolved');

  const filteredItems = requests.filter(item => {
    if (activeTab === 'all') return true;
    if (activeTab === 'pending') return item.status === 'Assigned';
    if (activeTab === 'queued') return item.status === 'Queued';
    if (activeTab === 'inprogress') return item.status === 'In Progress' || item.status === 'Accepted';
    if (activeTab === 'resolved') return item.status === 'Resolved';
    return true;
  });

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* Emergency Guidelines Modal */}
      {guidelinesModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 border border-[#e2e8f0]">
            <div className="flex items-center justify-between pb-3 border-b border-[#f1f5f9]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#0051d5] text-2xl">menu_book</span>
                <h3 className="text-base font-bold text-[#0b1c30] font-display">
                  Volunteer Emergency Protocol Guidelines
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setGuidelinesModalOpen(false)}
                className="text-[#76777d] hover:text-[#0b1c30]"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="my-4 text-xs text-[#45464d] space-y-3 leading-relaxed text-left">
              <div className="p-3 bg-[#eff4ff] rounded-lg">
                <span className="font-bold text-[#0b1c30] block mb-1">1. Rapid Acknowledgment</span>
                <span>Review and acknowledge assignments within 5 minutes of telemetry broadcast.</span>
              </div>
              <div className="p-3 bg-[#eff4ff] rounded-lg">
                <span className="font-bold text-[#0b1c30] block mb-1">2. Scene Safety & Good Samaritan Protection</span>
                <span>Ensure your own safety before entering any hazard perimeter. Civilian assistance laws protect responders acting in good faith.</span>
              </div>
              <div className="p-3 bg-[#eff4ff] rounded-lg">
                <span className="font-bold text-[#0b1c30] block mb-1">3. Handover Protocol</span>
                <span>When ambulance or fire crews arrive, give a concise verbal summary of interventions and mark the task resolved in the console.</span>
              </div>
            </div>

            <div className="pt-2 border-t border-[#f1f5f9] flex justify-end">
              <button
                type="button"
                onClick={() => setGuidelinesModalOpen(false)}
                className="px-4 py-2 bg-[#0051d5] text-white rounded-lg text-xs font-semibold hover:bg-[#003ea8]"
              >
                Acknowledged
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-1 text-left">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-[#0051d5]" />
            <span className="text-[11px] font-bold text-[#76777d] uppercase tracking-wider">
              Responder Telemetry • Station 04
            </span>
          </div>
          <h1 className="text-3xl font-bold text-[#0b1c30] tracking-tight font-display">
            My Requests
          </h1>
          <p className="text-sm text-[#45464d]">
            Overview of your assigned, active, and completed emergency tasks
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white px-3.5 py-1.5 rounded-xl shadow-xs border border-[#e2e8f0]">
          <span className="material-symbols-outlined text-[18px] text-[#0051d5]">verified_user</span>
          <span className="text-xs text-[#45464d]">Status:</span>
          <span className="text-xs text-[#0051d5] font-bold">On Active Standby</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#0051d5] animate-pulse ml-1" />
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-left">
        <div className="bg-white p-4 rounded-xl shadow-xs border border-[#e2e8f0] flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-[#76777d] uppercase tracking-wider">Total Queue</span>
            <span className="text-3xl font-bold text-[#0b1c30] font-display mt-1">
              {requests.length}
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#45464d]">
            <span className="material-symbols-outlined text-[20px]">assignment</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-xs border border-[#e2e8f0] flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-[#0051d5] uppercase tracking-wider">Action Needed</span>
            <span className="text-3xl font-bold text-[#0051d5] font-display mt-1">
              {pendingRequests.length}
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#dbe1ff] flex items-center justify-center text-[#0051d5]">
            <span className="material-symbols-outlined text-[20px]">notification_important</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-xs border border-[#e2e8f0] flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-[#76777d] uppercase tracking-wider">Active Field</span>
            <span className="text-3xl font-bold text-[#0b1c30] font-display mt-1">
              {inProgressRequests.length}
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#0051d5]">
            <span className="material-symbols-outlined text-[20px]">near_me</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-xs border border-[#e2e8f0] flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-[#76777d] uppercase tracking-wider">Completed Today</span>
            <span className="text-3xl font-bold text-[#45464d] font-display mt-1">
              {resolvedRequests.length}
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#76777d]">
            <span className="material-symbols-outlined text-[20px]">check_circle</span>
          </div>
        </div>
      </div>

      {/* Tabs and Items */}
      <div className="flex flex-col gap-4">
        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-[#eff4ff] p-1 rounded-xl w-fit border border-[#dce9ff]">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'all'
                ? 'bg-white text-[#0b1c30] shadow-xs'
                : 'text-[#45464d] hover:text-[#0b1c30]'
            }`}
          >
            All Requests <span className="opacity-60 text-[11px]">({requests.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-white text-[#0051d5] shadow-xs font-bold'
                : 'text-[#45464d] hover:text-[#0b1c30]'
            }`}
          >
            Pending Acceptance <span className="opacity-60 text-[11px]">({pendingRequests.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('queued')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'queued'
                ? 'bg-white text-[#c2410c] shadow-xs font-bold'
                : 'text-[#45464d] hover:text-[#0b1c30]'
            }`}
          >
            Queued <span className="opacity-60 text-[11px]">({queuedRequests.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('inprogress')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'inprogress'
                ? 'bg-white text-[#0051d5] shadow-xs font-bold'
                : 'text-[#45464d] hover:text-[#0b1c30]'
            }`}
          >
            In Progress <span className="opacity-60 text-[11px]">({inProgressRequests.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('resolved')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'resolved'
                ? 'bg-white text-[#0b1c30] shadow-xs'
                : 'text-[#45464d] hover:text-[#0b1c30]'
            }`}
          >
            Resolved <span className="opacity-60 text-[11px]">({resolvedRequests.length})</span>
          </button>
        </div>

        {/* Requests List */}
        <div className="flex flex-col gap-3">
          {filteredItems.length === 0 ? (
            <div className="p-10 bg-white rounded-xl shadow-xs border border-[#e2e8f0] text-center text-xs text-[#76777d]">
              No emergency requests in this category.
            </div>
          ) : (
            filteredItems.map(item => {
              const isAssigned = item.status === 'Assigned';
              const isQueued = item.status === 'Queued';
              const isInProgress = item.status === 'In Progress' || item.status === 'Accepted';
              const isResolved = item.status === 'Resolved';

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-xl shadow-xs border border-[#e2e8f0] overflow-hidden transition-all hover:shadow-md"
                >
                  <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between p-5 gap-4">
                    <div className="flex items-start gap-3.5 min-w-0 text-left">
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                          isAssigned
                            ? 'bg-[#ffdad6] text-[#ba1a1a]'
                            : isQueued
                            ? 'bg-[#ffedd5] text-[#c2410c]'
                            : isInProgress
                            ? 'bg-[#dce9ff] text-[#0051d5]'
                            : 'bg-[#eff4ff] text-[#76777d]'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[22px]">
                          {isQueued
                            ? 'queue'
                            : item.category === 'Medical'
                            ? 'medical_services'
                            : item.category === 'Accident'
                            ? 'car_crash'
                            : 'emergency'}
                        </span>
                      </div>

                      <div className="flex flex-col min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-xs font-mono font-bold text-[#76777d]">{item.id}</span>
                          <span className="w-1 h-1 rounded-full bg-[#cbd5e1]" />
                          <span className="text-sm font-bold text-[#0b1c30]">{item.title}</span>
                          {isQueued && (
                            <span className="px-2 py-0.5 rounded bg-[#ffedd5] text-[#c2410c] text-[10px] font-bold uppercase font-mono">
                              Queue Pos #{item.queuePosition || 2}
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              item.severity === 'Critical'
                                ? 'bg-[#ffdad6] text-[#ba1a1a]'
                                : item.severity === 'Urgent'
                                ? 'bg-[#ffdad6] text-[#f63a35]'
                                : 'bg-[#eff4ff] text-[#0051d5]'
                            }`}
                          >
                            {item.severity}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-[#45464d]">
                          <span className="inline-flex items-center gap-1">
                            <span className="material-symbols-outlined text-[15px] text-[#0051d5]">location_on</span>
                            <span>{item.location.split('•')[0]}</span>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span className="material-symbols-outlined text-[15px] text-[#76777d]">schedule</span>
                            <span>{item.createdAt}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right side controls */}
                    <div className="flex items-center justify-between w-full lg:w-auto lg:justify-end gap-4 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-[#f1f5f9]">
                      <div className="flex flex-col lg:items-end text-left lg:text-right">
                        <span className="text-[10px] font-bold text-[#76777d] uppercase">Status</span>
                        <div className="inline-flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isAssigned
                                ? 'bg-[#0051d5]'
                                : isInProgress
                                ? 'bg-[#0051d5] animate-pulse'
                                : 'bg-[#76777d]'
                            }`}
                          />
                          <span className="text-xs font-bold text-[#0b1c30]">{item.status}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => navigate('volunteer-request-detail', item.id)}
                          className="px-3.5 py-1.5 rounded-lg bg-[#eff4ff] text-[#0b1c30] text-xs font-semibold hover:bg-[#dce9ff] transition-colors cursor-pointer"
                        >
                          Details
                        </button>

                        {isAssigned ? (
                          <button
                            type="button"
                            onClick={() => navigate('volunteer-request-detail', item.id)}
                            className="px-4 py-1.5 rounded-lg bg-[#000000] text-white text-xs font-bold hover:bg-[#213145] transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[16px]">check_circle</span>
                            <span>Review & Accept</span>
                          </button>
                        ) : isQueued ? (
                          <button
                            type="button"
                            onClick={() => navigate('volunteer-request-detail', item.id)}
                            className="px-4 py-1.5 rounded-lg bg-[#eff4ff] text-[#c2410c] border border-[#fed7aa] text-xs font-bold hover:bg-[#ffedd5] transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[16px]">queue</span>
                            <span>Queued Dossier</span>
                          </button>
                        ) : isInProgress ? (
                          <button
                            type="button"
                            onClick={() => navigate('volunteer-request-detail', item.id)}
                            className="px-4 py-1.5 rounded-lg bg-[#0051d5] text-white text-xs font-bold hover:bg-[#003ea8] transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[16px]">edit_note</span>
                            <span>Update Status</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => navigate('volunteer-request-detail', item.id)}
                            className="px-3.5 py-1.5 rounded-lg bg-[#eff4ff] text-[#45464d] text-xs font-semibold hover:bg-[#dce9ff] transition-colors cursor-pointer"
                          >
                            View Summary
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Volunteer Response Protocol Bottom Banner */}
        <div className="p-4 rounded-xl bg-[#eff4ff] border border-[#dce9ff] flex flex-col md:flex-row items-center justify-between gap-4 text-left">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#dce9ff] flex items-center justify-center text-[#0051d5] shrink-0">
              <span className="material-symbols-outlined text-[20px]">info</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-[#0b1c30]">Volunteer Response Protocol</span>
              <span className="text-xs text-[#45464d]">
                Review all assigned incidents within 5 minutes of dispatch. Contact Central Ops for triage reassignments.
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setGuidelinesModalOpen(true)}
            className="whitespace-nowrap px-3.5 py-1.5 rounded-lg bg-white text-[#0b1c30] text-xs font-bold shadow-xs hover:bg-[#f8f9ff] border border-[#cbd5e1] cursor-pointer"
          >
            Emergency Guidelines
          </button>
        </div>
      </div>
    </div>
  );
};
