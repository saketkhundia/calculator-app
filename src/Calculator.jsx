import React, { useState, useRef, useEffect, useCallback } from "react";
import { evaluate } from "mathjs";

// ─── UNIT CONVERTER DATA ────────────────────────────────────────────────────
const UNITS = {
  Length:      { icon: "📏", units: ["m","km","cm","mm","ft","in","mi","yd"],       toBase: { m:1, km:1000, cm:0.01, mm:0.001, ft:0.3048, in:0.0254, mi:1609.344, yd:0.9144 } },
  Weight:      { icon: "⚖️", units: ["kg","g","lb","oz","mg","ton"],                toBase: { kg:1, g:0.001, lb:0.453592, oz:0.0283495, mg:0.000001, ton:1000 } },
  Temperature: { icon: "🌡️", units: ["°C","°F","K"], special: true },
  Speed:       { icon: "⚡", units: ["m/s","km/h","mph","knot"],                    toBase: { "m/s":1, "km/h":0.277778, mph:0.44704, knot:0.514444 } },
  Area:        { icon: "⬜", units: ["m²","km²","cm²","ft²","acre","ha"],           toBase: { "m²":1, "km²":1e6, "cm²":0.0001, "ft²":0.092903, acre:4046.856, ha:10000 } },
  Volume:      { icon: "🧪", units: ["L","mL","m³","gal","fl oz","cup"],            toBase: { L:1, mL:0.001, "m³":1000, gal:3.78541, "fl oz":0.0295735, cup:0.236588 } },
};

const convertTemp = (val, from, to) => {
  let c = from === "°C" ? val : from === "°F" ? (val - 32) * 5/9 : val - 273.15;
  return to === "°C" ? c : to === "°F" ? c * 9/5 + 32 : c + 273.15;
};

const convertUnit = (val, from, to, cat) => {
  if (val === "" || isNaN(Number(val))) return "";
  const v = Number(val), c = UNITS[cat];
  if (c.special) return +convertTemp(v, from, to).toFixed(6);
  return +(v * c.toBase[from] / c.toBase[to]).toFixed(8);
};

// ─── BUTTON DEFINITIONS ─────────────────────────────────────────────────────
const STD_BUTTONS = [
  "C", "(", ")", "/",
  "7", "8", "9", "*",
  "4", "5", "6", "-",
  "1", "2", "3", "+",
  "DEL", "0", ".", "=",
];

const SCI_BUTTONS = [
  "sin","cos","tan","asin","acos","atan",
  "log","ln","√","∛","x²","x³",
  "π","e","^","n!","1/x","EXP","abs","mod",
];

const MAPPED = {
  "π":"pi", e:"e",
  sin:"sin(", cos:"cos(", tan:"tan(",
  asin:"asin(", acos:"acos(", atan:"atan(",
  log:"log10(", ln:"log(", "√":"sqrt(", "∛":"cbrt(",
  "x²":"^2", "x³":"^3", EXP:"e^", abs:"abs(", mod:" mod ",
  "n!":"factorial(", "1/x":"(1/",
};

const isOp   = b => ["/","*","-","+","^"].includes(b);
const isEq   = b => b === "=";
const isUtil = b => ["C","DEL","(",")"].includes(b);

const PHYSICS_CONSTANTS = [
  { name:"Speed of Light",     sym:"c",  val:"299792458",        unit:"m/s"          },
  { name:"Planck's Constant",  sym:"h",  val:"6.62607e-34",      unit:"J·s"          },
  { name:"Gravitational",      sym:"G",  val:"6.674e-11",        unit:"m³/(kg·s²)"   },
  { name:"Avogadro's Number",  sym:"Nₐ", val:"6.02214e+23",      unit:"mol⁻¹"        },
  { name:"Boltzmann",          sym:"k",  val:"1.380649e-23",     unit:"J/K"          },
  { name:"Elem. Charge",       sym:"e",  val:"1.602176e-19",     unit:"C"            },
  { name:"Electron Mass",      sym:"mₑ", val:"9.10938e-31",      unit:"kg"           },
  { name:"Pi",                 sym:"π",  val:"3.14159265358979", unit:""             },
  { name:"Euler's Number",     sym:"e",  val:"2.71828182845904", unit:""             },
  { name:"Golden Ratio",       sym:"φ",  val:"1.61803398874989", unit:""             },
];

// ─── VIEWPORT HOOK ──────────────────────────────────────────────────────────
function useViewport() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return w;
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function Calculator() {
  const [expr, setExpr]       = useState("");
  const [prev, setPrev]       = useState("");
  const [history, setHistory] = useState([]);
  const [memory, setMemory]   = useState(0);
  const [scientific, setSci]  = useState(false);
  const [flash, setFlash]     = useState(false);
  const [tab, setTab]         = useState("calc");
  const [theme, setTheme]     = useState("dark");
  const [deg, setDeg]         = useState(true);

  // Unit converter
  const [ucCat,  setUcCat]  = useState("Length");
  const [ucFrom, setUcFrom] = useState("m");
  const [ucTo,   setUcTo]   = useState("km");
  const [ucVal,  setUcVal]  = useState("");

  // Toast
  const [toast, setToast]     = useState({ msg: "", show: false });
  const toastTimer            = useRef(null);

  const shellRef = useRef(null);
  const vw       = useViewport();
  const isMobile  = vw < 520;
  const isDesktop = vw >= 900;

  // Apply theme to <html> so App.css [data-theme] selectors work globally
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => { shellRef.current?.focus(); }, []);

  const showToast = msg => {
    clearTimeout(toastTimer.current);
    setToast({ msg, show: true });
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 1600);
  };

  // ── Expression helpers ──
  const clear    = ()    => { setExpr(""); setPrev(""); };
  const backspace= ()    => setExpr(p => p.slice(0, -1));
  const append   = val   => setExpr(p => p === "ERROR" ? val : p + val);

  const calc = useCallback(() => {
    if (!expr || expr === "ERROR") return;
    try {
      let e = expr;
      if (deg) {
        e = e.replace(/\b(sin|cos|tan|asin|acos|atan)\(/g, (_, fn) =>
          fn.startsWith("a") ? `(180/pi)*${fn}(` : `${fn}((pi/180)*`
        );
      }
      const result = evaluate(e);
      const entry  = { expr, result: String(result), time: new Date().toLocaleTimeString() };
      setHistory(h => [entry, ...h].slice(0, 50));
      setPrev(expr + "  =");
      setExpr(String(result));
      setFlash(true);
      setTimeout(() => setFlash(false), 350);
    } catch {
      setPrev(expr);
      setExpr("ERROR");
    }
  }, [expr, deg]);

  const handleKey = useCallback(e => {
    if (tab !== "calc") return;
    if (/^[0-9+\-*/().^]$/.test(e.key)) append(e.key);
    else if (e.key === "Enter")     calc();
    else if (e.key === "Backspace") backspace();
    else if (e.key === "Escape")    clear();
  }, [tab, calc]);

  const handleClick = btn => {
    if (navigator.vibrate) navigator.vibrate(8);
    if (btn === "DEL") return backspace();
    if (btn === "C")   return clear();
    if (btn === "=")   return calc();
    append(MAPPED[btn] ?? btn);
  };

  // ── Memory ──
  const memOps = {
    MC:  ()  => setMemory(0),
    MR:  ()  => append(String(memory)),
    "M+": () => { try { setMemory(m => m + evaluate(expr)); } catch {} },
    "M-": () => { try { setMemory(m => m - evaluate(expr)); } catch {} },
    MS:  ()  => { try { setMemory(evaluate(expr));           } catch {} },
  };

  // ── Button variant → CSS class ──
  const btnClass = btn => {
    if (isEq(btn))        return "btn btn-eq";
    if (btn === "C")      return "btn btn-clear";
    if (isUtil(btn))      return "btn btn-util";
    if (isOp(btn))        return "btn btn-op";
    return "btn btn-num";
  };

  const ucResult = convertUnit(ucVal, ucFrom, ucTo, ucCat);

  // ── Shared calc panel ──
  const CalcPanel = (
    <>
      {/* Display */}
      <div className="display">
        <div className="mem-badge">
          <span className={`mem-indicator${memory !== 0 ? " visible" : ""}`}>M</span>
          {memory !== 0 && <span className="mem-val">= {memory}</span>}
        </div>
        <div className="prev-line">{prev || "\u00a0"}</div>
        <div className={[
          "expr-line",
          flash ? "flash" : "",
          expr === "ERROR" ? "error" : "",
          expr.length > 12 ? "long" : "",
        ].filter(Boolean).join(" ")}>
          {expr || "0"}
        </div>
      </div>

      <div className="sep" />

      {/* Memory row */}
      <div className="mem-row">
        {Object.keys(memOps).map(k => (
          <button key={k} className="btn-mem" onClick={memOps[k]}>{k}</button>
        ))}
      </div>

      {/* Sci toggle */}
      <div className="sci-row">
        <span className="sci-mode-label">{scientific ? "Scientific Mode" : ""}</span>
        <div
          className={`sci-toggle-wrap${scientific ? " on" : ""}`}
          onClick={() => setSci(p => !p)}
          role="switch"
          aria-checked={scientific}
        >
          <span className="sci-toggle-label">Sci</span>
          <div className="s-track"><div className="s-dot" /></div>
        </div>
      </div>

      {/* Scientific buttons */}
      {scientific && (
        <>
          <div className="sci-panel">
            {SCI_BUTTONS.map((btn, i) => (
              <button key={i} className="btn-sci" onClick={() => handleClick(btn)}>{btn}</button>
            ))}
          </div>
          <div className="sep inset" />
        </>
      )}

      {/* Main grid */}
      <div className="main-grid">
        {STD_BUTTONS.map((btn, i) => (
          <button key={i} className={btnClass(btn)} onClick={() => handleClick(btn)} aria-label={btn}>
            {btn === "DEL" ? (
              <svg width="20" height="15" viewBox="0 0 20 15" fill="none">
                <path d="M7 1H18C18.6 1 19 1.4 19 2V13C19 13.6 18.6 14 18 14H7L1 7.5L7 1Z"
                  stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round"/>
                <path d="M11.5 5.5L15.5 9.5M15.5 5.5L11.5 9.5"
                  stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            ) : btn === "=" ? (
              <svg width="22" height="14" viewBox="0 0 22 14" fill="none">
                <path d="M2 4.5H20M2 9.5H20" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
              </svg>
            ) : btn}
          </button>
        ))}
      </div>
    </>
  );

  // ── Panel content (History / Converter / Constants) ──
  const PanelContent = () => {
    if (tab === "history") return (
      <>
        {history.length === 0 ? (
          <div className="hist-empty">
            <div className="hist-empty-icon">⏱</div>
            <div className="hist-empty-text">No calculations yet</div>
          </div>
        ) : (
          <>
            {history.map((h, i) => (
              <div key={i} className="hist-item" onClick={() => { setExpr(h.result); setTab("calc"); }}>
                <div className="hist-expr">{h.expr}</div>
                <div className="hist-result">{h.result}</div>
                <div className="hist-time">{h.time}</div>
              </div>
            ))}
            <button className="action-btn" onClick={() => setHistory([])}>Clear History</button>
          </>
        )}
      </>
    );

    if (tab === "converter") return (
      <>
        <div className="conv-cats">
          {Object.keys(UNITS).map(cat => (
            <button
              key={cat}
              className={`conv-cat-btn${ucCat === cat ? " active" : ""}`}
              onClick={() => {
                setUcCat(cat);
                const u = UNITS[cat].units;
                setUcFrom(u[0]); setUcTo(u[1]); setUcVal("");
              }}
            >
              {UNITS[cat].icon} {cat}
            </button>
          ))}
        </div>
        <div className="conv-row">
          <div className="conv-col">
            <span className="conv-label">From</span>
            <select className="conv-select" value={ucFrom} onChange={e => setUcFrom(e.target.value)}>
              {UNITS[ucCat].units.map(u => <option key={u}>{u}</option>)}
            </select>
            <input
              className="conv-input" type="number" placeholder="Enter value"
              value={ucVal} onChange={e => setUcVal(e.target.value)}
            />
          </div>
          <div className="conv-arrow">⇄</div>
          <div className="conv-col">
            <span className="conv-label">To</span>
            <select className="conv-select" value={ucTo} onChange={e => setUcTo(e.target.value)}>
              {UNITS[ucCat].units.map(u => <option key={u}>{u}</option>)}
            </select>
            <div className="conv-result-box">
              <span className="conv-result-num">{ucResult !== "" ? ucResult : "—"}</span>
              <span className="conv-result-unit">{ucTo}</span>
            </div>
          </div>
        </div>
        {ucResult !== "" && ucVal !== "" && (
          <div className="conv-summary">
            <span className="conv-summary-num">{ucVal}</span>
            <span className="conv-summary-unit">{ucFrom}</span>
            <span className="conv-summary-eq">=</span>
            <span className="conv-summary-num">{ucResult}</span>
            <span className="conv-summary-unit">{ucTo}</span>
          </div>
        )}
        {ucResult !== "" && (
          <button className="action-btn accent" style={{ marginTop: 10 }}
            onClick={() => { setExpr(String(ucResult)); setTab("calc"); }}>
            Use result in calculator
          </button>
        )}
      </>
    );

    if (tab === "constants") return (
      <>
        {PHYSICS_CONSTANTS.map((c, i) => (
          <div key={i} className="const-item" onClick={() => {
            setExpr(p => (p === "ERROR" ? "" : p) + c.val);
            showToast("Added to calculator");
            setTab("calc");
          }}>
            <div className="const-sym">{c.sym}</div>
            <div className="const-info">
              <div className="const-name">{c.name}</div>
              <div className="const-val">{c.val}</div>
            </div>
            {c.unit && <div className="const-unit">{c.unit}</div>}
          </div>
        ))}
      </>
    );

    return null;
  };

  // ── Header ──
  const Header = () => (
    <div className="header">
      <span className="app-name">Calc Pro</span>
      <div className="header-right">
        {tab === "calc" && (
          <button className={`deg-toggle${deg ? " on" : ""}`} onClick={() => setDeg(d => !d)}>
            {deg ? "DEG" : "RAD"}
          </button>
        )}
        {["dark", "light", "amoled"].map(t => (
          <button
            key={t}
            className={`theme-btn${theme === t ? " active" : ""}`}
            onClick={() => setTheme(t)}
            title={t}
          >
            {t === "dark" ? "●" : t === "light" ? "○" : "◉"}
          </button>
        ))}
      </div>
    </div>
  );

  // ── Tabs ──
  const TABS = [
    { id: "calc",      label: "Calc"    },
    { id: "history",   label: "History" },
    { id: "converter", label: "Convert" },
    { id: "constants", label: "Const"   },
  ];

  const TopTabs = () => (
    <div className="tabs">
      {TABS.map(({ id, label }) => (
        <button key={id} className={`tab${tab === id ? " active" : ""}`} onClick={() => setTab(id)}>
          {label}
        </button>
      ))}
    </div>
  );

  const BottomNav = () => (
    <div className="bottom-nav">
      {[
        { id: "calc",      icon: "⌨️", label: "Calc"    },
        { id: "history",   icon: "⏱",  label: "History" },
        { id: "converter", icon: "⇄",  label: "Convert" },
        { id: "constants", icon: "⚛",  label: "Const"   },
      ].map(({ id, icon, label }) => (
        <button key={id} className={`bnav-btn${tab === id ? " active" : ""}`} onClick={() => setTab(id)}>
          <span className="bnav-icon">{icon}</span>
          {label}
        </button>
      ))}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="app-root">
      <div className="app-wrap">

        {/* ── DESKTOP: two-column ── */}
        {isDesktop ? (
          <div className="desktop-layout">
            {/* Left: always the calculator */}
            <div className="calc" tabIndex="0" onKeyDown={handleKey} ref={shellRef}>
              <Header />
              <TopTabs />
              {CalcPanel}
            </div>

            {/* Right: panel only when a non-calc tab is active */}
            {tab !== "calc" && (
              <div className="side-panel">
                <div className="side-panel-header">
                  {tab === "history" ? "History" : tab === "converter" ? "Unit Converter" : "Constants"}
                </div>
                <div className="side-panel-body">
                  <PanelContent />
                </div>
              </div>
            )}
          </div>

        ) : (
          /* ── MOBILE / TABLET: single column ── */
          <div className="calc" tabIndex="0" onKeyDown={handleKey} ref={shellRef}>
            <Header />
            {!isMobile && <TopTabs />}

            {tab === "calc" ? CalcPanel : (
              <div className="panel"><PanelContent /></div>
            )}

            {isMobile && <BottomNav />}
          </div>
        )}
      </div>

      {/* ── Toast ── */}
      <div
        className="calc-toast"
        role="status"
        aria-live="polite"
        style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--accent)",
          color: "#fff",
          padding: "8px 20px",
          borderRadius: "var(--radius-full)",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.06em",
          fontFamily: "var(--font-sans)",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          zIndex: "var(--z-toast)",
          opacity: toast.show ? 1 : 0,
          transition: "opacity 0.2s ease",
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        }}
      >
        {toast.msg}
      </div>
    </div>
  );
}