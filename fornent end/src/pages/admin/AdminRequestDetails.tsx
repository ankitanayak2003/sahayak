import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { IncidentMap } from '../../components/IncidentMap';

export const AdminRequestDetails: React.FC = () => {
  const {
    requests,
    activeRequestId,
    volunteers,
    navigate,
    assignVolunteerToRequest,
    autoAssignVolunteerToRequest,
    updateRequestStatus,
    escalateRequest,
    fetchRequestDetails,
  } = useApp();

  const request = requests.find(r => r.id === activeRequestId) || requests[0];
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [stopwatchSeconds, setStopwatchSeconds] = useState(0);
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [actionAlert, setActionAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Ingest live request details and audit history from backend
  useEffect(() => {
    if (activeRequestId) {
      fetchRequestDetails(activeRequestId);
    }
  }, [activeRequestId, fetchRequestDetails]);

  // Live stopwatch effect
  useEffect(() => {
    const timer = setInterval(() => {
      setStopwatchSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Audio simulation effect
  useEffect(() => {
    let audioTimer: any;
    if (isPlayingAudio) {
      audioTimer = setInterval(() => {
        setAudioProgress(prev => {
          if (prev >= 100) {
            setIsPlayingAudio(false);
            return 0;
          }
          return prev + 5;
        });
      }, 500);
    }
    return () => clearInterval(audioTimer);
  }, [isPlayingAudio]);

  const formatStopwatch = (totalSeconds: number) => {
    const hrs = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const mins = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const secs = String(totalSeconds % 60).padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  const handleEscalate = async () => {
    if (!request) return;
    if (confirm('Confirm escalation to 112 Emergency Dispatch?')) {
      setActionAlert(null);
      try {
        await escalateRequest(request.id, '112 Emergency Dispatch', 'Critical escalation by police admin.');
        setActionAlert({ type: 'success', message: 'Request escalated to 112 Emergency Dispatch.' });
      } catch (err: any) {
        setActionAlert({ type: 'error', message: err.message || 'Escalation failed.' });
      }
    }
  };

  const handleAutoAssign = async () => {
    if (!request) return;
    setAutoAssigning(true);
    setActionAlert(null);
    try {
      const res = await autoAssignVolunteerToRequest(request.id);
      if (res.success) {
        setActionAlert({ type: 'success', message: res.message || 'Volunteer successfully auto-assigned.' });
      } else {
        setActionAlert({ type: 'error', message: res.message || 'Auto-assignment failed.' });
      }
    } catch (err: any) {
      setActionAlert({ type: 'error', message: err.message || 'Auto-assign failed.' });
    } finally {
      setAutoAssigning(false);
    }
  };

  const handleStatusUpdate = async (newStatus: any) => {
    if (!request) return;
    setActionAlert(null);
    try {
      await updateRequestStatus(request.id, newStatus);
      setActionAlert({ type: 'success', message: `Request status transitioned to ${newStatus}.` });
    } catch (err: any) {
      setActionAlert({ type: 'error', message: err.message || 'Status update failed.' });
    }
  };

  if (!request) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-xs border border-[#e2e8f0]">
        <span className="material-symbols-outlined text-4xl text-[#76777d] mb-2">hourglass_empty</span>
        <p className="text-sm text-[#45464d]">No incident request selected.</p>
        <button
          type="button"
          onClick={() => navigate('admin-requests')}
          className="mt-4 px-4 py-2 bg-[#0051d5] text-white text-xs font-semibold rounded-lg hover:bg-[#003ea8] cursor-pointer"
        >
          View All Requests
        </button>
      </div>
    );
  }

  const isCritical = request.severity === 'Critical';

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* Reassign Volunteer Modal */}
      {reassignModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-[#e2e8f0]">
            <div className="flex items-center justify-between pb-3 border-b border-[#f1f5f9]">
              <h3 className="text-base font-bold text-[#0b1c30] font-display">
                Manual Override / Reassign Volunteer for {request.id.slice(-6).toUpperCase()}
              </h3>
              <button
                type="button"
                onClick={() => setReassignModalOpen(false)}
                className="text-[#76777d] hover:text-[#0b1c30] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <p className="text-xs text-[#45464d] my-3 text-left">
              Admin Manual Override: transfer incident assignment to an eligible verified responder in pool:
            </p>

            <div className="max-h-60 overflow-y-auto divide-y divide-[#f1f5f9] border border-[#e5eeff] rounded-lg">
              {volunteers.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#76777d]">
                  No eligible verified volunteers available.
                </div>
              ) : (
                volunteers.map(vol => (
                  <div
                    key={vol.id}
                    className="p-3 hover:bg-[#eff4ff] flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#0051d5] text-white flex items-center justify-center text-xs font-bold">
                        {vol.avatarInitials}
                      </div>
                      <div className="flex flex-col text-left">
                        <span className="text-xs font-bold text-[#0b1c30]">{vol.name}</span>
                        <span className="text-[10px] text-[#76777d]">
                          {vol.status} • {vol.assignmentText || 'Available'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await assignVolunteerToRequest(request.id, vol.id, vol.name);
                          setReassignModalOpen(false);
                          setActionAlert({ type: 'success', message: `Assigned to ${vol.name}` });
                        } catch (e: any) {
                          setActionAlert({ type: 'error', message: e.message || 'Assignment failed' });
                        }
                      }}
                      className="px-3 py-1 bg-[#0051d5] text-white rounded text-xs font-semibold hover:bg-[#003ea8] cursor-pointer"
                    >
                      Assign
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-[#f1f5f9] flex justify-end">
              <button
                type="button"
                onClick={() => setReassignModalOpen(false)}
                className="px-4 py-1.5 text-xs text-[#45464d] hover:bg-[#eff4ff] rounded cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Sub-Navigation & Header Bar */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => navigate('admin-requests')}
          className="inline-flex items-center gap-1 text-xs font-bold text-[#0051d5] hover:text-[#003ea8] transition-colors w-fit group cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px] group-hover:-translate-x-1 transition-transform">
            arrow_back
          </span>
          <span>Back to Emergency Requests</span>
        </button>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-[#0b1c30] tracking-tight font-display">
              Request {request.id.slice(-6).toUpperCase()} — {request.title}
            </h1>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#dbe1ff] text-[#0051d5] text-xs font-bold tracking-wide uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0051d5] animate-pulse" />
                {request.status}
              </span>

              <span
                className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs tracking-wide uppercase font-bold ${
                  isCritical ? 'bg-[#ffdad6] text-[#ba1a1a]' : 'bg-[#eff4ff] text-[#0051d5]'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${isCritical ? 'bg-[#ba1a1a]' : 'bg-[#0051d5]'}`}
                />
                {request.severity}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-[#45464d] bg-[#eff4ff] px-3 py-1 rounded-full border border-[#dce9ff]">
            <span className="material-symbols-outlined text-[16px] text-[#0051d5]">wifi_tethering</span>
            <span className="font-semibold text-[11px]">LIVE TELEMETRY STREAM ACTIVE</span>
          </div>
        </div>
      </div>

      {actionAlert && (
        <div
          className={`p-3.5 rounded-xl text-xs font-bold flex items-center justify-between ${
            actionAlert.type === 'success'
              ? 'bg-[#dce9ff] text-[#0051d5]'
              : 'bg-[#ffdad6] text-[#ba1a1a]'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">
              {actionAlert.type === 'success' ? 'verified' : 'error'}
            </span>
            <span>{actionAlert.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionAlert(null)}
            className="hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Layout (Bento split strictly following approved design) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Core Data & Transcript (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Card 1: Emergency Information */}
          <section className="bg-white rounded-xl shadow-xs border border-[#e2e8f0] p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#000000]">
                  <span className="material-symbols-outlined text-[20px]">emergency</span>
                </div>
                <h2 className="text-base font-bold text-[#0b1c30] font-display">Emergency Information</h2>
              </div>
              <span className="text-xs font-mono font-bold text-[#76777d] uppercase tracking-wider">
                REF ID: {request.refId}
              </span>
            </div>

            {/* Metrics triplet */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
              <div className="bg-[#eff4ff] p-3 rounded-lg flex flex-col text-left">
                <span className="text-[10px] font-bold text-[#76777d] uppercase">Category</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="material-symbols-outlined text-[18px] text-[#ba1a1a]">
                    medical_services
                  </span>
                  <span className="text-sm font-bold text-[#0b1c30]">{request.category}</span>
                </div>
              </div>

              <div className="bg-[#eff4ff] p-3 rounded-lg flex flex-col text-left">
                <span className="text-[10px] font-bold text-[#76777d] uppercase">Severity</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="material-symbols-outlined text-[18px] text-[#ba1a1a]">
                    priority_high
                  </span>
                  <span className="text-sm font-bold text-[#ba1a1a]">{request.severity}</span>
                </div>
              </div>

              <div className="bg-[#eff4ff] p-3 rounded-lg flex flex-col text-left col-span-2 sm:col-span-1">
                <span className="text-[10px] font-bold text-[#76777d] uppercase">Incident Status</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="material-symbols-outlined text-[18px] text-[#0051d5]">sync</span>
                  <span className="text-sm font-bold text-[#0b1c30]">{request.status}</span>
                </div>
              </div>
            </div>

            {/* Address & Created time */}
            <div className="flex flex-col gap-2 pt-1 text-left">
              <div className="flex items-start gap-3 bg-[#eff4ff] p-3.5 rounded-lg border border-[#dce9ff]/60">
                <span className="material-symbols-outlined text-[#0051d5] text-[22px] mt-0.5 shrink-0">
                  pin_drop
                </span>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-[10px] font-bold text-[#76777d] uppercase">Incident Address</span>
                  <span className="text-sm text-[#0b1c30] font-semibold">{request.location}</span>
                  <span className="text-xs text-[#76777d] mt-0.5 font-mono">
                    Geo-Coordinates: {request.geoCoords} • Accuracy: {request.accuracy}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 px-1 text-xs text-[#45464d]">
                <span className="material-symbols-outlined text-[16px] text-[#76777d]">schedule</span>
                <span>
                  Created: <strong className="text-[#0b1c30]">{request.createdAt}</strong> ({request.elapsedMinutes} mins ago)
                </span>
              </div>
            </div>

            {/* Incident Map Viewport */}
            <div className="w-full pt-1">
              <IncidentMap
                latitude={request.latitude}
                longitude={request.longitude}
                accuracyMeters={request.accuracyMeters}
                locationText={request.location}
                title={`Incident ${request.refId}`}
                heightClass="h-48"
                showNavigationLink={true}
              />
            </div>
          </section>

          {/* Card 2: AI Classification & Voice Transcript Summary */}
          <section className="bg-white rounded-xl shadow-xs border border-[#e2e8f0] p-6 flex flex-col gap-4 text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#0051d5]">
                  <span className="material-symbols-outlined text-[20px]">smart_toy</span>
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#0b1c30] font-display">
                    AI Classification & Voice Transcript Summary
                  </h2>
                  <p className="text-xs text-[#76777d]">
                    Automated natural language processing of incoming emergency call
                  </p>
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#eff4ff] text-[11px] font-bold text-[#0051d5] border border-[#dce9ff]">
                <span className="material-symbols-outlined text-[16px]">verified</span>
                <span>Gemini Intaker Ingested</span>
              </div>
            </div>

            {/* Score Pair */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#eff4ff] p-3.5 rounded-lg border border-[#dce9ff]/60">
              <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-[#e2e8f0]">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-[#76777d] uppercase">Classification</span>
                  <span className="text-sm font-bold text-[#0b1c30]">
                    {request.aiClassification.predictedCategory}
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs font-bold text-[#0051d5]">
                    {request.aiClassification.confidence}% Match
                  </span>
                  <div className="w-16 h-1.5 bg-[#e5eeff] rounded-full overflow-hidden mt-1">
                    <div
                      className="bg-[#0051d5] h-full rounded-full"
                      style={{ width: `${request.aiClassification.confidence}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-[#e2e8f0]">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-[#76777d] uppercase">Calculated Severity</span>
                  <span className="text-sm font-bold text-[#ba1a1a]">
                    {request.aiClassification.calculatedSeverity}
                  </span>
                </div>
                <span className="material-symbols-outlined text-[#ba1a1a] text-[24px]">crisis_alert</span>
              </div>
            </div>

            {/* Extracted Information & Clinical Signals */}
            <div className="flex flex-col gap-2 bg-[#eff4ff] p-4 rounded-lg border border-[#dce9ff]/60">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-[#0b1c30]">mic</span>
                <span className="text-xs font-bold text-[#0b1c30]">
                  Extracted Information & Voice Signals
                </span>
              </div>
              <p className="text-xs text-[#0b1c30] leading-relaxed">
                {request.aiClassification.transcriptSummary}
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {request.aiClassification.clinicalSignals.map((signal, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white text-[#45464d] text-[11px] font-semibold border border-[#e2e8f0]"
                  >
                    <span className="material-symbols-outlined text-[14px] text-[#0051d5]">
                      {idx === 0 ? 'vital_signs' : idx === 1 ? 'air' : 'settings_voice'}
                    </span>
                    <span>{signal}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Audio Waveform Player Simulation */}
            <div className="flex items-center justify-between bg-[#eff4ff] px-4 py-2.5 rounded-lg border border-[#dce9ff]">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                  className="w-9 h-9 rounded-full bg-[#000000] text-white flex items-center justify-center hover:bg-[#213145] transition-colors cursor-pointer shrink-0"
                  title={isPlayingAudio ? 'Pause' : 'Play audio recording'}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {isPlayingAudio ? 'pause' : 'play_arrow'}
                  </span>
                </button>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-[#0b1c30]">Audio Feed Recording</span>
                  <span className="text-[11px] text-[#76777d]">
                    {request.aiClassification.audioDuration} • Direct Inbound Ingestion
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 h-7">
                {[3, 6, 2, 8, 5, 7, 3, 5, 2, 6].map((h, i) => (
                  <span
                    key={i}
                    className={`w-1 rounded-full bg-[#0051d5] transition-all duration-300 ${
                      isPlayingAudio ? 'animate-pulse' : 'opacity-70'
                    }`}
                    style={{
                      height: isPlayingAudio ? `${Math.min(28, (h * 4) + (audioProgress % 10))}px` : `${h * 3}px`,
                    }}
                  />
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Operations & Step Machine Timeline (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6 text-left">
          {/* Card 3: Assignment & Operations */}
          <section className="bg-white rounded-xl shadow-xs border border-[#e2e8f0] p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#0051d5]">
                  <span className="material-symbols-outlined text-[20px]">assignment_ind</span>
                </div>
                <h2 className="text-base font-bold text-[#0b1c30] font-display">Assignment & Operations</h2>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#eff4ff] text-[10px] font-bold text-[#0051d5] uppercase tracking-wider">
                DISPATCH UNIT
              </span>
            </div>

            {/* Responder Profile Badge */}
            <div className="bg-[#eff4ff] p-4 rounded-xl flex flex-col gap-3 border border-[#dce9ff]">
              {request.assignedVolunteerName ? (
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#0051d5] text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0">
                    {request.assignedVolunteerName.split(' ').map(n => n[0]).join('').substring(0, 2)}
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-[#0b1c30] truncate">
                        {request.assignedVolunteerName}
                      </span>
                      <span className="text-xs font-mono font-bold text-[#76777d]">
                        {request.assignedVolunteerBadge}
                      </span>
                    </div>
                    <span className="text-xs text-[#0051d5] font-semibold">
                      Assigned First Responder
                    </span>
                    <div className="flex items-center gap-1 mt-1 text-[11px] text-[#45464d]">
                      <span className="material-symbols-outlined text-[15px] text-[#0051d5]">verified</span>
                      <span>Verified Active Dispatch Volunteer</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 py-2">
                  <div className="w-10 h-10 rounded-full bg-[#cbd5e1] text-white flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">person_off</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-[#0b1c30]">No Volunteer Assigned</span>
                    <span className="text-[11px] text-[#76777d]">Ready for auto or manual allocation</span>
                  </div>
                </div>
              )}

              <div className="bg-white p-2.5 rounded-lg border border-[#e2e8f0] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0051d5] animate-ping" />
                  <span className="text-xs font-bold text-[#0b1c30]">
                    Status: {request.status} {request.queuePosition ? `(Queue #${request.queuePosition})` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs font-bold text-[#0b1c30]">
                  <span className="material-symbols-outlined text-[16px] text-[#0051d5]">navigation</span>
                  <span>ETA {request.assignedVolunteerEta || 'En Route'}</span>
                </div>
              </div>
            </div>

            {/* Rapid Dispatch Actions */}
            <div className="flex flex-col gap-2.5 pt-1">
              <button
                type="button"
                disabled={autoAssigning}
                onClick={handleAutoAssign}
                className="w-full h-11 px-4 rounded-lg bg-[#0051d5] hover:bg-[#003ea8] text-white font-bold text-xs tracking-wider uppercase shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {autoAssigning ? 'sync' : 'auto_mode'}
                </span>
                <span>{autoAssigning ? 'AUTO-ASSIGNING...' : 'AUTO-ASSIGN VOLUNTEER'}</span>
              </button>

              <button
                type="button"
                onClick={() => setReassignModalOpen(true)}
                className="w-full h-11 px-4 rounded-lg bg-[#eff4ff] hover:bg-[#dce9ff] text-[#0b1c30] font-bold text-xs tracking-wider uppercase transition-colors flex items-center justify-center gap-2 cursor-pointer border border-[#dce9ff]"
              >
                <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
                <span>MANUAL OVERRIDE / REASSIGN</span>
              </button>

              {/* Status Update Quick Transitions */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleStatusUpdate('In Progress')}
                  className="py-2.5 px-3 rounded-lg bg-[#eff4ff] hover:bg-[#dce9ff] text-[#0051d5] font-bold text-[11px] tracking-wider uppercase transition-colors flex items-center justify-center gap-1.5 border border-[#dce9ff] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">sync</span>
                  <span>In Progress</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusUpdate('Resolved')}
                  className="py-2.5 px-3 rounded-lg bg-[#eff4ff] hover:bg-[#dce9ff] text-[#0b1c30] font-bold text-[11px] tracking-wider uppercase transition-colors flex items-center justify-center gap-1.5 border border-[#dce9ff] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  <span>Resolved</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleEscalate}
                className="w-full h-11 px-4 rounded-lg bg-[#ba1a1a] hover:bg-[#93000a] text-white font-bold text-xs tracking-wider uppercase shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">local_hospital</span>
                <span>ESCALATE TO 112 DISPATCH</span>
              </button>
            </div>
          </section>

          {/* Card 4: Request History Timeline */}
          <section className="bg-white rounded-xl shadow-xs border border-[#e2e8f0] p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#0b1c30]">
                  <span className="material-symbols-outlined text-[20px]">history_toggle_off</span>
                </div>
                <h2 className="text-base font-bold text-[#0b1c30] font-display">Request History Timeline</h2>
              </div>
              <span className="text-[11px] font-bold text-[#76777d] uppercase">Audit Trail</span>
            </div>

            <p className="text-xs text-[#76777d]">
              Lifecycle events recorded in backend audit log
            </p>

            {/* Vertical Timeline Steps */}
            <div className="relative pl-6 flex flex-col gap-4 pt-1">
              <div className="absolute left-2.5 top-3 bottom-3 w-0.5 bg-[#dce9ff]" />

              {request.timeline.map((step, idx) => {
                const isCurrent = step.current;
                const isDone = step.completed;

                return (
                  <div key={idx} className="relative flex items-start gap-3">
                    <div
                      className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                        isDone
                          ? 'bg-[#0051d5] text-white'
                          : isCurrent
                          ? 'bg-[#dce9ff] text-[#0051d5]'
                          : 'bg-[#e2e8f0] text-[#76777d]'
                      }`}
                    >
                      {isDone ? (
                        <span className="material-symbols-outlined text-[13px]">check</span>
                      ) : isCurrent ? (
                        <span className="w-2 h-2 rounded-full bg-[#0051d5] animate-ping" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#94a3b8]" />
                      )}
                    </div>

                    <div
                      className={`flex flex-col w-full ${
                        isCurrent ? 'bg-[#eff4ff] p-2.5 rounded-lg border border-[#dce9ff]' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#0b1c30]">{step.title}</span>
                        <span className="text-[10px] text-[#76777d] font-mono">{step.timestamp}</span>
                      </div>
                      <span className="text-[11px] text-[#45464d] mt-0.5 leading-snug">
                        {step.description}
                      </span>
                      {isCurrent && (
                        <span className="mt-1 w-fit text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#d3e4fe] text-[#0051d5]">
                          Current Stage
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {/* Quick Telemetry & Audit Bar Footer */}
      <div className="bg-white rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs border border-[#e2e8f0]">
        <div className="flex items-center gap-3 text-xs text-[#45464d]">
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-[#0051d5]">verified_user</span>
            <span>Encrypted Audit Trail Synced</span>
          </span>
          <span className="hidden sm:inline">•</span>
          <span className="hidden sm:inline font-mono">Incident: {request.id}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[#76777d] font-semibold">Incident Stopwatch:</span>
          <span className="text-sm text-[#0b1c30] font-mono font-bold">
            {formatStopwatch(stopwatchSeconds)}
          </span>
        </div>
      </div>
    </div>
  );
};
