import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { IncidentSeverity, IncidentStatus, IncidentCategory } from '../../types';

export const EmergencyRequests: React.FC = () => {
  const { requests, volunteers, availableVolunteers, navigate, assignVolunteerToRequest, refreshRequests, refreshVolunteers, loading } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'All' | IncidentSeverity>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | IncidentStatus>('All');
  const [categoryFilter, setCategoryFilter] = useState<'All' | IncidentCategory>('All');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [assigningRequestId, setAssigningRequestId] = useState<string | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);

  useEffect(() => {
    refreshRequests();
    refreshVolunteers();
  }, [refreshRequests, refreshVolunteers]);

  // Filter requests
  const filteredRequests = requests.filter(req => {
    const matchesSearch =
      req.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.title.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSeverity = severityFilter === 'All' || req.severity === severityFilter;
    const matchesStatus = statusFilter === 'All' || req.status === statusFilter;
    const matchesCategory = categoryFilter === 'All' || req.category === categoryFilter;

    return matchesSearch && matchesSeverity && matchesStatus && matchesCategory;
  });

  const criticalQueueCount = requests.filter(r => r.severity === 'Critical' && r.status !== 'Resolved').length;
  const activeVolunteersCount = volunteers.filter(v => v.status === 'Active' || v.status === 'On Duty').length;
  const assignableVolunteers = (availableVolunteers && availableVolunteers.length > 0)
    ? availableVolunteers
    : volunteers.filter(v => v.status === 'Active' && !v.activeAssignments);

  const handleAssign = async (volId: string, volName: string) => {
    if (!assigningRequestId) return;
    setAssignLoading(true);
    try {
      await assignVolunteerToRequest(assigningRequestId, volId, volName);
      setAssigningRequestId(null);
    } catch (err) {
      console.warn('Assignment failed:', err);
    } finally {
      setAssignLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* Assign Volunteer Modal */}
      {assigningRequestId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 border border-[#e2e8f0]">
            <div className="flex items-center justify-between pb-3 border-b border-[#f1f5f9]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#0051d5] text-2xl">person_add</span>
                <h3 className="text-base font-bold text-[#0b1c30] font-display">
                  Manual Override / Reassign Volunteer ({assigningRequestId.slice(-6).toUpperCase()})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAssigningRequestId(null)}
                className="text-[#76777d] hover:text-[#0b1c30] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <p className="text-xs text-[#45464d] my-3 text-left">
              Admin Manual Override: select an eligible verified responder to assign or queue:
            </p>

            <div className="max-h-60 overflow-y-auto divide-y divide-[#f1f5f9] border border-[#e5eeff] rounded-lg">
              {assignableVolunteers.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#76777d]">
                  No verified available volunteers currently in pool.
                </div>
              ) : (
                assignableVolunteers.map(vol => (
                  <div
                    key={vol.id}
                    className="p-3 hover:bg-[#eff4ff] flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#0051d5] text-white flex items-center justify-center text-xs font-bold">
                        {vol.avatarInitials}
                      </div>
                      <div className="flex flex-col text-left">
                        <span className="text-xs font-bold text-[#0b1c30]">{vol.name}</span>
                        <span className="text-[11px] text-[#76777d]">
                          {vol.status} • {vol.assignmentText || 'Available'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={assignLoading}
                      onClick={() => handleAssign(vol.id, vol.name)}
                      className="px-3 py-1.5 rounded-lg bg-[#0051d5] text-white text-xs font-semibold hover:bg-[#003ea8] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {assignLoading ? 'Assigning...' : 'Assign'}
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-[#f1f5f9] flex justify-end">
              <button
                type="button"
                onClick={() => setAssigningRequestId(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-[#45464d] hover:bg-[#eff4ff] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header Area */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-1 text-left">
          <div className="flex items-center gap-2">
            <span className="inline-flex w-2 h-2 rounded-full bg-[#ba1a1a] animate-ping" />
            <span className="text-[11px] font-bold text-[#ba1a1a] uppercase tracking-wider">
              Live CAD Stream
            </span>
          </div>
          <h1 className="text-3xl font-bold text-[#0b1c30] tracking-tight font-display">
            Emergency Requests
          </h1>
          <p className="text-sm text-[#45464d]">
            Active live emergency dispatch and tracking telemetry across district sectors
          </p>
        </div>

        {/* Quick Metrics Ribbon */}
        <div className="flex items-center gap-2 bg-white p-1 rounded-xl shadow-xs border border-[#e2e8f0]">
          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-[#eff4ff] rounded-lg">
            <span className="material-symbols-outlined text-[#ba1a1a] text-[20px]">crisis_alert</span>
            <div className="flex flex-col text-left">
              <span className="text-[10px] text-[#76777d] font-bold uppercase">Critical Queue</span>
              <span className="text-sm font-bold text-[#0b1c30] leading-none">
                {criticalQueueCount} Active
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-[#eff4ff] rounded-lg">
            <span className="material-symbols-outlined text-[#0051d5] text-[20px]">groups</span>
            <div className="flex flex-col text-left">
              <span className="text-[10px] text-[#76777d] font-bold uppercase">Active Pool</span>
              <span className="text-sm font-bold text-[#0b1c30] leading-none">{activeVolunteersCount} Verified</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Operational Search Bar */}
      <div className="bg-white p-4 rounded-xl shadow-xs border border-[#e2e8f0] flex flex-col gap-3">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
          <div className="relative w-full lg:w-96 flex items-center">
            <span className="material-symbols-outlined absolute left-3 text-[#76777d] text-[20px] pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search request ID, category, or location..."
              className="w-full pl-10 pr-3 py-2 bg-[#eff4ff] rounded-lg text-[#0b1c30] text-sm placeholder:text-[#76777d] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0051d5] transition-all border border-transparent"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
            {/* Severity Filter */}
            <div className="relative inline-block min-w-[140px]">
              <select
                value={severityFilter}
                onChange={e => setSeverityFilter(e.target.value as any)}
                className="w-full appearance-none bg-[#eff4ff] text-[#0b1c30] text-xs font-semibold px-3 py-2 pr-8 rounded-lg focus:outline-none cursor-pointer hover:bg-[#dce9ff] transition-colors border border-transparent"
              >
                <option value="All">All Severities</option>
                <option value="Critical">Critical Only</option>
                <option value="Urgent">Urgent Only</option>
                <option value="Normal">Normal Only</option>
              </select>
              <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[#76777d] pointer-events-none text-[18px]">
                keyboard_arrow_down
              </span>
            </div>

            {/* Status Filter */}
            <div className="relative inline-block min-w-[140px]">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="w-full appearance-none bg-[#eff4ff] text-[#0b1c30] text-xs font-semibold px-3 py-2 pr-8 rounded-lg focus:outline-none cursor-pointer hover:bg-[#dce9ff] transition-colors border border-transparent"
              >
                <option value="All">Status: All</option>
                <option value="Assigned">Assigned</option>
                <option value="Pending">Pending Assignment</option>
                <option value="In Progress">In Progress</option>
                <option value="Escalated">Escalated</option>
                <option value="Resolved">Resolved</option>
              </select>
              <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[#76777d] pointer-events-none text-[18px]">
                keyboard_arrow_down
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowMoreFilters(!showMoreFilters)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                showMoreFilters || categoryFilter !== 'All'
                  ? 'bg-[#0051d5] text-white'
                  : 'bg-[#eff4ff] text-[#0051d5] hover:bg-[#dce9ff]'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">tune</span>
              <span>More Filters</span>
            </button>
          </div>
        </div>

        {/* Secondary Category Filter Toolbar */}
        {showMoreFilters && (
          <div className="pt-2 border-t border-[#f1f5f9] flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[#76777d] font-semibold">Category:</span>
            {(['All', 'Medical', 'Accident', 'Fire', 'Missing', 'Civil', 'Traffic'] as const).map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-[#0051d5] text-white font-bold'
                    : 'bg-[#eff4ff] text-[#45464d] hover:bg-[#dce9ff]'
                }`}
              >
                {cat}
              </button>
            ))}
            {(searchTerm || severityFilter !== 'All' || statusFilter !== 'All' || categoryFilter !== 'All') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSeverityFilter('All');
                  setStatusFilter('All');
                  setCategoryFilter('All');
                }}
                className="ml-auto text-xs text-[#ba1a1a] hover:underline font-semibold cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Data Table Container strictly matching layout */}
      <div className="bg-white rounded-xl shadow-xs border border-[#e2e8f0] overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#eff4ff] text-[#45464d] text-[11px] uppercase tracking-wider border-b border-[#dce9ff]">
                <th className="py-3 px-5 font-bold" scope="col">ID</th>
                <th className="py-3 px-5 font-bold" scope="col">Category</th>
                <th className="py-3 px-4 font-bold" scope="col">Severity</th>
                <th className="py-3 px-4 font-bold" scope="col">Status</th>
                <th className="py-3 px-5 font-bold" scope="col">Assignment</th>
                <th className="py-3 px-5 text-right font-bold" scope="col">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9] text-[#0b1c30] text-sm">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-[#76777d]">
                    {loading ? 'Fetching requests from server...' : 'No emergency requests matching the selected filters.'}
                  </td>
                </tr>
              ) : (
                filteredRequests.map(req => {
                  const isCritical = req.severity === 'Critical';
                  const isUrgent = req.severity === 'Urgent';
                  const isPending = req.status === 'Pending';

                  return (
                    <tr
                      key={req.id}
                      className="hover:bg-[#f8f9ff] transition-colors group cursor-pointer"
                      onClick={() => navigate('admin-request-detail', req.id)}
                    >
                      {/* ID with colored vertical edge indicator */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-1.5 h-6 rounded-full inline-block ${
                              isCritical ? 'bg-[#ba1a1a]' : isUrgent ? 'bg-[#f63a35]' : 'bg-[#0051d5]'
                            }`}
                          />
                          <span className="font-bold text-sm text-[#0b1c30] font-mono tracking-tight">
                            {req.id.slice(-6).toUpperCase()}
                          </span>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#0051d5]">
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
                            <span className="font-bold text-sm text-[#0b1c30]">{req.category}</span>
                            <span className="text-xs text-[#76777d] truncate max-w-xs">{req.title}</span>
                          </div>
                        </div>
                      </td>

                      {/* Severity */}
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] uppercase font-bold tracking-wide ${
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

                      {/* Status */}
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold ${
                            req.status === 'Escalated'
                              ? 'bg-[#ba1a1a] text-white font-bold'
                              : req.status === 'Resolved'
                              ? 'bg-[#eff4ff] text-[#45464d]'
                              : req.status === 'Queued'
                              ? 'bg-[#ffeed9] text-[#b35900] font-bold'
                              : req.status === 'Pending'
                              ? 'bg-[#ffdad6] text-[#f63a35] font-bold animate-pulse'
                              : 'bg-[#dce9ff] text-[#0051d5]'
                          }`}
                        >
                          {req.status}
                          {req.status === 'Queued' && req.queuePosition ? ` #${req.queuePosition}` : ''}
                        </span>
                      </td>

                      {/* Assignment */}
                      <td className="py-4 px-5">
                        {req.assignedVolunteerName ? (
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-[#0051d5] text-white flex items-center justify-center text-xs font-bold shrink-0">
                              {req.assignedVolunteerName.split(' ').map(n => n[0]).join('').substring(0, 2)}
                            </div>
                            <div className="flex flex-col text-left">
                              <span className="text-xs font-bold text-[#0b1c30] leading-tight">
                                {req.assignedVolunteerName}
                              </span>
                              <span className="text-[11px] text-[#76777d]">
                                {req.assignedVolunteerBadge}
                                {req.status === 'Queued' && req.queuePosition ? ` • Queue #${req.queuePosition}` : ''}
                              </span>
                            </div>
                          </div>
                        ) : req.status === 'Escalated' ? (
                          <div className="flex items-center gap-1.5 text-[#ba1a1a]">
                            <span className="material-symbols-outlined text-[16px]">forward</span>
                            <span className="text-xs font-semibold">— (Escalated to 112)</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[#76777d]">
                            <span className="material-symbols-outlined text-[16px]">person_off</span>
                            <span className="text-xs">— (Waiting for responder)</span>
                          </div>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-4 px-5 text-right">
                        {isPending ? (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setAssigningRequestId(req.id);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0051d5] text-white text-xs font-semibold hover:bg-[#003ea8] transition-all shadow-xs cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[14px]">swap_horiz</span>
                            <span>Manual Override / Assign</span>
                          </button>
                        ) : (
                          <div className="inline-flex items-center gap-2">
                            {req.status !== 'Resolved' && req.status !== 'Escalated' && (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  setAssigningRequestId(req.id);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#dce9ff] text-[#0051d5] text-xs font-semibold hover:bg-[#eff4ff] transition-all cursor-pointer"
                                title="Manual Override / Reassign"
                              >
                                <span className="material-symbols-outlined text-[14px]">swap_horiz</span>
                                <span className="hidden sm:inline">Reassign</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                navigate('admin-request-detail', req.id);
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#eff4ff] text-[#0b1c30] text-xs font-semibold hover:bg-[#0051d5] hover:text-white transition-all shadow-xs cursor-pointer"
                            >
                              <span>View Details</span>
                              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Clean Pagination Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-3 bg-[#eff4ff] gap-3 border-t border-[#dce9ff]">
          <span className="text-xs text-[#45464d]">
            Showing <span className="font-bold text-[#0b1c30]">1-{filteredRequests.length}</span> of{' '}
            <span className="font-bold text-[#0b1c30]">{filteredRequests.length}</span> records
          </span>

          <div className="flex items-center gap-1">
            <button
              disabled
              type="button"
              className="w-8 h-8 rounded-lg bg-white text-[#76777d] flex items-center justify-center opacity-50 cursor-not-allowed border border-[#e2e8f0]"
            >
              <span className="material-symbols-outlined text-[16px]">chevron_left</span>
            </button>
            <button
              type="button"
              className="w-8 h-8 rounded-lg bg-[#000000] text-white text-xs font-bold flex items-center justify-center shadow-xs"
            >
              1
            </button>
            <button
              disabled
              type="button"
              className="w-8 h-8 rounded-lg bg-white text-[#76777d] flex items-center justify-center opacity-50 cursor-not-allowed border border-[#e2e8f0]"
            >
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
