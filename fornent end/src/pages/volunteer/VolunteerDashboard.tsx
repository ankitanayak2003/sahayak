import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export const VolunteerDashboard: React.FC = () => {
  const { onDuty, dutyLoading, toggleDuty, requests, navigate } = useApp();
  const [toggleError, setToggleError] = useState<string | null>(null);

  const handleToggle = async () => {
    setToggleError(null);
    try {
      await toggleDuty();
    } catch (err: any) {
      setToggleError(err.message || 'Failed to update readiness state.');
    }
  };

  // Group emergencies
  const activeEmergencies = requests.filter(r => r.status === 'In Progress' || r.status === 'Accepted');
  const assignedEmergencies = requests.filter(r => r.status === 'Assigned');
  const queuedEmergencies = requests.filter(r => r.status === 'Queued').sort((a, b) => (a.queuePosition || 99) - (b.queuePosition || 99));

  // The primary emergency currently active or awaiting initial acceptance
  const currentEmergency = activeEmergencies[0] || assignedEmergencies[0] || null;

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">
      {/* Top Bar: Readiness Status & Operations Console */}
      <div className="w-full bg-white p-5 rounded-xl shadow-xs border border-[#e2e8f0] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-[#eff4ff] flex items-center justify-center text-[#0051d5] border border-[#dce9ff]">
            <span className="material-symbols-outlined text-[28px]">health_and_safety</span>
          </div>
          <div className="flex flex-col text-left">
            <div className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${onDuty ? 'bg-[#0051d5] animate-pulse' : 'bg-[#76777d]'}`} />
              <span className={`text-[10px] uppercase tracking-wider font-bold ${onDuty ? 'text-[#0051d5]' : 'text-[#76777d]'}`}>
                Field Deployment Unit
              </span>
            </div>
            <span className="text-xl font-bold text-[#0b1c30] font-display">
              Volunteer Operations Console
            </span>
          </div>
        </div>

        {/* Live Duty Toggle Control */}
        <div className="bg-[#eff4ff] px-4 py-2.5 rounded-xl flex items-center justify-between md:justify-end gap-4 border border-[#dce9ff]">
          <div className="flex flex-col text-left">
            <span className="text-[10px] text-[#76777d] uppercase font-bold">Readiness State</span>
            <span
              className={`text-xs font-bold ${onDuty ? 'text-[#0051d5]' : 'text-[#76777d]'}`}
            >
              {dutyLoading
                ? 'Updating readiness...'
                : onDuty
                ? 'ON DUTY & AVAILABLE FOR DISPATCH'
                : 'OFF DUTY / STANDBY'}
            </span>
          </div>

          <button
            type="button"
            disabled={dutyLoading}
            onClick={handleToggle}
            aria-pressed={onDuty}
            title={onDuty ? 'Switch Off Duty' : 'Switch On Duty'}
            className={`w-12 h-6 rounded-full relative p-0.5 transition-colors focus:outline-none flex items-center cursor-pointer disabled:opacity-50 ${
              onDuty ? 'bg-[#0051d5]' : 'bg-[#cbd5e1]'
            }`}
          >
            <span
              className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform block ${
                onDuty ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {toggleError && (
        <div className="p-3 bg-[#ffdad6] text-[#ba1a1a] text-xs font-semibold rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{toggleError}</span>
          </div>
          <button type="button" onClick={() => setToggleError(null)} className="hover:underline font-bold">
            Dismiss
          </button>
        </div>
      )}

      {/* Metric Row: Active vs Queued */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Metric 1: Current Active Task */}
        <div className="bg-white p-5 rounded-xl shadow-xs border border-[#e2e8f0] flex items-center justify-between relative overflow-hidden">
          <div className="flex flex-col text-left gap-1">
            <span className="text-[10px] font-bold text-[#76777d] uppercase tracking-wider">
              Current Emergency
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-[#0b1c30] font-display">
                {currentEmergency ? '1' : '0'}
              </span>
              <span className="text-xs text-[#45464d]">
                {currentEmergency ? `Status: ${currentEmergency.status}` : 'No active incident'}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[#76777d] text-xs pt-1">
              <span className="material-symbols-outlined text-[15px] text-[#0051d5]">
                {currentEmergency?.status === 'In Progress' ? 'run_circle' : 'verified'}
              </span>
              <span>{currentEmergency ? 'Engaged on scene' : 'Ready for dispatch'}</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#eff4ff] text-[#0051d5] flex items-center justify-center">
            <span className="material-symbols-outlined text-[26px]">assignment_turned_in</span>
          </div>
        </div>

        {/* Metric 2: Queued Emergencies */}
        <div className="bg-white p-5 rounded-xl shadow-xs border border-[#e2e8f0] flex items-center justify-between relative overflow-hidden">
          <div className="flex flex-col text-left gap-1">
            <span className="text-[10px] font-bold text-[#c2410c] uppercase tracking-wider">
              Queued Emergencies
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-[#c2410c] font-display">
                {queuedEmergencies.length}
              </span>
              <span className="text-xs text-[#c2410c] font-semibold">In Waiting Queue</span>
            </div>
            <div className="flex items-center gap-1 text-[#c2410c] text-xs pt-1">
              <span className="material-symbols-outlined text-[15px]">queue</span>
              <span>Auto-promotes on completion</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#ffedd5] text-[#c2410c] flex items-center justify-center">
            <span className="material-symbols-outlined text-[26px]">format_list_numbered</span>
          </div>
        </div>

        {/* Metric 3: Total Workload */}
        <div className="bg-white p-5 rounded-xl shadow-xs border border-[#e2e8f0] flex items-center justify-between relative overflow-hidden">
          <div className="flex flex-col text-left gap-1">
            <span className="text-[10px] font-bold text-[#0051d5] uppercase tracking-wider">
              Total Workload
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-[#0051d5] font-display">
                {(currentEmergency ? 1 : 0) + queuedEmergencies.length}
              </span>
              <span className="text-xs text-[#0051d5] font-semibold">Active & Queued</span>
            </div>
            <div className="flex items-center gap-1 text-[#0051d5] text-xs pt-1">
              <span className="material-symbols-outlined text-[15px]">speed</span>
              <span>Load-balanced allocation</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#eff4ff] text-[#0051d5] flex items-center justify-center">
            <span className="material-symbols-outlined text-[26px]">layers</span>
          </div>
        </div>
      </div>

      {/* Primary Section 1: CURRENT ACTIVE EMERGENCY */}
      <div className="flex flex-col gap-4 text-left">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#0051d5] text-[22px]">emergency</span>
            <h2 className="text-xl font-bold text-[#0b1c30] font-display">Current Emergency</h2>
          </div>
          {currentEmergency && (
            <span className="text-xs font-bold text-[#0051d5] bg-[#eff4ff] px-2.5 py-1 rounded-md border border-[#dce9ff]">
              Active Incident • Position #1
            </span>
          )}
        </div>

        {!currentEmergency ? (
          <div className="bg-white rounded-xl shadow-xs border border-[#e2e8f0] p-10 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-full bg-[#eff4ff] flex items-center justify-center text-[#0051d5]">
              <span className="material-symbols-outlined text-[28px]">check_circle</span>
            </div>
            <h3 className="text-base font-bold text-[#0b1c30]">No Active Incidents Assigned</h3>
            <p className="text-xs text-[#76777d] max-w-md">
              {onDuty
                ? 'You are on duty and ready for dispatch. New emergencies will be automatically assigned to you based on workload.'
                : 'You are currently off duty. Toggle the readiness switch above to receive emergency assignments.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-xs border border-[#e2e8f0] overflow-hidden flex flex-col md:flex-row transition-all hover:shadow-md">
            <div
              className={`w-full md:w-2.5 shrink-0 min-h-2 ${
                currentEmergency.severity === 'Critical'
                  ? 'bg-[#ba1a1a]'
                  : currentEmergency.severity === 'Urgent'
                  ? 'bg-[#c2410c]'
                  : 'bg-[#0051d5]'
              }`}
            />
            <div className="p-5 flex-1 flex flex-col justify-between gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-[#eff4ff] text-[10px] text-[#0b1c30] font-bold uppercase tracking-wider font-mono">
                    {currentEmergency.id}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#dce9ff] text-[#0051d5] text-[10px] font-bold uppercase">
                    {currentEmergency.category} Aid
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      currentEmergency.severity === 'Critical'
                        ? 'bg-[#ffdad6] text-[#ba1a1a]'
                        : currentEmergency.severity === 'Urgent'
                        ? 'bg-[#ffedd5] text-[#c2410c]'
                        : 'bg-[#eff4ff] text-[#0051d5]'
                    }`}
                  >
                    {currentEmergency.severity} Priority
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      currentEmergency.status === 'In Progress'
                        ? 'bg-[#0051d5] animate-ping'
                        : currentEmergency.status === 'Accepted'
                        ? 'bg-[#0051d5]'
                        : 'bg-[#c2410c]'
                    }`}
                  />
                  <span className="text-xs font-bold text-[#0b1c30] uppercase">
                    Status: {currentEmergency.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                <div className="lg:col-span-8 flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-[#0051d5] text-[20px] shrink-0 mt-0.5">
                      location_on
                    </span>
                    <div className="flex flex-col text-left">
                      <span className="text-sm font-bold text-[#0b1c30]">
                        {currentEmergency.location}
                      </span>
                      <span className="text-xs text-[#76777d]">
                        Reported incident sector
                      </span>
                    </div>
                  </div>

                  <div className="bg-[#eff4ff] p-3 rounded-lg border border-[#dce9ff]/60 text-left">
                    <div className="flex items-center gap-1.5 text-[#45464d] text-xs font-bold mb-1">
                      <span className="material-symbols-outlined text-[16px] text-[#0051d5]">
                        {currentEmergency.category === 'Medical' ? 'medical_services' : 'emergency'}
                      </span>
                      <span>Dispatcher Intake Summary</span>
                    </div>
                    <p className="text-xs text-[#0b1c30] leading-relaxed">
                      {currentEmergency.description}
                    </p>
                  </div>
                </div>

                {/* Map Visual Frame */}
                <div className="lg:col-span-4 h-32 rounded-lg bg-[#e5eeff] relative overflow-hidden flex items-center justify-center border border-[#cbd5e1]">
                  <div
                    className="absolute inset-0 opacity-40"
                    style={{
                      backgroundImage: `radial-gradient(#0051d5 1px, transparent 1px)`,
                      backgroundSize: '16px 16px',
                    }}
                  />
                  <div className="relative z-10 bg-white/95 px-3 py-1 rounded shadow-xs flex items-center gap-1.5 border border-[#e2e8f0]">
                    <span className="material-symbols-outlined text-[#0051d5] text-[16px]">navigation</span>
                    <span className="text-xs font-bold text-[#0b1c30] truncate max-w-[150px]">
                      {currentEmergency.location.split(',')[0]}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Footer CTA */}
              <div className="pt-2 border-t border-[#f1f5f9] flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-xs text-[#76777d]">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">timer</span>
                    <span>{currentEmergency.elapsedMinutes ? `${currentEmergency.elapsedMinutes}m ago` : currentEmergency.createdAt || 'Recently logged'}</span>
                  </span>
                  <span>•</span>
                  <span>{currentEmergency.callerInfo?.name || 'Emergency Intake'}</span>
                </div>

                <button
                  type="button"
                  onClick={() => navigate('volunteer-request-detail', currentEmergency.id)}
                  className="w-full sm:w-auto px-5 py-2 bg-[#000000] text-white hover:bg-[#213145] rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                >
                  <span>ACTION THIS EMERGENCY</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Primary Section 2: PER-VOLUNTEER EMERGENCY QUEUE */}
      {queuedEmergencies.length > 0 && (
        <div className="flex flex-col gap-4 text-left">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#c2410c] text-[22px]">queue</span>
              <h2 className="text-xl font-bold text-[#0b1c30] font-display">Dispatch Queue</h2>
            </div>
            <span className="text-xs font-bold text-[#c2410c] bg-[#ffedd5] px-2.5 py-1 rounded-md border border-[#fed7aa]">
              {queuedEmergencies.length} Incident(s) in Queue
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {queuedEmergencies.map((queuedReq, index) => (
              <div
                key={queuedReq.id}
                className="bg-white rounded-xl shadow-xs border border-[#fed7aa] overflow-hidden flex flex-col md:flex-row transition-all hover:shadow-md"
              >
                <div className="w-full md:w-2 bg-[#c2410c] shrink-0" />
                <div className="p-4 flex-1 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex flex-col gap-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[#ffedd5] text-[#c2410c] text-[10px] font-bold uppercase font-mono">
                        Queue Position #{queuedReq.queuePosition || index + 2}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#eff4ff] text-[#0051d5] text-[10px] font-bold uppercase">
                        {queuedReq.category}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          queuedReq.severity === 'Critical'
                            ? 'bg-[#ffdad6] text-[#ba1a1a]'
                            : queuedReq.severity === 'Urgent'
                            ? 'bg-[#ffedd5] text-[#c2410c]'
                            : 'bg-[#eff4ff] text-[#0051d5]'
                        }`}
                      >
                        {queuedReq.severity}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#f1f5f9] text-[#45464d] text-[10px] font-bold uppercase">
                        Status: QUEUED
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <span className="material-symbols-outlined text-[#76777d] text-[18px]">location_on</span>
                      <span className="text-sm font-bold text-[#0b1c30]">{queuedReq.location}</span>
                    </div>

                    <p className="text-xs text-[#45464d] line-clamp-1">
                      {queuedReq.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                    <span className="text-xs text-[#76777d]">
                      Auto-activates next
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate('volunteer-request-detail', queuedReq.id)}
                      className="px-4 py-2 bg-[#eff4ff] text-[#0b1c30] hover:bg-[#dce9ff] rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer border border-[#dce9ff]"
                    >
                      <span>View Dossier</span>
                      <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Emergency Field Dispatch Helpdesk */}
      <div className="bg-white p-4 rounded-xl shadow-xs border border-[#e2e8f0] flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#eff4ff] text-[#0051d5] flex items-center justify-center shrink-0 border border-[#dce9ff]">
            <span className="material-symbols-outlined text-[22px]">support_agent</span>
          </div>
          <div className="flex flex-col text-left">
            <span className="text-sm font-bold text-[#0b1c30]">Emergency Field Dispatch Helpdesk</span>
            <span className="text-xs text-[#45464d]">
              Immediate coordinator connect active on Channel 4
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => alert('Connecting to Central Dispatch Control Room audio line...')}
          className="w-full sm:w-auto px-4 py-2 bg-[#eff4ff] hover:bg-[#dce9ff] text-[#0b1c30] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-[#dce9ff]"
        >
          <span className="material-symbols-outlined text-[16px] text-[#0051d5]">phone_in_talk</span>
          <span>Call Control Room</span>
        </button>
      </div>
    </div>
  );
};
