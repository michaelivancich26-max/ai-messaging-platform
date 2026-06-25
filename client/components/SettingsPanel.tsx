"use client";

interface Settings {
  factualCorrection: boolean;
  ambiguityResolution: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (s: Settings) => void;
}

function Toggle({ enabled, onChange, label, description }: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div>
        <p className="text-sm font-medium text-gray-100">{label}</p>
        <p className="mt-0.5 text-xs text-gray-500">{description}</p>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
          enabled ? "bg-indigo-600" : "bg-gray-700"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            enabled ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export default function SettingsPanel({ open, onClose, settings, onChange }: Props) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-20 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-30 flex h-full w-72 flex-col bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-100">Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 divide-y divide-gray-800 px-5">
          <div>
            <p className="pt-5 pb-1 text-xs font-semibold uppercase tracking-widest text-gray-600">AI Features</p>
            <Toggle
              enabled={settings.factualCorrection}
              onChange={(v) => onChange({ ...settings, factualCorrection: v })}
              label="Factual Correction"
              description="Shows an amber card when a message contains a likely factual error."
            />
            <Toggle
              enabled={settings.ambiguityResolution}
              onChange={(v) => onChange({ ...settings, ambiguityResolution: v })}
              label="Ambiguity Resolution"
              description="Highlights pronouns with unclear referents and shows what they refer to on hover."
            />
          </div>
        </div>
      </div>
    </>
  );
}

export type { Settings };
