\
"use client";

import { useEffect, useRef, useState } from "react";

const NOW = () => new Date();
const pad2 = (n) => String(n).padStart(2, "0");
const formatClock = (ms) => {
  if (ms < 0 || ms == null) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
};
const fmtTime = (d) =>
  `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

const DEFAULT_RHYTHMS = ["VF/VT", "PEA", "Asystole", "ROSC", "Unknown"];
const DEFAULT_DRUGS = [
  { code: "EPI", label: "Epinephrine 1 mg IV/IO", defaultDose: "1 mg" },
  { code: "AMIO", label: "Amiodarone 300 mg IV/IO", defaultDose: "300 mg" },
  { code: "AMIO150", label: "Amiodarone 150 mg", defaultDose: "150 mg" },
  { code: "LIDO", label: "Lidocaine 1–1.5 mg/kg", defaultDose: "" },
  { code: "MgSO4", label: "Magnesium 1–2 g", defaultDose: "" },
  { code: "CaCl2", label: "Calcium Chloride", defaultDose: "" },
  { code: "NaHCO3", label: "Sodium Bicarbonate", defaultDose: "" },
];
const SHOCK_LEVELS = [120, 150, 200, 300, 360];

function useTicker(enabled, interval = 250) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), interval);
    return () => clearInterval(id);
  }, [enabled, interval]);
}

function useLocalStorage(key, initialValue) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);
  return [state, setState];
}

function Section({ title, children, right }) {
  return (
    <div className="bg-white/80 backdrop-blur rounded-2xl shadow p-4 border border-slate-200">
      <div className="flex items-center mb-3">
        <h2 className="text-slate-800 font-semibold text-lg">{title}</h2>
        <div className="ml-auto">{right}</div>
      </div>
      {children}
    </div>
  );
}

function Chip({ children, onClick, title }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="px-3 py-2 rounded-xl border bg-white hover:bg-slate-50 active:scale-[.98] transition text-sm"
    >
      {children}
    </button>
  );
}

function Stat({ label, value, muted }) {
  return (
    <div className="flex flex-col">
      <div className={`text-xs ${muted ? "text-slate-500" : "text-slate-600"}`}>{label}</div>
      <div className="text-xl font-semibold text-slate-800">{value}</div>
    </div>
  );
}

export default function Page() {
  const [meta, setMeta] = useLocalStorage("cpr.meta", {
    patientId: "",
    age: "",
    sex: "",
    weightKg: "",
    location: "ED",
    operator: "",
  });

  const [session, setSession] = useLocalStorage("cpr.session", {
    startedAt: null,
    events: [],
    arrestedAt: null,
    lastEpiAt: null,
    lastShockAt: null,
    compressions: { running: false, startedAt: null, totalMs: 0 },
  });

  const [ui, setUi] = useState({
    defibEnergy: SHOCK_LEVELS[2],
    customNote: "",
  });

  const running = !!session.startedAt;
  useTicker(running, 300);

  const startOrResume = () => {
    if (running) return;
    const now = Date.now();
    setSession((s) => ({ ...s, startedAt: now, arrestedAt: now }));
  };
  const stopSession = () => {
    setSession((s) => ({ ...s, startedAt: null }));
  };
  const resetAll = () => {
    if (!confirm("Reset this CPR record? This cannot be undone.")) return;
    localStorage.removeItem("cpr.session");
    setSession({
      startedAt: null,
      events: [],
      arrestedAt: null,
      lastEpiAt: null,
      lastShockAt: null,
      compressions: { running: false, startedAt: null, totalMs: 0 },
    });
  };

  const addEvent = (type, label, details = {}) => {
    const e = {
      id: crypto.randomUUID(),
      t: Date.now(),
      relMs: session.arrestedAt ? Date.now() - session.arrestedAt : 0,
      type,
      label,
      details,
    };
    setSession((s) => ({ ...s, events: [...s.events, e] }));
    return e;
  };

  const now = Date.now();
  const elapsed = running && session.arrestedAt ? now - session.arrestedAt : 0;
  const lastEpiAgo = session.lastEpiAt ? now - session.lastEpiAt : null;
  const lastShockAgo = session.lastShockAt ? now - session.lastShockAt : null;

  useEffect(() => {
    if (!session.compressions.running) return;
    const id = setInterval(() => {
      setSession((s) => {
        if (!s.compressions.running || !s.compressions.startedAt) return s;
        const delta = 1000;
        return {
          ...s,
          compressions: {
            ...s.compressions,
            totalMs: s.compressions.totalMs + delta,
          },
        };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [session.compressions.running, setSession]);

  const toggleCompressions = () => {
    setSession((s) => {
      if (s.compressions.running) {
        addEvent("CPR", "Compressions STOP");
        return {
          ...s,
          compressions: { ...s.compressions, running: false, startedAt: null },
        };
      } else {
        addEvent("CPR", "Compressions START");
        return {
          ...s,
          compressions: { ...s.compressions, running: true, startedAt: Date.now() },
        };
      }
    });
  };

  const recordRhythm = (r) => addEvent("Rhythm", r);
  const recordShock = (energy = ui.defibEnergy) => {
    addEvent("Shock", `Shock ${energy} J`);
    setSession((s) => ({ ...s, lastShockAt: Date.now() }));
  };
  const recordEpi = () => {
    addEvent("Drug", `Epinephrine 1 mg`, { dose: "1 mg", route: "IV/IO" });
    setSession((s) => ({ ...s, lastEpiAt: Date.now() }));
  };
  const recordDrug = (d) => {
    const label = d.label || d.code;
    addEvent("Drug", label, { dose: d.defaultDose });
  };
  const recordAirway = (label) => addEvent("Airway", label);
  const recordPulseCheck = () => addEvent("Assessment", "Pulse check");
  const recordRhythmCheck = () => addEvent("Assessment", "Rhythm check");
  const recordROSC = () => {
    recordRhythm("ROSC");
    addEvent("Outcome", "ROSC announced");
  };
  const recordIntubation = () => addEvent("Airway", "ETT placed");

  const toCSV = () => {
    const head = ["Clock", "T+ (mm:ss)", "Type", "Label", "Details"];
    const rows = session.events.map((e) => {
      const tplus = formatClock(e.relMs);
      const dt = new Date(e.t);
      const details = Object.entries(e.details || {})
        .map(([k, v]) => `${k}:${v}`)
        .join(" ");
      return [fmtTime(dt), tplus, e.type, e.label, details];
    });
    return [head, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\\n");
  };

  const download = (filename, content, mime = "text/plain") => {
    const blob = new Blob([content], { type: mime + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => download(
    `cpr_${new Date().toISOString().replaceAll(":", "-")}.csv`,
    toCSV(),
    "text/csv"
  );

  const exportJSON = () => download(
    `cpr_${new Date().toISOString().replaceAll(":", "-")}.json`,
    JSON.stringify({ meta, session }, null, 2),
    "application/json"
  );

  const printableRef = useRef(null);
  const printSummary = () => {
    const w = window.open("", "_blank");
    const css = `body{font-family:ui-sans-serif,system-ui;padding:24px} h1{font-size:20px;margin:0 0 8px} table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;font-size:12px} .muted{color:#666}`;
    const html = printableRef.current?.innerHTML ?? "";
    w.document.write(`<html><head><title>CPR Summary</title><style>${css}</style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const epiCount = session.events.filter((e) => e.type === "Drug" && e.label.includes("Epinephrine")).length;
  const shockCount = session.events.filter((e) => e.type === "Shock").length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white text-slate-900">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="text-2xl md:text-3xl font-bold">CPR Recorder</div>
          <div className="ml-auto flex items-center gap-2">
            {!running ? (
              <button onClick={startOrResume} className="px-4 py-2 rounded-xl bg-emerald-600 text-white shadow hover:bg-emerald-700">Start</button>
            ) : (
              <button onClick={stopSession} className="px-4 py-2 rounded-xl bg-amber-500 text-white shadow hover:bg-amber-600">Pause</button>
            )}
            <button onClick={resetAll} className="px-3 py-2 rounded-xl border border-rose-300 text-rose-700 hover:bg-rose-50">Reset</button>
          </div>
        </div>

        <Section title="Patient & Context">
          <div className="grid md:grid-cols-6 grid-cols-2 gap-3">
            {[
              ["Patient ID", "patientId"],
              ["Age", "age"],
              ["Sex", "sex"],
              ["Weight (kg)", "weightKg"],
              ["Location", "location"],
              ["Recorder", "operator"],
            ].map(([label, key]) => (
              <div key={key} className="flex flex-col">
                <label className="text-xs text-slate-600">{label}</label>
                <input
                  className="px-3 py-2 border rounded-xl"
                  value={meta[key]}
                  onChange={(e) => setMeta({ ...meta, [key]: e.target.value })}
                />
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Live Timers & KPIs"
          right={
            <div className="flex gap-2">
              <Chip onClick={printSummary}>Print</Chip>
              <Chip onClick={exportCSV}>Export CSV</Chip>
              <Chip onClick={exportJSON}>Export JSON</Chip>
            </div>
          }
        >
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Stat label="Arrest time" value={running ? formatClock(elapsed) : "—"} />
            <Stat label="CPR time" value={formatClock(session.compressions.totalMs)} />
            <Stat label="Since last EPI" value={lastEpiAgo != null ? formatClock(lastEpiAgo) : "—"} />
            <Stat label="Since last shock" value={lastShockAgo != null ? formatClock(lastShockAgo) : "—"} />
            <Stat label="# EPI / # Shocks" value={`${epiCount} / ${shockCount}`} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={toggleCompressions} className={`px-4 py-2 rounded-xl shadow text-white ${session.compressions.running ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>
              {session.compressions.running ? "Stop Compressions" : "Start Compressions"}
            </button>
            <button onClick={recordPulseCheck} className="px-4 py-2 rounded-xl border">Pulse Check</button>
            <button onClick={recordRhythmCheck} className="px-4 py-2 rounded-xl border">Rhythm Check</button>
            <button onClick={recordROSC} className="px-4 py-2 rounded-xl border">ROSC</button>
          </div>
        </Section>

        <Section title="Quick Actions (One-tap logging)">
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm font-medium mb-2">Rhythm</div>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_RHYTHMS.map((r) => (
                  <Chip key={r} onClick={() => recordRhythm(r)}>{r}</Chip>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium mb-2">Defibrillation</div>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="number"
                  className="w-24 px-3 py-2 border rounded-xl"
                  value={ui.defibEnergy}
                  onChange={(e) => setUi({ ...ui, defibEnergy: Number(e.target.value) })}
                />
                <span className="text-sm text-slate-600">J</span>
                <Chip onClick={() => recordShock(ui.defibEnergy)}>Shock</Chip>
                <div className="flex gap-1 ml-2">
                  {SHOCK_LEVELS.map((j) => (
                    <button key={j} onClick={() => setUi({ ...ui, defibEnergy: j })} className={`px-2 py-1 rounded-lg border text-xs ${ui.defibEnergy === j ? "bg-slate-900 text-white" : "bg-white"}`}>{j}</button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <div className="text-sm font-medium mb-2">Medications</div>
              <div className="flex flex-wrap gap-2">
                <Chip onClick={recordEpi} title="Log Epinephrine 1 mg">Epinephrine 1 mg</Chip>
                {DEFAULT_DRUGS.filter((d) => d.code !== "EPI").map((d) => (
                  <Chip key={d.code} onClick={() => recordDrug(d)}>{d.label}</Chip>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section title="Airway & Procedures">
          <div className="flex flex-wrap gap-2">
            {["BVM", "OPA/NPA", "Supraglottic", "ETT placed", "Capnography", "IV/IO established"].map((a) => (
              <Chip key={a} onClick={() => recordAirway(a)}>{a}</Chip>
            ))}
            <Chip onClick={recordIntubation}>Intubation</Chip>
          </div>
        </Section>

        <Section title="Free-text note">
          <div className="flex gap-2">
            <input
              value={ui.customNote}
              onChange={(e) => setUi({ ...ui, customNote: e.target.value })}
              className="flex-1 px-3 py-2 border rounded-xl"
              placeholder="e.g., Reversible causes considered (H/T)"
            />
            <Chip
              onClick={() => {
                if (!ui.customNote.trim()) return;
                addEvent("Note", ui.customNote.trim());
                setUi({ ...ui, customNote: "" });
              }}
            >
              Add
            </Chip>
          </div>
        </Section>

        <Section title="Event Log">
          <div className="overflow-auto max-h-[50vh]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-600">
                  <th className="text-left py-2">Clock</th>
                  <th className="text-left">T+ (mm:ss)</th>
                  <th className="text-left">Type</th>
                  <th className="text-left">Label</th>
                  <th className="text-left">Details</th>
                </tr>
              </thead>
              <tbody>
                {session.events.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="py-1 align-top">{fmtTime(new Date(e.t))}</td>
                    <td className="align-top">{formatClock(e.relMs)}</td>
                    <td className="align-top">{e.type}</td>
                    <td className="align-top">{e.label}</td>
                    <td className="align-top text-slate-600">
                      {Object.entries(e.details || {}).map(([k, v]) => (
                        <span key={k} className="mr-2">{k}: {String(v)}</span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <div className="hidden">
          <div ref={printableRef}>
            <h1>CPR Summary</h1>
            <div className="muted">Generated: {NOW().toLocaleString()}</div>
            <h2>Patient</h2>
            <div className="muted">
              ID: {meta.patientId} | Age: {meta.age} | Sex: {meta.sex} | Weight: {meta.weightKg} kg | Location: {meta.location} | Recorder: {meta.operator}
            </div>
            <h2>Timers & Counts</h2>
            <div className="muted">
              Arrest duration: {formatClock(elapsed)} | CPR time: {formatClock(session.compressions.totalMs)} | Epi: {epiCount} | Shocks: {shockCount}
            </div>
            <h2>Events</h2>
            <table>
              <thead>
                <tr>
                  <th>Clock</th>
                  <th>T+ (mm:ss)</th>
                  <th>Type</th>
                  <th>Label</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {session.events.map((e) => (
                  <tr key={e.id}>
                    <td>{fmtTime(new Date(e.t))}</td>
                    <td>{formatClock(e.relMs)}</td>
                    <td>{e.type}</td>
                    <td>{e.label}</td>
                    <td>{Object.entries(e.details || {}).map(([k, v]) => `${k}:${v}`).join(" ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-xs text-slate-500 pt-2 pb-6">
          This tool supports real-time documentation only and does not replace clinical judgment. Align usage with local ACLS policies and hospital documentation SOPs.
        </div>
      </div>
    </div>
  );
}
