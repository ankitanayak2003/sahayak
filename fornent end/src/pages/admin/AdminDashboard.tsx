import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

export const AdminDashboard: React.FC = () => {
  const { requests, volunteers, pendingVolunteers, navigate, refreshRequests, refreshVolunteers, loading, error } = useApp();
  const [filterSeverity, setFilterSeverity] = useState<'All' | 'Critical' | 'Urgent' | 'Normal'>('All');
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [broadcastSent, setBroadcastSent] = useState(false);

  useEffect(() => {
    refreshRequests();
    refreshVolunteers();
  }, [refreshRequests, refreshVolunteers]);

  // Calculate real-time counts from live backend data
  const criticalCount = requests.filter(r => r.severity === 'Critical' && r.status !== 'Resolved').length;
  const urgentCount = requests.filter(r => r.severity === 'Urgent' && r.status !== 'Resolved').length;
  const normalCount = requests.filter(r => r.severity === 'Normal' && r.status !== 'Resolved').length;
  const pendingApprovalsCount = pendingVolunteers.length;
  const activeVolunteersCount = volunteers.filter(v => v.status === 'Active' || v.status === 'On Duty').length;

  const filteredRequests = requests.filter(r => {
    if (filterSeverity === 'All') return true;
    return r.severity === filterSeverity;
  });

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* Broadcast Code Red Modal */}
      {broadcastModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-[#e2e8f0]">
            <div className="flex items-center gap-3 text-[#ba1a1a] mb-3">
              <span className="material-symbols-outlined text-3xl">add_alert</span>
              <div>
                <h3 className="text-lg font-bold font-display text-[#0b1c30]">Broadcast Code Red Alert</h3>
                <p className="text-xs text-[#76777d]">District-wide rapid priority emergency notification</p>
              </div>
            </div>

            {broadcastSent ? (
              <div className="p-4 rounded-lg bg-[#dce9ff] text-[#0051d5] text-xs font-semibold flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-[18px]">verified</span>
                <span>Code Red alert transmitted to all {activeVolunteersCount} active patrol and volunteer field beacons.</span>
              </div>
            ) : (
              <div className="space-y-3 mb-4 text-xs text-[#45464d]">
                <p>
                  This operational broadcast triggers instant push overrides and audible alerts on all active mobile units in Division 01 North Sector.
                </p>
                <div className="p-3 bg-[#eff4ff] rounded-lg">
                  <span className="font-bold text-[#0b1c30] block mb-1">Target Frequency:</span>
                  <span>Channel 4 Civic Triage & Police Command Interlink</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#f1f5f9]">
              <button
                type="button"
                onClick={() => {
                  setBroadcastModalOpen(false);
                  setBroadcastSent(false);
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-[#45464d] hover:bg-[#eff4ff]"
              >
                Close
              </button>
              {!broadcastSent && (
                <button
                  type="button"
                  onClick={() => setBroadcastSent(true)}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-[#ba1a1a] hover:bg-[#93000a] transition-colors cursor-pointer"
                >
                  Confirm Broadcast
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Operational Telemetry Bar & Rapid Overview */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-[#45464d] text-[11px] font-bold tracking-wider uppercase mb-1">
            <span className="inline-block w-2 h-2 rounded-full bg-[#ba1a1a] animate-pulse" />
            <span>Live Dispatch Feed • Division 01 North Sector</span>
          </div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-3xl font-bold text-[#0b1c30] tracking-tight font-display">
              Active Incident Matrix
            </h1>
            <span className="text-xs text-[#76777d] font-normal font-sans">
              Connected to Sahayak Backend
            </span>
          </div>
        </div>

        {/* Priority Filter & Action */}
        <div className="flex items-center gap-2 self-stretch md:self-auto justify-end">
          <div className="bg-[#eff4ff] px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs border border-[#dce9ff]">
            <span className="material-symbols-outlined text-[16px] text-[#0051d5]">tune</span>
            <select
              value={filterSeverity}
              onChange={e => setFilterSeverity(e.target.value as any)}
              className="bg-transparent font-semibold text-[#0b1c30] focus:outline-none cursor-pointer"
            >
              <option value="All">Priority Filter: All Tiers</option>
              <option value="Critical">Critical Tier Only</option>
              <option value="Urgent">Urgent Tier Only</option>
              <option value="Normal">Normal Tier Only</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => setBroadcastModalOpen(true)}
            className="bg-[#000000] text-white hover:bg-[#213145] transition-colors px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">add_alert</span>
            <span>Broadcast Code Red</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-[#ffdad6] text-[#ba1a1a] text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              refreshRequests();
              refreshVolunteers();
            }}
            className="hover:underline font-bold"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* 1. Top Section: Emergency Severity Counter Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Critical Card */}
        <div
          onClick={() => setFilterSeverity(filterSeverity === 'Critical' ? 'All' : 'Critical')}
          className={`bg-white rounded-xl p-5 shadow-sm flex flex-col justify-between relative overflow-hidden transition-all hover:shadow-md cursor-pointer border ${
            filterSeverity === 'Critical' ? 'ring-2 ring-[#ba1a1a] border-transparent' : 'border-[#e2e8f0]'
          }`}
        >
          <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-[#ba1a1a]" />
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-[#76777d] uppercase tracking-wider">
                Priority 1 • Immediate
              </span>
              <span className="text-lg font-bold text-[#0b1c30] mt-1 font-display">Critical Tier</span>
            </div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#ffdad6] text-[#ba1a1a] text-[10px] font-bold tracking-wide">
              LIVE ESCALATION
            </span>
          </div>

          <div className="flex items-end justify-between mt-5">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl text-[#ba1a1a] font-extrabold leading-none font-display">
                {criticalCount}
              </span>
              <span className="text-xs text-[#45464d]">Active Incidents</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#ffdad6] flex items-center justify-center text-[#ba1a1a]">
              <span className="material-symbols-outlined text-[22px]">e911_emergency</span>
            </div>
          </div>

          <div className="mt-4 pt-2 border-t border-[#f1f5f9] flex items-center justify-between text-[#45464d] text-[11px]">
            <span>Avg. Response Target: &lt; 4m</span>
            <span className="text-[#ba1a1a] font-semibold">• Live CAD Queue</span>
          </div>
        </div>

        {/* Urgent Card */}
        <div
          onClick={() => setFilterSeverity(filterSeverity === 'Urgent' ? 'All' : 'Urgent')}
          className={`bg-white rounded-xl p-5 shadow-sm flex flex-col justify-between relative overflow-hidden transition-all hover:shadow-md cursor-pointer border ${
            filterSeverity === 'Urgent' ? 'ring-2 ring-[#f63a35] border-transparent' : 'border-[#e2e8f0]'
          }`}
        >
          <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-[#f63a35]" />
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-[#76777d] uppercase tracking-wider">
                Priority 2 • Expedited
              </span>
              <span className="text-lg font-bold text-[#0b1c30] mt-1 font-display">Urgent Tier</span>
            </div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#ffdad6] text-[#f63a35] text-[10px] font-bold tracking-wide">
              HIGH LOAD
            </span>
          </div>

          <div className="flex items-end justify-between mt-5">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl text-[#f63a35] font-extrabold leading-none font-display">
                {urgentCount}
              </span>
              <span className="text-xs text-[#45464d]">Active Incidents</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#ffdad6] flex items-center justify-center text-[#f63a35]">
              <span className="material-symbols-outlined text-[22px]">warning</span>
            </div>
          </div>

          <div className="mt-4 pt-2 border-t border-[#f1f5f9] flex items-center justify-between text-[#45464d] text-[11px]">
            <span>Queue Priority: High</span>
            <span className="text-[#f63a35] font-semibold">• Direct Telemetry</span>
          </div>
        </div>

        {/* Normal Card */}
        <div
          onClick={() => setFilterSeverity(filterSeverity === 'Normal' ? 'All' : 'Normal')}
          className={`bg-white rounded-xl p-5 shadow-sm flex flex-col justify-between relative overflow-hidden transition-all hover:shadow-md cursor-pointer border ${
            filterSeverity === 'Normal' ? 'ring-2 ring-[#0051d5] border-transparent' : 'border-[#e2e8f0]'
          }`}
        >
          <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-[#0051d5]" />
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-[#76777d] uppercase tracking-wider">
                Priority 3 • Standard
              </span>
              <span className="text-lg font-bold text-[#0b1c30] mt-1 font-display">Normal Tier</span>
            </div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#dbe1ff] text-[#0051d5] text-[10px] font-bold tracking-wide">
              CONTROLLED
            </span>
          </div>

          <div className="flex items-end justify-between mt-5">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl text-[#0051d5] font-extrabold leading-none font-display">
                {normalCount}
              </span>
              <span className="text-xs text-[#45464d]">Active Incidents</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#dbe1ff] flex items-center justify-center text-[#0051d5]">
              <span className="material-symbols-outlined text-[22px]">verified</span>
            </div>
          </div>

          <div className="mt-4 pt-2 border-t border-[#f1f5f9] flex items-center justify-between text-[#45464d] text-[11px]">
            <span>Available Field Units: {activeVolunteersCount}</span>
            <span className="text-[#0051d5] font-semibold">• Active Roster</span>
          </div>
        </div>
      </div>

      {/* 2. Middle Section: Recent Emergency Requests Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col border border-[#e2e8f0]">
        <div className="px-5 py-3.5 bg-[#eff4ff] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-[#dce9ff]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#0051d5] text-[20px]">list_alt</span>
            <h2 className="text-base font-bold text-[#0b1c30] font-display">
              Incoming Emergency Dispatch Stream
            </h2>
            <span className="ml-1 px-2 py-0.5 rounded-full bg-[#d3e4fe] text-[#0051d5] text-xs font-semibold">
              {filteredRequests.length} Incidents
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-[#45464d]">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#ba1a1a]" /> Critical
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#f63a35]" /> Urgent
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#0051d5]" /> Normal
            </span>
          </div>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white text-[#76777d] text-[11px] uppercase tracking-wider border-b border-[#f1f5f9]">
                <th className="py-3 px-5 font-bold">Request ID</th>
                <th className="py-3 px-4 font-bold">Category</th>
                <th className="py-3 px-4 font-bold">Severity</th>
                <th className="py-3 px-4 font-bold">Status</th>
                <th className="py-3 px-5 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9] text-[#0b1c30] text-sm">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs text-[#76777d]">
                    {loading ? 'Loading real incident telemetry...' : 'No incidents recorded in database.'}
                  </td>
                </tr>
              ) : (
                filteredRequests.slice(0, 10).map(req => {
                  const isCritical = req.severity === 'Critical';
                  const isUrgent = req.severity === 'Urgent';

                  return (
                    <tr
                      key={req.id}
                      className="hover:bg-[#f8f9ff] transition-colors group cursor-pointer"
                      onClick={() => navigate('admin-request-detail', req.id)}
                    >
                      <td className="py-4 px-5 font-mono font-bold text-[#0b1c30]">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isCritical ? 'bg-[#ba1a1a]' : isUrgent ? 'bg-[#f63a35]' : 'bg-[#0051d5]'
                            }`}
                          />
                          <span>{req.id.slice(-6).toUpperCase()}</span>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#0051d5]">
                            <span className="material-symbols-outlined text-[18px]">
                              {req.category === 'Medical'
                                ? 'medical_services'
                                : req.category === 'Accident'
                                ? 'car_crash'
                                : req.category === 'Fire'
                                ? 'local_fire_department'
                                : req.category === 'Missing'
                                ? 'person_search'
                                : 'emergency'}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="font-semibold text-[#0b1c30] text-sm leading-tight">
                              {req.category}
                            </span>
                            <span className="text-xs text-[#76777d] truncate max-w-xs">
                              {req.title} • {req.location.split('•')[0]}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] uppercase font-bold tracking-wider ${
                            isCritical
                              ? 'bg-[#ffdad6] text-[#ba1a1a]'
                              : isUrgent
                              ? 'bg-[#ffdad6] text-[#f63a35]'
                              : 'bg-[#dbe1ff] text-[#0051d5]'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isCritical ? 'bg-[#ba1a1a]' : isUrgent ? 'bg-[#f63a35]' : 'bg-[#0051d5]'
                            }`}
                          />
                          {req.severity}
                        </span>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                            req.status === 'Escalated'
                              ? 'bg-[#ba1a1a] text-white'
                              : req.status === 'Resolved'
                              ? 'bg-[#d3e4fe] text-[#0051d5]'
                              : req.status === 'In Progress'
                              ? 'bg-[#dce9ff] text-[#0051d5]'
                              : 'bg-[#eff4ff] text-[#45464d]'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {req.status === 'Escalated'
                              ? 'crisis_alert'
                              : req.status === 'Resolved'
                              ? 'check_circle'
                              : req.status === 'In Progress'
                              ? 'sync'
                              : 'local_police'}
                          </span>
                          <span>
                            {req.assignedVolunteerName
                              ? `${req.status} (${req.assignedVolunteerName})`
                              : req.status}
                          </span>
                        </span>
                      </td>

                      <td className="py-4 px-5 text-right">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            navigate('admin-request-detail', req.id);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#eff4ff] text-[#0b1c30] text-xs font-semibold hover:bg-[#000000] hover:text-white transition-all shadow-xs cursor-pointer"
                        >
                          <span>View</span>
                          <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 bg-white border-t border-[#f1f5f9] flex items-center justify-between text-xs text-[#76777d]">
          <span>Displaying priority incidents • Real-time dispatch sync active</span>
          <button
            type="button"
            onClick={() => navigate('admin-requests')}
            className="text-[#0051d5] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
          >
            <span>Access full records archive</span>
            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
          </button>
        </div>
      </div>

      {/* 3. Bottom Operational Banner: Volunteer Approvals */}
      <div className="bg-white rounded-xl p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-[#e2e8f0] relative overflow-hidden">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#0051d5] text-white flex items-center justify-center shrink-0 shadow-sm">
            <span className="material-symbols-outlined text-[26px]">how_to_reg</span>
          </div>
          <div className="flex flex-col text-left">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-[#0b1c30] font-display">
                Volunteer Mobilization Clearance
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#eff4ff] text-[#0051d5] text-[10px] font-bold uppercase tracking-wider">
                ACTION NEEDED
              </span>
            </div>
            <p className="text-sm text-[#45464d] mt-0.5">
              <span className="font-bold text-[#0b1c30]">
                Pending Volunteer Approvals: {pendingApprovalsCount}
              </span>{' '}
              civic candidates currently awaiting authorization in the queue.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <button
            type="button"
            onClick={() => navigate('admin-approvals')}
            className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#0051d5] text-white hover:bg-[#003ea8] transition-colors text-xs font-semibold shadow-sm cursor-pointer"
          >
            <span>Review Approvals</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
};
