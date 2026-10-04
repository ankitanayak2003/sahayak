import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { IncidentMap } from '../../components/IncidentMap';

export const VolunteerRequestDetails: React.FC = () => {
  const { requests, activeRequestId, acceptAssignedRequest, rejectAssignedRequest, updateRequestStatus, navigate } = useApp();

  const request = requests.find(r => r.id === activeRequestId) || requests[0];
  const [directionsNotice, setDirectionsNotice] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!request) {
    return (
      <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full p-12 bg-white rounded-xl shadow-xs border border-[#e2e8f0] text-center items-center justify-center">
        <div className="w-12 h-12 rounded-xl bg-[#eff4ff] flex items-center justify-center text-[#0051d5] mb-2">
          <span className="material-symbols-outlined text-[26px]">search_off</span>
        </div>
        <h2 className="text-lg font-bold text-[#0b1c30]">Incident Not Found</h2>
        <p className="text-xs text-[#76777d] max-w-md">The requested emergency incident could not be located or has been reassigned.</p>
        <button
          type="button"
          onClick={() => navigate('volunteer-requests')}
          className="mt-2 px-4 py-2 bg-[#0051d5] text-white rounded-lg text-xs font-bold hover:bg-[#003ea8] transition-colors cursor-pointer"
        >
          Return to My Requests
        </button>
      </div>
    );
  }

  // Current state machine stage based on request.status
  const currentStatus = request.status;

  const handleAccept = async () => {
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      setActionError(null);
      await acceptAssignedRequest(request.id);
    } catch (err: any) {
      setActionError(err.message || 'Failed to accept assignment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (isSubmitting) return;
    if (confirm('Are you sure you need to reject this emergency assignment? It will be re-routed immediately to the next available responder.')) {
      try {
        setIsSubmitting(true);
        setActionError(null);
        await rejectAssignedRequest(request.id, 'Volunteer unavailable');
        navigate('volunteer-requests');
      } catch (err: any) {
        setActionError(err.message || 'Failed to decline assignment');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleStartProgress = async () => {
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      setActionError(null);
      await updateRequestStatus(request.id, 'In Progress');
    } catch (err: any) {
      setActionError(err.message || 'Failed to update status to In Progress');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolve = async () => {
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      setActionError(null);
      await updateRequestStatus(request.id, 'Resolved');
    } catch (err: any) {
      setActionError(err.message || 'Failed to resolve incident');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">
      {/* Top Context Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('volunteer-requests')}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#45464d] hover:text-[#0051d5] transition-colors group cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px] transition-transform group-hover:-translate-x-1">
            arrow_back
          </span>
          <span>Back to My Requests</span>
        </button>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#eff4ff] text-[#45464d] text-xs font-semibold border border-[#dce9ff]">
          <span className="w-2 h-2 rounded-full bg-[#0051d5] animate-pulse" />
          <span>Live Dispatch Queue</span>
        </div>
      </div>

      {/* Request Title & Identity Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 text-left">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#76777d]">
              Incident Dossier
            </span>
            <span className="w-1 h-1 rounded-full bg-[#cbd5e1]" />
            <span className="text-xs font-bold font-mono text-[#0051d5]">DISPATCH-ID {request.id}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0b1c30] tracking-tight font-display">
            Request {request.id} — {request.title}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded bg-[#ffdad6] text-[#ba1a1a] text-xs font-bold uppercase tracking-wider">
            <span className="material-symbols-outlined text-[16px]">priority_high</span>
            <span>{request.severity} Tier</span>
          </span>
          <span className="inline-flex items-center px-3 py-1 rounded bg-[#eff4ff] text-[#0051d5] text-xs font-bold uppercase tracking-wider border border-[#dce9ff]">
            {request.category} Aid
          </span>
        </div>
      </div>

      {directionsNotice && (
        <div className="p-3 bg-[#dce9ff] text-[#0051d5] text-xs font-semibold rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">near_me</span>
            <span>GPS turn-by-turn route loaded: 12th Main via 100ft Road (4 min ETA).</span>
          </div>
          <button type="button" onClick={() => setDirectionsNotice(false)} className="hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Incident Essentials Card (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6 text-left">
          <div className="bg-white rounded-xl shadow-xs border border-[#e2e8f0] p-6 relative overflow-hidden flex flex-col gap-4">
            {/* Header sub-row */}
            <div className="flex items-center justify-between pb-3 border-b border-[#f1f5f9]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#0051d5]">
                  <span className="material-symbols-outlined text-[20px]">medical_services</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#76777d] block">
                    Classification
                  </span>
                  <span className="text-sm font-bold text-[#0b1c30]">Civic Emergency Response</span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-bold text-[#76777d] block uppercase">ETA Requirement</span>
                <span className="text-xs font-bold text-[#0051d5]">&lt; 15 mins</span>
              </div>
            </div>

            {/* Description Block */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#76777d] mb-1">
                Incident Summary
              </h2>
              <p className="text-sm text-[#0b1c30] leading-relaxed">
                {request.description}
              </p>
            </div>

            {/* Essential Kit & Safety Tags */}
            <div className="p-3.5 rounded-lg bg-[#eff4ff] border border-[#dce9ff]/60">
              <span className="text-[10px] uppercase tracking-wider text-[#0051d5] font-bold block mb-2">
                Suggested Equipment Ready
              </span>
              <div className="flex flex-wrap gap-2">
                {(request.equipmentNeeded || [
                  'Basic Sterile First-Aid Kit',
                  'Splint/Compression Bandage',
                  'High-Vis Field Vest',
                ]).map((item, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded bg-white text-xs font-semibold text-[#0b1c30] flex items-center gap-1.5 border border-[#e2e8f0]"
                  >
                    <span className="material-symbols-outlined text-[14px] text-[#0051d5]">check_circle</span>
                    <span>{item}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Location Viewport Frame */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1 text-[#0b1c30]">
                  <span className="material-symbols-outlined text-[#0051d5] text-[18px]">location_on</span>
                  <span className="text-sm font-bold">{request.location}</span>
                </div>
                <span className="text-xs text-[#76777d]">Bengaluru, KA</span>
              </div>

              {/* Incident Map Canvas */}
              <div className="w-full">
                <IncidentMap
                  latitude={request.latitude}
                  longitude={request.longitude}
                  accuracyMeters={request.accuracyMeters}
                  locationText={request.location}
                  title={`Incident ${request.refId}`}
                  heightClass="h-56"
                  showNavigationLink={true}
                />
              </div>
            </div>

            {/* Direct Contact Bar */}
            <div className="pt-2 border-t border-[#f1f5f9] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-[#0051d5] text-white flex items-center justify-center text-xs font-bold">
                  DP
                </div>
                <div>
                  <span className="text-xs font-bold text-[#0b1c30] block">Caller / Dispatch Unit</span>
                  <span className="text-[11px] text-[#76777d]">
                    {request.callerInfo?.name || 'Indiranagar Police Outreach Center'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => alert(`Dialing Dispatch Unit at ${request.callerInfo?.contact || '+91 80 2521 8840'}...`)}
                  className="w-8 h-8 rounded-lg bg-[#eff4ff] hover:bg-[#dce9ff] flex items-center justify-center text-[#0b1c30] transition-colors cursor-pointer"
                  title="Audio Call"
                >
                  <span className="material-symbols-outlined text-[16px]">call</span>
                </button>
                <button
                  type="button"
                  onClick={() => alert('Opening secure CAD radio chat channel...')}
                  className="w-8 h-8 rounded-lg bg-[#eff4ff] hover:bg-[#dce9ff] flex items-center justify-center text-[#0b1c30] transition-colors cursor-pointer"
                  title="Direct Secure SMS"
                >
                  <span className="material-symbols-outlined text-[16px]">chat</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: State Machine & Workflow Actions Card (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6 text-left">
          <div className="bg-white rounded-xl shadow-xs border border-[#e2e8f0] p-6 flex flex-col gap-4">
            {/* Status Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#f1f5f9]">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#76777d] block">
                  Ownership
                </span>
                <span className="text-sm font-bold text-[#0051d5]">Assigned to you</span>
              </div>
              <div className="inline-flex items-center px-2.5 py-1 rounded bg-[#eff4ff] text-xs font-bold text-[#0051d5] uppercase border border-[#dce9ff]">
                <span>{currentStatus}</span>
              </div>
            </div>

            {/* Visual Workflow Progression Preview matching blueprint:
                ASSIGNED -> ACCEPTED -> IN_PROGRESS -> RESOLVED */}
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#76777d] mb-3">
                State Machine Lifecycle
              </h3>

              <div className="relative flex flex-col gap-4">
                <div className="absolute left-[13px] top-3 bottom-3 w-[2px] bg-[#e5eeff] z-0" />

                {/* Step 1: ASSIGNED */}
                <div className="relative z-10 flex items-start gap-3">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 ${
                      currentStatus === 'Assigned'
                        ? 'bg-[#0051d5] text-white shadow-xs'
                        : 'bg-[#dce9ff] text-[#0051d5]'
                    }`}
                  >
                    {currentStatus !== 'Assigned' ? (
                      <span className="material-symbols-outlined text-[15px]">check</span>
                    ) : (
                      <span className="material-symbols-outlined text-[15px]">person_check</span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[#0b1c30]">Step 1: Assigned</span>
                      {currentStatus === 'Assigned' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#dbe1ff] text-[#0051d5] uppercase">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#76777d]">Allocated to your regional coverage zone.</p>
                  </div>
                </div>

                {/* Step 2: ACCEPTED */}
                <div
                  className={`relative z-10 flex items-start gap-3 transition-opacity ${
                    currentStatus === 'Assigned' ? 'opacity-40' : 'opacity-100'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 ${
                      currentStatus === 'Accepted'
                        ? 'bg-[#0051d5] text-white shadow-xs'
                        : currentStatus === 'In Progress' || currentStatus === 'Resolved'
                        ? 'bg-[#dce9ff] text-[#0051d5]'
                        : 'bg-[#f1f5f9] text-[#76777d]'
                    }`}
                  >
                    {currentStatus === 'In Progress' || currentStatus === 'Resolved' ? (
                      <span className="material-symbols-outlined text-[15px]">check</span>
                    ) : (
                      <span className="material-symbols-outlined text-[15px]">thumb_up</span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[#0b1c30]">Step 2: Accept Assignment</span>
                      {currentStatus === 'Accepted' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#dbe1ff] text-[#0051d5] uppercase">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#76777d]">Confirm readiness and commit deployment.</p>
                  </div>
                </div>

                {/* Step 3: IN_PROGRESS */}
                <div
                  className={`relative z-10 flex items-start gap-3 transition-opacity ${
                    currentStatus === 'Assigned' || currentStatus === 'Accepted' ? 'opacity-40' : 'opacity-100'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 ${
                      currentStatus === 'In Progress'
                        ? 'bg-[#0051d5] text-white shadow-xs animate-pulse'
                        : currentStatus === 'Resolved'
                        ? 'bg-[#dce9ff] text-[#0051d5]'
                        : 'bg-[#f1f5f9] text-[#76777d]'
                    }`}
                  >
                    {currentStatus === 'Resolved' ? (
                      <span className="material-symbols-outlined text-[15px]">check</span>
                    ) : (
                      <span className="material-symbols-outlined text-[15px]">directions_run</span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[#0b1c30]">Step 3: Mark In Progress</span>
                      {currentStatus === 'In Progress' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#dbe1ff] text-[#0051d5] uppercase">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#76777d]">En route or providing immediate on-scene care.</p>
                  </div>
                </div>

                {/* Step 4: RESOLVED */}
                <div
                  className={`relative z-10 flex items-start gap-3 transition-opacity ${
                    currentStatus === 'Resolved' ? 'opacity-100' : 'opacity-40'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 ${
                      currentStatus === 'Resolved' ? 'bg-[#000000] text-white' : 'bg-[#f1f5f9] text-[#76777d]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px]">task_alt</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[#0b1c30]">Step 4: Mark Resolved</span>
                      {currentStatus === 'Resolved' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#d3e4fe] text-[#0051d5] uppercase">
                          Complete
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#76777d]">Patient handed over / scene safe.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Dynamic Action Buttons according strictly to backend state machine */}
            <div className="p-4 rounded-xl bg-[#eff4ff] border border-[#dce9ff] flex flex-col gap-3">
              {actionError && (
                <div className="p-2.5 rounded bg-[#ffdad6] text-[#ba1a1a] text-xs font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">error</span>
                  <span>{actionError}</span>
                </div>
              )}

              {currentStatus === 'Queued' && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-[#c2410c]">
                    <span className="material-symbols-outlined text-[18px]">queue</span>
                    <span className="text-xs font-bold">In Dispatch Queue (Position #{request.queuePosition || 2})</span>
                  </div>
                  <p className="text-xs text-[#45464d] leading-relaxed">
                    This emergency is in your queue. Once your active emergency is completed, this incident will automatically be promoted to active and ready for acceptance.
                  </p>
                  <div className="p-3 bg-[#ffedd5] border border-[#fed7aa] rounded-lg text-xs text-[#c2410c] font-semibold flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px]">info</span>
                    <span>Awaiting completion of active incident</span>
                  </div>
                </div>
              )}

              {currentStatus === 'Assigned' && (
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#76777d]">
                    Decision Required
                  </span>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleAccept}
                    className="w-full py-3 px-4 rounded-lg bg-[#0051d5] text-white hover:bg-[#003ea8] active:scale-[0.99] text-xs font-bold uppercase tracking-wider shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    <span>{isSubmitting ? 'PROCESSING...' : 'ACCEPT ASSIGNMENT'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleReject}
                    className="w-full py-2 px-3 rounded-lg bg-white text-[#ba1a1a] hover:bg-[#ffdad6] text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer border border-[#cbd5e1] disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[16px]">cancel</span>
                    <span>REJECT ASSIGNMENT</span>
                  </button>
                </div>
              )}

              {currentStatus === 'Accepted' && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-[#0051d5]">
                    <span className="material-symbols-outlined text-[18px]">check</span>
                    <span className="text-xs font-bold">Assignment Accepted</span>
                  </div>
                  <p className="text-xs text-[#45464d]">
                    Please proceed directly to the location. Tap below when en route or actively assisting.
                  </p>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleStartProgress}
                    className="w-full py-3 px-4 rounded-lg bg-[#0051d5] text-white hover:bg-[#003ea8] text-xs font-bold uppercase tracking-wider shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer mt-1 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                    <span>{isSubmitting ? 'UPDATING...' : 'START / MARK IN PROGRESS'}</span>
                  </button>
                </div>
              )}

              {currentStatus === 'In Progress' && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-[#0b1c30]">
                    <span className="material-symbols-outlined text-[18px] text-[#0051d5] animate-spin">sync</span>
                    <span className="text-xs font-bold">Intervention In Progress</span>
                  </div>
                  <p className="text-xs text-[#45464d]">
                    Ensure responder safety. Complete patient handover and mark this incident resolved.
                  </p>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleResolve}
                    className="w-full py-3 px-4 rounded-lg bg-[#000000] text-white hover:bg-[#213145] text-xs font-bold uppercase tracking-wider shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer mt-1 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">verified</span>
                    <span>{isSubmitting ? 'RESOLVING...' : 'MARK INCIDENT RESOLVED'}</span>
                  </button>
                </div>
              )}

              {currentStatus === 'Resolved' && (
                <div className="flex flex-col gap-2 text-center py-2">
                  <div className="w-10 h-10 rounded-full bg-[#dbe1ff] mx-auto flex items-center justify-center text-[#0051d5] mb-1">
                    <span className="material-symbols-outlined text-[22px]">task_alt</span>
                  </div>
                  <span className="text-sm font-bold text-[#0b1c30]">Incident Resolved</span>
                  <p className="text-xs text-[#45464d]">
                    Incident log has been sealed and dispatched back to central dispatch registry.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('volunteer-requests')}
                    className="w-full py-2 px-3 rounded-lg bg-white text-[#0b1c30] text-xs font-bold hover:bg-[#f8f9ff] border border-[#cbd5e1] mt-2 cursor-pointer"
                  >
                    Return to Requests List
                  </button>
                </div>
              )}
            </div>

            {/* Protocol Notice */}
            <div className="p-2.5 rounded bg-[#f8f9ff] flex items-center gap-2 border border-[#e2e8f0]">
              <span className="material-symbols-outlined text-[16px] text-[#0051d5]">shield</span>
              <span className="text-[11px] text-[#45464d]">
                Civilian Good Samaritan protocols apply. Backup is on standby.
              </span>
            </div>
          </div>

          {/* Quick First Response Guide */}
          <div className="bg-white rounded-xl shadow-xs border border-[#e2e8f0] p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#0051d5] shrink-0 border border-[#dce9ff]">
              <span className="material-symbols-outlined text-[20px]">medical_information</span>
            </div>
            <div>
              <span className="text-xs font-bold text-[#0b1c30] block">Standard First Response Steps</span>
              <span className="text-[11px] text-[#45464d]">
                1. Assess scene → 2. Stop bleeding → 3. Keep warm
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
