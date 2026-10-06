import React, { useState } from 'react';
import { api } from '../services/api';
import { IncidentMap } from './IncidentMap';

export interface CitizenEmergencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEmergencyCreated?: (req: any) => void;
}

type GeoStatus = 'idle' | 'requesting' | 'success' | 'permission_denied' | 'timeout' | 'unavailable' | 'unsupported';

export const CitizenEmergencyModal: React.FC<CitizenEmergencyModalProps> = ({
  isOpen,
  onClose,
  onEmergencyCreated,
}) => {
  const [category, setCategory] = useState<'medicine' | 'emergency' | 'transport' | 'other' | 'fall'>('emergency');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [locationText, setLocationText] = useState('');
  
  // Geolocation state
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');
  const [geoErrorMsg, setGeoErrorMsg] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [locationSource, setLocationSource] = useState<'browser_gps' | 'manual_pin' | 'caller_provided'>('caller_provided');
  const [showManualCorrectionMap, setShowManualCorrectionMap] = useState(false);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successReceipt, setSuccessReceipt] = useState<{
    requestId: string;
    status: string;
    emergency: boolean;
    location: string;
  } | null>(null);

  if (!isOpen) return null;

  // Explicit user-triggered location capture
  const handleRequestLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus('unsupported');
      setGeoErrorMsg('Geolocation is not supported by your browser.');
      return;
    }

    setGeoStatus('requesting');
    setGeoErrorMsg(null);

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000, // 10s timeout
      maximumAge: 0, // Fresh coordinates
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 100000) / 100000;
        const lng = Math.round(pos.coords.longitude * 100000) / 100000;
        const acc = Math.round(pos.coords.accuracy * 10) / 10;
        const timestampIso = new Date(pos.timestamp).toISOString();

        setLatitude(lat);
        setLongitude(lng);
        setAccuracyMeters(acc);
        setCapturedAt(timestampIso);
        setLocationSource('browser_gps');
        setGeoStatus('success');
        setGeoErrorMsg(null);

        // Pre-fill location text if empty
        if (!locationText.trim()) {
          setLocationText(`GPS Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
        }
      },
      (err) => {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setGeoStatus('permission_denied');
            setGeoErrorMsg('Location permission denied. You can continue by entering your address manually below.');
            break;
          case err.TIMEOUT:
            setGeoStatus('timeout');
            setGeoErrorMsg('GPS request timed out. Please enter your location or landmark manually.');
            break;
          case err.POSITION_UNAVAILABLE:
          default:
            setGeoStatus('unavailable');
            setGeoErrorMsg('Unable to determine location. Please specify your address or nearest landmark.');
            break;
        }
      },
      options
    );
  };

  const handlePinSelect = (newLat: number, newLng: number) => {
    const lat = Math.round(newLat * 100000) / 100000;
    const lng = Math.round(newLng * 100000) / 100000;
    setLatitude(lat);
    setLongitude(lng);
    setLocationSource('manual_pin');
    setCapturedAt(new Date().toISOString());
    setAccuracyMeters(10); // Precise manual pin
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);

    try {
      const payload: any = {
        category,
        urgency_level: 'critical',
        description: description.trim() || 'Citizen SOS emergency assistance request.',
        phone: phone.trim() || undefined,
        location_text: locationText.trim() || (latitude ? `GPS (${latitude}, ${longitude})` : 'Location unspecified'),
      };

      if (latitude != null && longitude != null) {
        payload.latitude = latitude;
        payload.longitude = longitude;
        payload.accuracy_meters = accuracyMeters;
        payload.location_source = locationSource;
        payload.location_captured_at = capturedAt || new Date().toISOString();
      }

      const res = await api.createCitizenEmergency(payload);
      setSuccessReceipt({
        requestId: res.requestId,
        status: res.status,
        emergency: res.emergency,
        location: res.location || payload.location_text,
      });

      if (onEmergencyCreated) {
        onEmergencyCreated(res);
      }
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to submit emergency request. Please call 112 directly.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setSuccessReceipt(null);
    setDescription('');
    setLocationText('');
    setLatitude(null);
    setLongitude(null);
    setAccuracyMeters(null);
    setGeoStatus('idle');
    setGeoErrorMsg(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 md:p-7 border border-[#e2e8f0] relative my-8 animate-fadeIn">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleResetAndClose}
          className="absolute top-4 right-4 text-[#76777d] hover:text-[#0b1c30] p-1.5 rounded-full hover:bg-[#eff4ff] transition-colors cursor-pointer"
          title="Close dialog"
        >
          <span className="material-symbols-outlined text-[22px]">close</span>
        </button>

        {/* Success Confirmation Screen */}
        {successReceipt ? (
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-16 h-16 rounded-full bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center mb-4 shadow-sm animate-bounce">
              <span className="material-symbols-outlined text-[36px]">crisis_alert</span>
            </div>
            <h2 className="text-xl font-bold text-[#0b1c30] font-display">
              Emergency Request Logged
            </h2>
            <p className="text-xs text-[#45464d] mt-1 max-w-sm">
              Your request has been ingested by the Sahayak CAD Dispatch Gateway. Responders and administrators have been alerted.
            </p>

            <div className="w-full bg-[#eff4ff] p-4 rounded-xl my-4 text-left border border-[#dce9ff] flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#76777d]">Incident Reference:</span>
                <span className="font-mono font-bold text-[#0051d5]">
                  {String(successReceipt.requestId).slice(-6).toUpperCase()}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#76777d]">Dispatch Status:</span>
                <span className="font-bold text-[#ba1a1a] uppercase">
                  {successReceipt.status}
                </span>
              </div>
              <div className="flex items-start justify-between text-xs">
                <span className="text-[#76777d]">Target Location:</span>
                <span className="font-semibold text-[#0b1c30] text-right max-w-[200px]">
                  {successReceipt.location}
                </span>
              </div>
              {latitude != null && longitude != null && (
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[#76777d]">GPS Coordinates:</span>
                  <span className="text-[#0051d5]">
                    {latitude.toFixed(4)}°N, {longitude.toFixed(4)}°E
                  </span>
                </div>
              )}
            </div>

            <p className="text-[11px] text-[#76777d] mb-4">
              If life is in immediate danger, also dial <strong>112</strong> immediately.
            </p>

            <button
              type="button"
              onClick={handleResetAndClose}
              className="w-full py-3 rounded-lg bg-[#0051d5] text-white font-bold text-xs uppercase tracking-wider hover:bg-[#003ea8] transition-colors cursor-pointer"
            >
              Done / Return
            </button>
          </div>
        ) : (
          /* Form Content */
          <div>
            {/* Header */}
            <div className="flex items-center gap-3 pb-3 border-b border-[#f1f5f9]">
              <div className="w-10 h-10 rounded-full bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">e911_emergency</span>
              </div>
              <div className="flex flex-col text-left">
                <h2 className="text-lg font-bold text-[#0b1c30] font-display">
                  Citizen Emergency SOS
                </h2>
                <p className="text-xs text-[#45464d]">
                  Request urgent assistance from nearby responders and emergency services
                </p>
              </div>
            </div>

            {submitError && (
              <div className="mt-3 p-3 rounded-lg bg-[#ffdad6] text-[#ba1a1a] text-xs flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">error</span>
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4 text-left">
              {/* Category Selection */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[#0b1c30]">Emergency Category</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'emergency', label: 'Life Threat', icon: 'crisis_alert' },
                    { id: 'medicine', label: 'Medical / Health', icon: 'medical_services' },
                    { id: 'fall', label: 'Fall / Senior', icon: 'personal_injury' },
                    { id: 'transport', label: 'Accident / Transit', icon: 'car_crash' },
                    { id: 'other', label: 'Other Urgent', icon: 'emergency' },
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setCategory(item.id as any)}
                      className={`p-2.5 rounded-lg border text-left flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                        category === item.id
                          ? 'border-[#ba1a1a] bg-[#ffdad6]/40 text-[#ba1a1a] font-bold shadow-xs'
                          : 'border-[#e2e8f0] bg-[#eff4ff]/60 text-[#45464d] hover:bg-[#eff4ff]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                      <span className="text-[11px] text-center leading-tight">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Explicit Location Sharing Control */}
              <div className="p-3.5 rounded-xl border border-[#cbd5e1] bg-[#eff4ff]/60 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#0b1c30]">
                    <span className="material-symbols-outlined text-[#0051d5] text-[18px]">my_location</span>
                    <span>GPS Telemetry</span>
                  </div>

                  {geoStatus === 'success' ? (
                    <span className="text-[11px] font-bold text-[#006e1c] flex items-center gap-1 bg-[#d4f8d3] px-2 py-0.5 rounded-full">
                      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                      GPS Locked
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#76777d]">Explicit User Consent</span>
                  )}
                </div>

                {/* State: Idle or Failed */}
                {geoStatus === 'idle' && (
                  <button
                    type="button"
                    onClick={handleRequestLocation}
                    className="w-full py-2.5 px-3 rounded-lg bg-[#0051d5] hover:bg-[#003ea8] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[16px]">near_me</span>
                    <span>Share My GPS Location (Single Capture)</span>
                  </button>
                )}

                {/* State: Requesting */}
                {geoStatus === 'requesting' && (
                  <div className="p-2.5 rounded-lg bg-white border border-[#cbd5e1] flex items-center gap-2 text-xs text-[#0051d5]">
                    <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                    <span>Acquiring satellite GPS fix... Please allow browser location access.</span>
                  </div>
                )}

                {/* State: Error / Denied / Timeout */}
                {['permission_denied', 'timeout', 'unavailable', 'unsupported'].includes(geoStatus) && (
                  <div className="p-2.5 rounded-lg bg-[#ffdad6]/60 border border-[#ffdad6] text-xs text-[#ba1a1a] flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5 font-bold">
                      <span className="material-symbols-outlined text-[16px]">location_disabled</span>
                      <span>GPS Unavailable</span>
                    </div>
                    <p className="text-[11px] text-[#45464d]">{geoErrorMsg}</p>
                    <button
                      type="button"
                      onClick={handleRequestLocation}
                      className="self-start text-[11px] font-semibold text-[#0051d5] hover:underline cursor-pointer"
                    >
                      Retry Location Request
                    </button>
                  </div>
                )}

                {/* State: Success */}
                {geoStatus === 'success' && latitude != null && longitude != null && (
                  <div className="flex flex-col gap-2">
                    <div className="p-2.5 rounded-lg bg-white border border-[#cbd5e1] flex items-center justify-between text-xs">
                      <div>
                        <span className="font-mono font-bold text-[#0b1c30]">
                          {latitude.toFixed(5)}°N, {longitude.toFixed(5)}°E
                        </span>
                        {accuracyMeters != null && (
                          <span className="text-[11px] text-[#76777d] block">
                            Accuracy: ±{Math.round(accuracyMeters)} meters ({locationSource})
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowManualCorrectionMap(!showManualCorrectionMap)}
                        className="text-xs font-semibold text-[#0051d5] hover:text-[#003ea8] px-2 py-1 rounded hover:bg-[#eff4ff] cursor-pointer"
                      >
                        {showManualCorrectionMap ? 'Hide Map' : 'Adjust Pin'}
                      </button>
                    </div>

                    {/* Interactive Map for manual correction */}
                    {showManualCorrectionMap && (
                      <div className="flex flex-col gap-1.5 animate-fadeIn">
                        <span className="text-[11px] text-[#45464d]">
                          Click on the map or drag the pin to refine exact incident location:
                        </span>
                        <IncidentMap
                          latitude={latitude}
                          longitude={longitude}
                          accuracyMeters={accuracyMeters}
                          locationText={locationText}
                          heightClass="h-44"
                          enablePinSelection={true}
                          onPinSelect={handlePinSelect}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Text Address / Landmark */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[#0b1c30] flex items-center justify-between">
                  <span>Address or Landmark Description</span>
                  <span className="text-[10px] text-[#76777d]">Always editable</span>
                </label>
                <input
                  type="text"
                  value={locationText}
                  onChange={e => setLocationText(e.target.value)}
                  placeholder="e.g. 14th Main Road, near HAL 2nd Stage Water Tank"
                  required
                  className="w-full bg-[#eff4ff] text-[#0b1c30] text-xs p-2.5 rounded-lg border border-[#cbd5e1] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0051d5]"
                />
              </div>

              {/* Phone Number */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[#0b1c30]">
                  Contact Phone Number (Optional)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full bg-[#eff4ff] text-[#0b1c30] text-xs p-2.5 rounded-lg border border-[#cbd5e1] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0051d5]"
                />
              </div>

              {/* Situation Description */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[#0b1c30]">
                  Emergency Description / What happened?
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Briefly describe the emergency condition, symptoms, or assistance required..."
                  className="w-full bg-[#eff4ff] text-[#0b1c30] text-xs p-2.5 rounded-lg border border-[#cbd5e1] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0051d5]"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#f1f5f9]">
                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="px-4 py-2.5 rounded-lg text-xs font-semibold text-[#45464d] hover:bg-[#eff4ff] cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-lg bg-[#ba1a1a] hover:bg-[#93000a] text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer shadow-md disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                      <span>Alerting CAD...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">send</span>
                      <span>Dispatch Emergency</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
