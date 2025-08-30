# OCO/ATM Presets — Consolidated (Risk Pack v2.2 merged)

**Risk modes**
- **Target:** risk ≤ $600
- **Cap:** risk ≤ $800 (A-setups only)

## MES (22 contracts standard)
- **Target stop:** 5.25 pts → ≈$577.50 risk
- **Cap stop:**    7.25 pts → ≈$797.50 risk
- **T1 (ES):** 8–12 pts (default 10)
- **Banking:** Bank60 = 14/5/3, Bank75 = 17/3/2

## MNQ (11 contracts standard)
- **Target stop:** 27.25 pts → ≈$600 risk
- **Cap stop:**    36.25 pts → ≈$798 risk
- **T1 (NQ):** 30–40 pts (default 35)
- **Banking:** Bank60 = 7/3/1, Bank75 = 8/2/1

**Management rules**
- No break-even before **T1 + base** at the pivotal point.
- After T1 + base, trail to the **pivot/structure**; as bases form higher, hand-off trails up (T1→T2 zone).
- Adds only on **strength** and **smaller** than the initial unit.
- Two-loss pause = 60 min. Time stop = 30 min if no T1.
