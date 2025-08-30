
// Acceptance Timer — Auto Levels (Tradovate, bars-based) v2
// Purpose: Auto-compute PDH/PDL/ONH/ONL from session windows and time the acceptance window
//          for Failed Breakdown (accept ABOVE PDL/ONL) and Failed Breakout (accept BELOW PDH/ONH).
// Notes:
// - Uses bars-based acceptance (set acceptanceBars to 5/10/15 on 1m; 2/3 on 5m for 10/15m targets).
// - Session windows are user-configurable (default: RTH 09:30–16:00, ETH starts 18:00).
// - levelSource selects which level to monitor: Manual/PDH/PDL/ONH/ONL. Manual allows explicit price.
// - aboveModeAuto picks accept-side automatically based on levelSource (can override).
//
// Install (Tradovate):
// 1) Open Trader → '+' → add Code Explorer → File → New → paste this file → Save (e.g., "acceptanceTimerAuto.js").
// 2) On a chart: Indicators → search "ACCEPTANCETIMERAUTO" → add as **overlay**.
// 3) Inputs:
//    - levelSource: Manual|PDH|PDL|ONH|ONL
//    - manualLevel: price when levelSource = Manual
//    - rthStartHour: 9, rthStartMinute: 30, rthEndHour: 16, rthEndMinute: 0
//    - ethStartHour: 18, ethStartMinute: 0
//    - acceptanceBars: 5/10/15 (on 1m); adjust for other TFs
//    - aboveModeAuto: true (recommended) → auto sets accept side for FD/FB
//    - aboveModeOverride: forces accept side if aboveModeAuto=false
//    - showLabel/showBg: visualization
//
// DISCLAIMER: Educational tool—validate on SIM before live use.

const predef = require('./tools/predef');
const meta   = require('./tools/meta');
const { px, du, op } = require('./tools/graphics');

function hhmmInRange(h, m, h1, m1, h2, m2) {
    // true if time (h:m) is in [h1:m1, h2:m2) same-day window (no wrap)
    const t  = h*60 + m;
    const a  = h1*60 + m1;
    const b  = h2*60 + m2;
    return (t >= a) && (t < b);
}

class AcceptanceTimerAuto {
    init() {
        // Rolling trackers
        this.prevRTHDayKey   = null;   // e.g., '2025-08-30'
        this.currDayKey      = null;
        this.rthHigh         = null;
        this.rthLow          = null;
        this.prevDayHigh     = null;   // PDH
        this.prevDayLow      = null;   // PDL

        this.overnightKey    = null;   // key for overnight window ending at next RTH open
        this.onHigh          = null;
        this.onLow           = null;

        this.acceptBars      = 0;
        this.accepted        = false;
        this.lastLevel       = null;
    }

    map(d, i, series) {
        // Inputs
        const src            = (this.props.levelSource||"Manual").toString();
        const manualLevel    = this.props.manualLevel;
        const rthSh          = this.props.rthStartHour,   rthSm = this.props.rthStartMinute;
        const rthEh          = this.props.rthEndHour,     rthEm = this.props.rthEndMinute;
        const ethSh          = this.props.ethStartHour,   ethSm = this.props.ethStartMinute;
        const acceptN        = Math.max(1, Math.floor(this.props.acceptanceBars));
        const autoSide       = this.props.aboveModeAuto;
        const aboveOverride  = this.props.aboveModeOverride;
        const showLabel      = this.props.showLabel;
        const showBg         = this.props.showBg;

        // Bar time (assumes chart TZ is exchange/local; adjust inputs if needed)
        const ts  = new Date(d.timestamp);
        const h   = ts.getHours();
        const m   = ts.getMinutes();
        const y   = ts.getFullYear();
        const mo  = ts.getMonth()+1;
        const da  = ts.getDate();

        const dayKey = `${y}-${('0'+mo).slice(-2)}-${('0'+da).slice(-2)}`;

        // Determine session
        const inRTH = hhmmInRange(h, m, rthSh, rthSm, rthEh, rthEm);
        // Overnight: from ETH start to next RTH start (wraps across midnight)
        // We'll mark bars as overnight if time >= ethStart OR time < rthStart
        const afterEth = (h*60+m) >= (ethSh*60+ethSm);
        const beforeRth= (h*60+m) <  (rthSh*60+rthSm);
        const inON     = afterEth || beforeRth;

        // Track RTH highs/lows per day for PDH/PDL
        if (this.currDayKey !== dayKey) {
            // New calendar day. If we have completed an RTH window yesterday, store PDH/PDL.
            if (this.currDayKey && this.rthHigh != null && this.rthLow != null) {
                this.prevDayHigh = this.rthHigh;
                this.prevDayLow  = this.rthLow;
                this.prevRTHDayKey = this.currDayKey;
            }
            // Reset today RTH trackers
            this.currDayKey = dayKey;
            this.rthHigh = null;
            this.rthLow  = null;
        }

        if (inRTH) {
            const vH = series.high(i);
            const vL = series.low(i);
            this.rthHigh = (this.rthHigh==null) ? vH : Math.max(this.rthHigh, vH);
            this.rthLow  = (this.rthLow==null)  ? vL : Math.min(this.rthLow,  vL);
        }

        // Track ON highs/lows for ONH/ONL per overnight period
        // Overnight key transitions at RTH start; use dayKey as the day the ON ends.
        let overnightKey = dayKey;
        if (inON && afterEth) {
            // evening side (belongs to tomorrow morning's RTH), keep same key
            overnightKey = this.nextDayKey(dayKey);
        }
        if (this.overnightKey !== overnightKey) {
            // New overnight window starting
            this.overnightKey = overnightKey;
            this.onHigh = null;
            this.onLow  = null;
        }
        if (inON) {
            const vH = series.high(i);
            const vL = series.low(i);
            this.onHigh = (this.onHigh==null) ? vH : Math.max(this.onHigh, vH);
            this.onLow  = (this.onLow==null)  ? vL : Math.min(this.onLow,  vL);
        }

        // Choose level
        let level = manualLevel;
        if (src === "PDH" && this.prevDayHigh!=null) level = this.prevDayHigh;
        if (src === "PDL" && this.prevDayLow!=null)  level = this.prevDayLow;
        if (src === "ONH" && this.onHigh!=null)      level = this.onHigh;
        if (src === "ONL" && this.onLow!=null)       level = this.onLow;

        // Determine accept side
        let aboveMode = true;
        if (autoSide) {
            if (src === "PDH" || src === "ONH") aboveMode = false; // failed breakout → accept below
            if (src === "PDL" || src === "ONL") aboveMode = true;  // failed breakdown → accept above
            if (src === "Manual")               aboveMode = true;  // default
        } else {
            aboveMode = !!aboveOverride;
        }

        // Acceptance counting (bars-based)
        const vClose = d.value();
        const onSide    = aboveMode ? (vClose >= level) : (vClose <= level);
        const prevClose = (i>0) ? series[i-1].value() : vClose;
        const prevOnSide= aboveMode ? (prevClose >= level) : (prevClose <= level);
        const reclaimStart = onSide && !prevOnSide;

        if (reclaimStart) {
            this.acceptBars = 1;
            this.accepted   = false;
        } else if (onSide) {
            this.acceptBars = Math.min(acceptN, (this.acceptBars||0) + 1);
        } else {
            this.acceptBars = 0;
            this.accepted   = false;
        }
        if (this.acceptBars >= acceptN) this.accepted = true;

        // Keep last level for label formatting
        this.lastLevel = level;

        // Visuals
        const items = [];

        // Horizontal infinite line for the chosen level
        if (level != null && isFinite(level)) {
            items.push({
                tag: 'LineSegments',
                key: 'accept_line',
                lines: [{
                    tag: 'Line',
                    a: { x: du(0), y: du(level) },
                    b: { x: du(1), y: du(level) },
                    infiniteStart: true,
                    infiniteEnd: true
                }],
                lineStyle: {
                    lineWidth: 2,
                    color: this.accepted ? '#00b37e' : '#ffb300'
                }
            });
        }

        // Status label
        if (showLabel && d.isLast() && level != null && isFinite(level)) {
            const text = (this.accepted
                ? `ACCEPTED • ${this.acceptBars}/${acceptN} bars @ ${level.toFixed(2)}`
                : `Acceptance: ${this.acceptBars}/${acceptN} bars @ ${level.toFixed(2)}`);

            items.push({
                tag: 'Text',
                key: 'accept_label',
                point: { x: op(du(d.index()), '-', px(10)), y: op(du(level), '-', px(18)) },
                text: text,
                style: { fontSize: 14, fontWeight: "bold", fill: this.accepted ? '#00b37e' : '#ffb300' },
                textAlignment: 'rightMiddle'
            });
        }

        // Shade background when accepted
        if (showBg && this.accepted && level!=null && isFinite(level)) {
            items.push({
                tag: 'Box',
                key: 'accept_bg',
                box: {
                    left: du(Math.max(0, d.index()-50)), right: du(d.index()),
                    top: du(Math.max(level, series.high(i))), bottom: du(Math.min(level, series.low(i)))
                },
                style: { color: '#00b37e', opacity: 0.1 }
            });
        }

        return { graphics: { items } };
    }

    nextDayKey(dayKey) {
        const [y, m, d] = dayKey.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m-1, d));
        dt.setUTCDate(dt.getUTCDate()+1);
        const y2 = dt.getUTCFullYear(), m2 = dt.getUTCMonth()+1, d2 = dt.getUTCDate();
        return `${y2}-${('0'+m2).slice(-2)}-${('0'+d2).slice(-2)}`;
    }
}

module.exports = {
    name: "acceptanceTimerAuto",
    description: "Acceptance Timer — Auto Levels (PDH/PDL/ONH/ONL)",
    calculator: AcceptanceTimerAuto,
    inputType: meta.InputType.BARS,
    areaChoice: meta.AreaChoice.OVERLAY,
    params: {
        levelSource:   predef.paramSpecs.enum({Manual:"Manual", PDH:"PDH", PDL:"PDL", ONH:"ONH", ONL:"ONL"}, "PDL"),
        manualLevel:   predef.paramSpecs.number(0.0, 0.25, 0.25),
        rthStartHour:  predef.paramSpecs.number(9, 0, 1),
        rthStartMinute:predef.paramSpecs.number(30, 0, 1),
        rthEndHour:    predef.paramSpecs.number(16, 0, 1),
        rthEndMinute:  predef.paramSpecs.number(0, 0, 1),
        ethStartHour:  predef.paramSpecs.number(18, 0, 1),
        ethStartMinute:predef.paramSpecs.number(0, 0, 1),
        acceptanceBars:predef.paramSpecs.number(10, 1, 1),
        aboveModeAuto: predef.paramSpecs.bool(true),
        aboveModeOverride: predef.paramSpecs.bool(true),
        showLabel:     predef.paramSpecs.bool(true),
        showBg:        predef.paramSpecs.bool(true)
    },
    tags: ["Coach","FD/FB","Risk"]
};
