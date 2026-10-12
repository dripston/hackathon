import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/InterTight";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const { fontFamily: DISPLAY } = loadDisplay();
const { fontFamily: MONO } = loadMono();

/* Palette: graphite, mint = healthy, coral = failing, violet = Antibody at work. */
const BG = "#0c0c0f";
const FG = "#f4f4f6";
const MUTED = "#8b8b96";
const MINT = "#5fe3b5";
const CORAL = "#f47a5f";
const VIOLET = "#ab9cff";
const LINE = "rgba(255,255,255,0.09)";

const EASE = Easing.bezier(0.2, 0.7, 0.2, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const k = (f: number, a: number, b: number, from = 0, to = 1) => interpolate(f, [a, b], [from, to], { ...clamp, easing: EASE });

/* ------------------------------------------------------------------ timeline */
const S = {
  open: [0, 120],
  wrong: [120, 80],
  lie: [200, 190],
  brand: [390, 125],
  caught: [515, 115],
  cause: [630, 125],
  family: [755, 115],
  proof: [870, 130],
  approve: [1000, 150],
  immune: [1150, 125],
  stats: [1275, 150],
  end: [1425, 135],
} as const;
export const TOTAL = 1560;

export const Launch = () => (
  <AbsoluteFill style={{ background: BG, color: FG, fontFamily: DISPLAY }}>
    <Ambient />
    <Seq at={S.open}><Open /></Seq>
    <Seq at={S.wrong}><Wrong /></Seq>
    <Seq at={S.lie}><Lie /></Seq>
    <Seq at={S.brand}><Brand /></Seq>
    <Sequence from={S.caught[0]} durationInFrames={S.immune[0] + S.immune[1] - S.caught[0]}>
      <Rail />
    </Sequence>
    <Seq at={S.caught}><Caught /></Seq>
    <Seq at={S.cause}><Cause /></Seq>
    <Seq at={S.family}><Family /></Seq>
    <Seq at={S.proof}><Proof /></Seq>
    <Seq at={S.approve}><Approve /></Seq>
    <Seq at={S.immune}><Immune /></Seq>
    <Seq at={S.stats}><Stats /></Seq>
    <Seq at={S.end}><End /></Seq>
    <Grain />
    <Vignette />
  </AbsoluteFill>
);

/** A scene with a soft scale/blur entrance and exit. */
function Seq({ at, children }: { at: readonly [number, number]; children: ReactNode }) {
  return (
    <Sequence from={at[0]} durationInFrames={at[1]}>
      <Shot dur={at[1]}>{children}</Shot>
    </Sequence>
  );
}
function Shot({ dur, children }: { dur: number; children: ReactNode }) {
  const f = useCurrentFrame();
  const inP = k(f, 0, 14);
  const outP = k(f, dur - 12, dur);
  return (
    <AbsoluteFill
      style={{
        opacity: inP * (1 - outP),
        transform: `scale(${1.04 - inP * 0.04 + outP * -0.03})`,
        filter: `blur(${(1 - inP) * 10 + outP * 10}px)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ atmosphere */
function Ambient() {
  const f = useCurrentFrame();
  const glow = (x: number, y: number, c: string, s: number): CSSProperties => ({
    position: "absolute",
    left: x,
    top: y,
    width: s,
    height: s,
    borderRadius: "50%",
    background: c,
    filter: "blur(160px)",
    opacity: 0.22,
  });
  const inLoop = f > S.caught[0] && f < S.stats[0];
  return (
    <AbsoluteFill>
      <div style={glow(1300 + Math.sin(f / 60) * 120, 80 + Math.cos(f / 70) * 60, f < S.lie[0] + 190 && f > S.wrong[0] ? CORAL : MINT, 620)} />
      <div style={glow(150 + Math.cos(f / 80) * 140, 600 + Math.sin(f / 50) * 60, inLoop ? VIOLET : "#3a3a55", 560)} />
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${LINE} 1px, transparent 1px), linear-gradient(90deg, ${LINE} 1px, transparent 1px)`,
          backgroundSize: "96px 96px",
          opacity: 0.35,
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          transform: `translateY(${(f * 0.4) % 96}px)`,
        }}
      />
    </AbsoluteFill>
  );
}
function Grain() {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity: 0.07, mixBlendMode: "overlay", pointerEvents: "none" }}>
      <svg width="100%" height="100%">
        <filter id="n">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={f % 12} />
        </filter>
        <rect width="100%" height="100%" filter="url(#n)" />
      </svg>
    </AbsoluteFill>
  );
}
function Vignette() {
  return <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.65) 100%)", pointerEvents: "none" }} />;
}

/* ------------------------------------------------------------------ shared bits */
function ecgPath(width: number, base: number, amp: number, period: number, upto: number) {
  const pts: string[] = [];
  for (let x = 0; x <= Math.min(width, upto); x += 3) {
    const p = (x % period) / period;
    let y = base;
    if (p > 0.38 && p < 0.44) y = base - Math.sin(((p - 0.38) / 0.06) * Math.PI) * amp * 0.12;
    else if (p >= 0.48 && p < 0.5) y = base + ((p - 0.48) / 0.02) * amp * 0.18;
    else if (p >= 0.5 && p < 0.53) y = base + amp * 0.18 - ((p - 0.5) / 0.03) * amp * 1.18;
    else if (p >= 0.53 && p < 0.56) y = base - amp + ((p - 0.53) / 0.03) * amp * 1.35;
    else if (p >= 0.56 && p < 0.59) y = base + amp * 0.35 - ((p - 0.56) / 0.03) * amp * 0.35;
    else if (p > 0.66 && p < 0.78) y = base - Math.sin(((p - 0.66) / 0.12) * Math.PI) * amp * 0.2;
    pts.push(`${x},${y.toFixed(1)}`);
  }
  return pts.length ? `M${pts.join(" L")}` : "";
}

function Words({ text, start, style, stagger = 3 }: { text: string; start: number; style?: CSSProperties; stagger?: number }) {
  const f = useCurrentFrame();
  return (
    <span style={{ display: "inline-block", ...style }}>
      {text.split(" ").map((w, i) => {
        const p = k(f, start + i * stagger, start + i * stagger + 16);
        return (
          <span key={i} style={{ display: "inline-block", marginRight: "0.24em", opacity: p, transform: `translateY(${(1 - p) * 40}px)`, filter: `blur(${(1 - p) * 12}px)` }}>
            {w}
          </span>
        );
      })}
    </span>
  );
}

function Label({ children, color = MUTED, style }: { children: ReactNode; color?: string; style?: CSSProperties }) {
  return <div style={{ fontFamily: MONO, fontSize: 22, letterSpacing: "0.22em", textTransform: "uppercase", color, ...style }}>{children}</div>;
}

function Mark({ size = 120, draw = 1, dot = 1 }: { size?: number; draw?: number; dot?: number }) {
  const len = 60;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ overflow: "visible" }}>
      <path
        d="M12 22V12M12 12L5 5M12 12l7-7M5 5 3.5 3.5M19 5l1.5-1.5"
        stroke={FG}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - draw)}
      />
      <circle cx="3" cy="3" r={1.6 * dot} fill={MINT} />
      <circle cx="21" cy="3" r={1.6 * dot} fill={MINT} />
    </svg>
  );
}

/* ------------------------------------------------------------------ 1. cold open */
function Open() {
  const f = useCurrentFrame();
  const draw = interpolate(f, [0, 110], [0, 1920], clamp);
  const d = ecgPath(1920, 760, 150, 480, draw);
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d={d} stroke={MINT} strokeWidth={4} fill="none" filter="url(#glow)" />
        {[0, 1, 2, 3].map((i) =>
          draw > i * 480 + 260 ? (
            <text key={i} x={i * 480 + 230} y={880} fill={MINT} fontFamily={MONO} fontSize={26} opacity={0.8}>
              200 OK
            </text>
          ) : null,
        )}
      </svg>
      <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 140, paddingBottom: 260 }}>
        <Label style={{ opacity: k(f, 6, 22) }}>production · sales-research agent</Label>
        <div style={{ fontSize: 150, fontWeight: 700, letterSpacing: "-0.045em", lineHeight: 1, marginTop: 28 }}>
          <Words text="Your agent said" start={18} />
          <br />
          <Words text="200 OK." start={34} style={{ color: FG }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ 2. glitch */
function Wrong() {
  const f = useCurrentFrame();
  const hit = f < 18;
  const shake = hit ? (random(`s${f}`) - 0.5) * 40 : 0;
  const slice = (seed: string) => {
    const a = random(seed) * 80;
    return `inset(${a}% 0 ${Math.max(0, 85 - a - random(seed + "b") * 30)}% 0)`;
  };
  const text = "It was wrong.";
  const base: CSSProperties = { position: "absolute", fontSize: 230, fontWeight: 800, letterSpacing: "-0.05em", whiteSpace: "nowrap" };
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", transform: `translate(${shake}px, ${shake * 0.4}px)` }}>
      {hit && <AbsoluteFill style={{ background: CORAL, opacity: interpolate(f, [0, 6], [0.35, 0], clamp) }} />}
      <div style={{ position: "relative", width: 1600, height: 260, display: "flex", justifyContent: "center", alignItems: "center" }}>
        {f < 26 && (
          <>
            <span style={{ ...base, color: "#00e5ff", transform: `translateX(${-14 + random(`a${f}`) * 8}px)`, clipPath: slice(`c${f}`), opacity: 0.8 }}>{text}</span>
            <span style={{ ...base, color: "#ff2a6d", transform: `translateX(${14 - random(`b${f}`) * 8}px)`, clipPath: slice(`d${f}`), opacity: 0.8 }}>{text}</span>
          </>
        )}
        <span style={{ ...base, color: CORAL, textShadow: `0 0 80px ${CORAL}66` }}>{text}</span>
      </div>
      <div style={{ position: "absolute", bottom: 210, fontSize: 40, color: MUTED, opacity: k(f, 26, 44) }}>No crash. No error log. Every dashboard green.</div>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ 3. the lie */
const DOMAINS = ["figma.com", "supabase.com", "airtable.com", "notion.com", "mercury.com", "stripe.com", "cal.com", "resend.com", "neon.tech", "ramp.com", "linear.app", "retool.com"];
function Lie() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const focus = k(f, 70, 95);
  const STEPS: [string, string, boolean][] = [
    ["Look up the company", "crustdata.company_enrich", true],
    ["Confirm it's the right company", "llm.identify", true],
    ["Search for decision makers", "HTTP 429", false],
    ["Read hiring signals", "crustdata.jobs", true],
    ["Write the brief", "llm.brief", true],
  ];
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 140, top: 110, opacity: 1 - focus }}>
        <Label>live traffic</Label>
        <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: "-0.035em", marginTop: 14 }}>
          <Words text="Every run looks healthy." start={4} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 140, top: 330, display: "grid", gridTemplateColumns: "repeat(4, 390px)", gap: 24 }}>
        {DOMAINS.map((d, i) => {
          const s = spring({ frame: f - 6 - i * 2.5, fps, config: { damping: 16, mass: 0.6 } });
          const isStripe = d === "stripe.com";
          return (
            <div
              key={d}
              style={{
                height: 150,
                borderRadius: 22,
                border: `1px solid ${isStripe && f > 60 ? CORAL : LINE}`,
                background: "rgba(255,255,255,0.03)",
                padding: "28px 30px",
                opacity: s * (isStripe ? 1 : 1 - focus * 0.85),
                transform: `translateY(${(1 - s) * 60}px) scale(${0.9 + s * 0.1})`,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                boxShadow: isStripe && f > 60 ? `0 0 60px ${CORAL}33` : "none",
              }}
            >
              <div style={{ fontSize: 34, fontWeight: 600 }}>{d}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: MONO, fontSize: 24, color: MINT }}>
                200 OK
                <span style={{ display: "flex", gap: 8 }}>
                  {[0, 1, 2, 3].map((j) => (
                    <span key={j} style={{ width: 11, height: 11, borderRadius: 6, background: isStripe && f > 60 && j === 1 ? CORAL : MINT }} />
                  ))}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {/* The trace behind stripe.com */}
      <div
        style={{
          position: "absolute",
          right: 120,
          top: 150,
          width: 900,
          borderRadius: 30,
          border: `1px solid ${CORAL}55`,
          background: "rgb(22,15,15)",
          padding: 44,
          opacity: focus,
          transform: `translateX(${(1 - focus) * 120}px)`,
          boxShadow: `0 40px 120px rgba(0,0,0,0.6), 0 0 80px ${CORAL}22`,
        }}
      >
        <Label color={CORAL}>stripe.com · what actually happened</Label>
        <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 12 }}>
          {STEPS.map(([t, tool, ok], i) => {
            const p = k(f, 92 + i * 7, 108 + i * 7);
            const bad = !ok && f > 125;
            return (
              <div
                key={t}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                  padding: "16px 20px",
                  borderRadius: 16,
                  background: bad ? `${CORAL}30` : "transparent",
                  opacity: p,
                  transform: `translateX(${(1 - p) * 30}px)`,
                }}
              >
                <span style={{ width: 34, height: 34, borderRadius: 17, display: "grid", placeItems: "center", background: ok ? `${MINT}22` : bad ? CORAL : "#333", color: ok ? MINT : "#111", fontSize: 20, fontWeight: 800 }}>
                  {ok ? "✓" : "✕"}
                </span>
                <span style={{ fontSize: 32, flex: 1 }}>{t}</span>
                <span style={{ fontFamily: MONO, fontSize: 22, color: bad ? CORAL : MUTED }}>{tool}</span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 28, fontSize: 30, lineHeight: 1.4, opacity: k(f, 135, 155) }}>
          The search failed. The agent told sales <span style={{ color: CORAL }}>&ldquo;no decision makers found.&rdquo;</span>
        </div>
      </div>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ 4. brand */
function Brand() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const draw = k(f, 4, 40);
  const dot = spring({ frame: f - 36, fps, config: { damping: 9 } });
  const ring = k(f, 36, 80);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ position: "absolute", width: 700 * ring, height: 700 * ring, borderRadius: "50%", border: `2px solid ${MINT}`, opacity: (1 - ring) * 0.6 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 44 }}>
        <Mark size={190} draw={draw} dot={dot} />
        <div style={{ fontSize: 200, fontWeight: 700, letterSpacing: "-0.05em" }}>
          {"Antibody".split("").map((c, i) => {
            const p = k(f, 20 + i * 2.2, 40 + i * 2.2);
            return (
              <span key={i} style={{ display: "inline-block", opacity: p, transform: `translateY(${(1 - p) * 60}px)`, filter: `blur(${(1 - p) * 10}px)` }}>
                {c}
              </span>
            );
          })}
        </div>
      </div>
      <div style={{ position: "absolute", top: 700, fontSize: 52, color: MUTED, letterSpacing: "-0.01em" }}>
        <Words text="On-call for AI agents." start={58} stagger={4} />
      </div>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ 5. the loop */
const STAGES = ["Caught", "Cause", "Family", "Proof", "Approved", "Immune"];
const STARTS = [S.caught[0], S.cause[0], S.family[0], S.proof[0], S.approve[0], S.immune[0]];
function Rail() {
  const f = useCurrentFrame() + S.caught[0];
  const at = STARTS.filter((s) => f >= s).length - 1;
  const show = k(f, S.caught[0], S.caught[0] + 20) * (1 - k(f, S.immune[0] + S.immune[1] - 14, S.immune[0] + S.immune[1]));
  return (
    <div style={{ position: "absolute", left: 140, right: 140, bottom: 80, display: "flex", gap: 18, opacity: show }}>
      {STAGES.map((s, i) => {
        const fill = i < at ? 1 : i === at ? k(f, STARTS[i], STARTS[i] + (i < 5 ? STARTS[i + 1] - STARTS[i] : S.immune[1]) - 10) : 0;
        return (
          <div key={s} style={{ flex: 1 }}>
            <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${fill * 100}%`, background: i === at ? VIOLET : MINT, boxShadow: `0 0 20px ${i === at ? VIOLET : MINT}` }} />
            </div>
            <div style={{ marginTop: 14, fontSize: 26, fontFamily: MONO, color: i <= at ? FG : MUTED }}>
              {String(i + 1).padStart(2, "0")} {s}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StageTitle({ n, title, sub }: { n: number; title: string; sub: string }) {
  const f = useCurrentFrame();
  return (
    <div style={{ position: "absolute", left: 140, top: 150, width: 720 }}>
      <Label color={VIOLET} style={{ opacity: k(f, 2, 14) }}>
        {String(n).padStart(2, "0")} / 06
      </Label>
      <div style={{ fontSize: 112, fontWeight: 700, letterSpacing: "-0.045em", marginTop: 18, lineHeight: 1 }}>
        <Words text={title} start={4} />
      </div>
      <div style={{ fontSize: 36, color: MUTED, marginTop: 30, lineHeight: 1.35, opacity: k(f, 16, 32), transform: `translateY(${(1 - k(f, 16, 32)) * 20}px)` }}>{sub}</div>
    </div>
  );
}

function Card({ children, style, enter = 6 }: { children: ReactNode; style?: CSSProperties; enter?: number }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - enter, fps, config: { damping: 15, mass: 0.7 } });
  return (
    <div
      style={{
        position: "absolute",
        right: 140,
        top: 150,
        width: 860,
        borderRadius: 30,
        border: `1px solid ${LINE}`,
        background: "rgba(22,22,28,0.88)",
        padding: 44,
        boxShadow: "0 40px 140px rgba(0,0,0,0.6)",
        opacity: s,
        transform: `translateY(${(1 - s) * 80}px) rotateX(${(1 - s) * 12}deg)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Caught() {
  const f = useCurrentFrame();
  const pulse = (f % 30) / 30;
  return (
    <AbsoluteFill>
      <StageTitle n={1} title="Caught in production." sub="Deterministic tripwires on every run. One keeps firing, and Antibody opens an incident." />
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ position: "relative", width: 20, height: 20 }}>
            <span style={{ position: "absolute", inset: 0, borderRadius: 10, background: CORAL, transform: `scale(${1 + pulse * 2})`, opacity: 1 - pulse }} />
            <span style={{ position: "absolute", inset: 0, borderRadius: 10, background: CORAL }} />
          </span>
          <Label color={CORAL}>incident opened</Label>
        </div>
        <div style={{ fontSize: 56, fontWeight: 700, marginTop: 24, letterSpacing: "-0.03em" }}>Empty after a tool error</div>
        <div style={{ fontFamily: MONO, fontSize: 24, color: MUTED, marginTop: 12 }}>tw_empty_after_error · source: neatlogs</div>
        <div style={{ display: "flex", gap: 12, marginTop: 36 }}>
          {[0, 1, 2, 3, 4].map((i) => {
            const p = k(f, 24 + i * 6, 34 + i * 6);
            return (
              <div key={i} style={{ flex: 1, height: 90, borderRadius: 16, background: `${CORAL}22`, border: `1px solid ${CORAL}55`, opacity: p, transform: `scale(${0.7 + p * 0.3})`, display: "grid", placeItems: "center", fontFamily: MONO, fontSize: 20, color: CORAL }}>
                trace {i + 1}
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 28, color: MUTED, marginTop: 28, opacity: k(f, 60, 76) }}>5 silent failures in 2 minutes</div>
      </Card>
    </AbsoluteFill>
  );
}

function Typed({ text, start, speed = 1.6 }: { text: string; start: number; speed?: number }) {
  const f = useCurrentFrame();
  const n = Math.max(0, Math.floor((f - start) * speed));
  const caret = f >= start && n < text.length + 4 && Math.floor(f / 8) % 2 === 0;
  return (
    <>
      {text.slice(0, n)}
      {caret && <span style={{ background: MINT, color: BG }}>&nbsp;</span>}
    </>
  );
}

function Cause() {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <StageTitle n={2} title="Finds the commit. And why." sub="git history plus the reasoning behind the change: the developer's own words, quoted back." />
      <Card style={{ fontFamily: MONO, fontSize: 25, lineHeight: 1.7 }}>
        <div style={{ color: MUTED }}>
          <span style={{ color: MINT }}>$ </span>
          <Typed text="git log -G 'people_search' --oneline" start={8} />
        </div>
        <div style={{ marginTop: 18, opacity: k(f, 36, 44) }}>
          <span style={{ color: "#e5c07b" }}>ea22e3c</span> Skip people-search retries to save credits
        </div>
        <div style={{ marginTop: 26, padding: "22px 26px", borderLeft: `4px solid ${VIOLET}`, background: `${VIOLET}14`, borderRadius: 10, fontFamily: DISPLAY, fontSize: 30, lineHeight: 1.45, opacity: k(f, 50, 64) }}>
          <div style={{ fontFamily: MONO, fontSize: 18, color: VIOLET, letterSpacing: "0.2em", marginBottom: 10 }}>WHY IT WAS CHANGED</div>
          &ldquo;When people-search fails, move on with an empty list instead of retrying; sales can live with fewer contacts.&rdquo;
        </div>
        <div style={{ marginTop: 26, color: CORAL, opacity: k(f, 80, 92) }}>→ the agent now hides failures as &ldquo;no results&rdquo;</div>
      </Card>
    </AbsoluteFill>
  );
}

function Family() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const N = 10;
  return (
    <AbsoluteFill>
      <StageTitle n={3} title="One failure. Ten variants." sub="Antibody breeds a family: cases that must be fixed, and healthy cases that must not change." />
      <Card>
        <svg width={772} height={600} style={{ overflow: "visible" }}>
          {Array.from({ length: N }).map((_, i) => {
            const s = spring({ frame: f - 18 - i * 2, fps, config: { damping: 12, mass: 0.6 } });
            const a = (i / N) * Math.PI * 2 - Math.PI / 2;
            const x = 386 + Math.cos(a) * 230 * s;
            const y = 280 + Math.sin(a) * 230 * s;
            const mustFix = i < 7;
            const c = mustFix ? CORAL : MINT;
            return (
              <g key={i}>
                <line x1={386} y1={280} x2={x} y2={y} stroke={c} strokeOpacity={0.3 * s} strokeWidth={2} />
                <circle cx={x} cy={y} r={26} fill={`${c}33`} stroke={c} strokeWidth={2.5} />
                <text x={x} y={y + 8} textAnchor="middle" fill={c} fontFamily={MONO} fontSize={20}>
                  {String(i + 1).padStart(2, "0")}
                </text>
              </g>
            );
          })}
          <circle cx={386} cy={280} r={44} fill={CORAL} opacity={0.95} />
          <text x={386} y={289} textAnchor="middle" fill={BG} fontFamily={MONO} fontSize={26} fontWeight={700}>
            bug
          </text>
        </svg>
        <div style={{ display: "flex", gap: 40, fontFamily: MONO, fontSize: 24, marginTop: 4, opacity: k(f, 50, 64) }}>
          <span style={{ color: CORAL }}>● 7 must_fix</span>
          <span style={{ color: MINT }}>● 3 must_not_change</span>
        </div>
      </Card>
    </AbsoluteFill>
  );
}

function Proof() {
  const f = useCurrentFrame();
  const flips = [0, 1, 2, 3, 4, 5].map((i) => k(f, 40 + i * 7, 48 + i * 7));
  const passed = 1 + flips.filter((p) => p > 0.5).length;
  return (
    <AbsoluteFill>
      <StageTitle n={4} title="Proves the fix." sub="Writes a patch in an isolated worktree, then replays the whole family against it. Every case, for real." />
      <Card>
        <Label>replay · fix_1</Label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginTop: 28 }}>
          {Array.from({ length: 10 }).map((_, i) => {
            const isFix = i < 7;
            const flipP = isFix && i > 0 ? flips[i - 1] : 1;
            const ok = !isFix || i === 0 || flipP > 0.5;
            const c = ok ? MINT : CORAL;
            const appear = k(f, 8 + i * 2, 18 + i * 2);
            return (
              <div
                key={i}
                style={{
                  height: 120,
                  borderRadius: 18,
                  background: `${c}26`,
                  border: `2px solid ${c}`,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 46,
                  color: c,
                  fontWeight: 800,
                  opacity: appear,
                  transform: `rotateY(${isFix && i > 0 ? Math.sin(flipP * Math.PI) * 90 : 0}deg)`,
                  boxShadow: ok && flipP > 0.5 && flipP < 1 ? `0 0 40px ${MINT}88` : "none",
                }}
              >
                {ok ? "✓" : "✕"}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 30, marginTop: 40 }}>
          <div style={{ fontFamily: MONO, fontSize: 26, color: MUTED }}>must_fix</div>
          <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: "-0.04em", color: passed === 7 ? MINT : FG }}>
            {passed}/7
          </div>
          <div style={{ fontFamily: MONO, fontSize: 26, color: MUTED }}>healthy kept</div>
          <div style={{ fontSize: 56, fontWeight: 800, color: MINT }}>3/3</div>
        </div>
      </Card>
    </AbsoluteFill>
  );
}

function Approve() {
  const f = useCurrentFrame();
  const ring = (f % 24) / 24;
  const talking = f > 20 && f < 85;
  const said = k(f, 88, 100);
  const merged = k(f, 112, 124);
  return (
    <AbsoluteFill>
      <StageTitle n={5} title="Calls you. You decide." sub="A Telegram voice call to whoever is on call. Nothing merges until a human says the exact phrase." />
      <Card style={{ background: "linear-gradient(180deg, rgba(30,30,40,0.95), rgba(18,18,24,0.95))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <div style={{ position: "relative", width: 100, height: 100 }}>
            {f < 30 && <div style={{ position: "absolute", inset: 0, borderRadius: 50, border: `3px solid ${VIOLET}`, transform: `scale(${1 + ring * 0.8})`, opacity: 1 - ring }} />}
            <div style={{ position: "absolute", inset: 0, borderRadius: 50, background: `linear-gradient(135deg, ${MINT}, ${VIOLET})`, display: "grid", placeItems: "center" }}>
              <Mark size={52} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 40, fontWeight: 700 }}>Antibody</div>
            <div style={{ fontSize: 26, color: f < 20 ? VIOLET : MINT, fontFamily: MONO }}>{f < 20 ? "calling…" : `on call · 0:${String(Math.floor(f / 30) + 4).padStart(2, "0")}`}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, height: 120, marginTop: 30 }}>
          {Array.from({ length: 48 }).map((_, i) => {
            const h = talking ? 14 + Math.abs(Math.sin(f / 3 + i * 0.7) * Math.cos(f / 7 + i * 0.3)) * 100 : 10;
            return <span key={i} style={{ flex: 1, height: h, borderRadius: 4, background: i % 2 ? VIOLET : `${VIOLET}aa` }} />;
          })}
        </div>
        <div style={{ fontSize: 28, color: MUTED, lineHeight: 1.45, opacity: k(f, 24, 40) }}>
          &ldquo;Fix 1 passes 7 of 7 and keeps healthy runs unchanged. Say <span style={{ color: FG }}>approve fix 1</span> to merge.&rdquo;
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 28 }}>
          <div style={{ padding: "18px 28px", borderRadius: "26px 26px 6px 26px", background: MINT, color: BG, fontSize: 36, fontWeight: 700, opacity: said, transform: `scale(${0.8 + said * 0.2})`, transformOrigin: "right bottom" }}>
            🎙 approve fix 1
          </div>
        </div>
        <div style={{ marginTop: 22, fontFamily: MONO, fontSize: 26, color: MINT, opacity: merged }}>✓ merged · PR #3 · approved by voice</div>
      </Card>
    </AbsoluteFill>
  );
}

function Immune() {
  const f = useCurrentFrame();
  const draw = k(f, 6, 40);
  const row1 = k(f, 36, 50);
  const row2 = k(f, 62, 76);
  return (
    <AbsoluteFill>
      <StageTitle n={6} title="It can't come back." sub="The family becomes a deploy gate. Every future branch replays it before it ships." />
      <Card>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <svg viewBox="0 0 24 24" width={170} height={170}>
            <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z" fill={`${MINT}18`} stroke={MINT} strokeWidth={1.2} strokeDasharray={70} strokeDashoffset={70 * (1 - draw)} strokeLinejoin="round" />
            <path d="m8.5 12 2.5 2.5 4.5-5" fill="none" stroke={MINT} strokeWidth={1.6} strokeLinecap="round" strokeDasharray={12} strokeDashoffset={12 * (1 - k(f, 30, 44))} />
          </svg>
        </div>
        {[
          { p: row1, label: "branch re-introducing the bug", v: "BLOCKED", c: CORAL, d: "must_fix 3/7" },
          { p: row2, label: "main after the merge", v: "SAFE", c: MINT, d: "must_fix 7/7 · 3/3" },
        ].map((r) => (
          <div key={r.v} style={{ display: "flex", alignItems: "center", gap: 24, marginTop: 26, padding: "22px 28px", borderRadius: 18, border: `1px solid ${r.c}55`, background: `${r.c}12`, opacity: r.p, transform: `translateX(${(1 - r.p) * 40}px)` }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 28 }}>{r.label}</div>
              <div style={{ fontFamily: MONO, fontSize: 20, color: MUTED, marginTop: 4 }}>{r.d}</div>
            </div>
            <div style={{ fontSize: 52, fontWeight: 800, color: r.c, letterSpacing: "-0.02em" }}>{r.v}</div>
          </div>
        ))}
      </Card>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ 6. numbers */
function Stats() {
  const f = useCurrentFrame();
  const items = [
    { v: 139, fmt: (x: number) => `${Math.round(x)}s`, l: "from detection to a proven fix" },
    { v: 7, fmt: (x: number) => `${Math.round(x)}/7`, l: "failing cases fixed, 3/3 healthy kept" },
    { v: 0.053, fmt: (x: number) => `$${x.toFixed(3)}`, l: "total LLM cost for two real fixes" },
    { v: 0, fmt: () => "0", l: "merges without a human saying yes" },
  ];
  return (
    <AbsoluteFill style={{ padding: "150px 140px" }}>
      <Label>measured on real incidents</Label>
      <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: "-0.045em", marginTop: 18 }}>
        <Words text="Fast. Cheap. Accountable." start={4} stagger={6} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 56, marginTop: 110 }}>
        {items.map((it, i) => {
          const p = k(f, 24 + i * 8, 70 + i * 8);
          const appear = k(f, 20 + i * 8, 36 + i * 8);
          return (
            <div key={it.l} style={{ borderTop: `2px solid ${i === 3 ? VIOLET : MINT}`, paddingTop: 30, opacity: appear, transform: `translateY(${(1 - appear) * 40}px)` }}>
              <div style={{ fontSize: 100, fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{it.fmt(it.v * p)}</div>
              <div style={{ fontSize: 30, color: MUTED, marginTop: 20, lineHeight: 1.35 }}>{it.l}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ 7. end card */
function End() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - 4, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ transform: `scale(${0.85 + s * 0.15})`, opacity: s, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Mark size={150} draw={1} dot={1} />
        <div style={{ fontSize: 150, fontWeight: 700, letterSpacing: "-0.05em", marginTop: 26 }}>Antibody</div>
        <div style={{ fontSize: 46, color: MUTED, marginTop: 6 }}>Your agents will fail silently. Now someone&apos;s on call.</div>
      </div>
      <div style={{ position: "absolute", bottom: 190, display: "flex", gap: 22, alignItems: "center", opacity: k(f, 30, 46) }}>
        <div style={{ padding: "18px 34px", borderRadius: 999, background: FG, color: BG, fontSize: 34, fontWeight: 700 }}>100-53-230-116.sslip.io</div>
        <div style={{ fontFamily: MONO, fontSize: 26, color: MUTED }}>neatHack 2026 · team airo</div>
      </div>
    </AbsoluteFill>
  );
}
