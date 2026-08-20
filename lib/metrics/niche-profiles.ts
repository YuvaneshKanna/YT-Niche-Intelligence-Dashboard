// ─────────────────────────────────────────────────────────────────────────────
// AUTHORED ESTIMATES — NOT MEASURED DATA.
//
// Everything in this file is a judgement call, not a number returned by an API.
// YouTube's Data API exposes no demographic information for channels you do not
// own (that lives in the Analytics API, behind channel ownership), so audience
// age, gender skew and geography cannot be measured for tracked competitors.
// These figures are informed estimates standing in for data that does not exist.
//
// They surface in the UI flagged as `estimate` and styled differently from
// measured values. Disagree with one? Change the line. That is the intent.
//
// `rpmUsd` is overridden automatically wherever NexLev returns a real
// category RPM for a group's channels — measured always beats estimated.
// ─────────────────────────────────────────────────────────────────────────────

export type AiRisk = "low" | "medium" | "high"

export interface NicheProfile {
  /** Matched case-insensitively against the roster's `Niche` column. */
  niche: string
  /** Estimated long-form RPM in USD. Superseded by NexLev when available. */
  rpmUsd: number
  /** Dominant audience age band. */
  ageBand: string
  /** Male share of audience, 0-100. 50 = balanced. */
  maleSkewPct: number
  /** Primary geographies, highest-value first. */
  geoSkew: string[]
  /**
   * How easily generative AI can replicate this niche's core content.
   * high  = faceless narration over stock/AI footage; near-zero moat
   * medium= format is reproducible but needs real research or craft
   * low   = depends on a person, live events, or first-hand access
   */
  aiRisk: AiRisk
  /**
   * Prevalence of low-effort, reused, or farmed content in the niche.
   * 0-100, higher = more polluted.
   */
  inauthenticityPct: number
  /** Relative audience size signal, 0-100. Not a dollar-denominated TAM. */
  addressableAudience: number
  notes: string
}

export const NICHE_PROFILES: NicheProfile[] = [
  {
    niche: "Finance",
    rpmUsd: 14,
    ageBand: "25-44",
    maleSkewPct: 68,
    geoSkew: ["US", "UK", "CA", "AU"],
    aiRisk: "high",
    inauthenticityPct: 62,
    addressableAudience: 78,
    notes:
      "Highest advertiser demand on the platform. Also the most AI-flooded — faceless explainer finance is the single most replicated format of the last two years.",
  },
  {
    niche: "Business",
    rpmUsd: 12,
    ageBand: "25-44",
    maleSkewPct: 65,
    geoSkew: ["US", "UK", "IN", "CA"],
    aiRisk: "high",
    inauthenticityPct: 58,
    addressableAudience: 72,
    notes: "Strong RPM, heavy overlap with finance. Case-study formats trivially automated.",
  },
  {
    niche: "Technology",
    rpmUsd: 10,
    ageBand: "18-34",
    maleSkewPct: 75,
    geoSkew: ["US", "IN", "UK", "DE"],
    aiRisk: "medium",
    inauthenticityPct: 45,
    addressableAudience: 80,
    notes: "Hands-on reviews resist automation; news-roundup and listicle formats do not.",
  },
  {
    niche: "Real Estate",
    rpmUsd: 15,
    ageBand: "30-54",
    maleSkewPct: 60,
    geoSkew: ["US", "CA", "AU", "UK"],
    aiRisk: "medium",
    inauthenticityPct: 40,
    addressableAudience: 55,
    notes: "Very high RPM. Property tours need real access, which caps AI substitution.",
  },
  {
    niche: "Health",
    rpmUsd: 9,
    ageBand: "25-54",
    maleSkewPct: 42,
    geoSkew: ["US", "UK", "CA", "AU"],
    aiRisk: "medium",
    inauthenticityPct: 55,
    addressableAudience: 82,
    notes: "Good RPM but YouTube applies extra scrutiny to medical claims; demonetisation risk.",
  },
  {
    niche: "Education",
    rpmUsd: 8,
    ageBand: "18-34",
    maleSkewPct: 55,
    geoSkew: ["US", "IN", "UK", "PH"],
    aiRisk: "high",
    inauthenticityPct: 50,
    addressableAudience: 85,
    notes: "Large audience, moderate RPM. Explainer format is the most AI-substitutable there is.",
  },
  {
    niche: "History",
    rpmUsd: 7,
    ageBand: "25-54",
    maleSkewPct: 74,
    geoSkew: ["US", "UK", "DE", "CA"],
    aiRisk: "high",
    inauthenticityPct: 65,
    addressableAudience: 62,
    notes:
      "Loyal, high-retention audience. Also saturated with AI-narrated documentary content — authenticity is the differentiator.",
  },
  {
    niche: "Food",
    rpmUsd: 6,
    ageBand: "25-54",
    maleSkewPct: 38,
    geoSkew: ["US", "IN", "UK", "BR"],
    aiRisk: "low",
    inauthenticityPct: 35,
    addressableAudience: 88,
    notes: "Physical cooking cannot be faked convincingly. Low AI risk, moderate RPM.",
  },
  {
    niche: "Travel",
    rpmUsd: 6,
    ageBand: "25-44",
    maleSkewPct: 48,
    geoSkew: ["US", "UK", "DE", "AU"],
    aiRisk: "low",
    inauthenticityPct: 38,
    addressableAudience: 70,
    notes: "Requires being somewhere. Strong sponsorship potential beyond AdSense.",
  },
  {
    niche: "Sports",
    rpmUsd: 5,
    ageBand: "18-34",
    maleSkewPct: 82,
    geoSkew: ["US", "UK", "IN", "BR"],
    aiRisk: "low",
    inauthenticityPct: 42,
    addressableAudience: 90,
    notes:
      "Huge audience, modest RPM. Live and reaction formats are AI-resistant, but rights-holder claims are the real risk.",
  },
  {
    niche: "Lifestyle",
    rpmUsd: 5,
    ageBand: "18-34",
    maleSkewPct: 35,
    geoSkew: ["US", "UK", "IN", "PH"],
    aiRisk: "medium",
    inauthenticityPct: 52,
    addressableAudience: 84,
    notes: "Personality-led, so partly AI-resistant; the aesthetic-compilation end is not.",
  },
  {
    niche: "Gaming",
    rpmUsd: 4,
    ageBand: "13-24",
    maleSkewPct: 78,
    geoSkew: ["US", "BR", "IN", "PH"],
    aiRisk: "low",
    inauthenticityPct: 45,
    addressableAudience: 92,
    notes: "Largest audience, lowest RPM — the age skew is why advertisers pay less.",
  },
  {
    niche: "Entertainment",
    rpmUsd: 4,
    ageBand: "13-34",
    maleSkewPct: 50,
    geoSkew: ["US", "IN", "BR", "PH"],
    aiRisk: "high",
    inauthenticityPct: 70,
    addressableAudience: 95,
    notes: "Broadest reach, weakest monetisation, most content-farm competition.",
  },
]

/** Used when a niche has no profile entry. Deliberately pessimistic and low-confidence. */
export const FALLBACK_PROFILE: NicheProfile = {
  niche: "Unknown",
  rpmUsd: 5,
  ageBand: "unknown",
  maleSkewPct: 50,
  geoSkew: [],
  aiRisk: "medium",
  inauthenticityPct: 50,
  addressableAudience: 50,
  notes: "No profile for this niche — platform-median assumptions applied. Treat as low confidence.",
}

/**
 * Resolve a roster `Niche` value to a profile. Falls back to a substring match
 * so "Personal Finance" and "Finance & Investing" both land on the Finance
 * profile, then to FALLBACK_PROFILE.
 */
export function profileForNiche(niche: string): { profile: NicheProfile; matched: boolean } {
  const needle = (niche || "").trim().toLowerCase()
  if (!needle) return { profile: FALLBACK_PROFILE, matched: false }

  const exact = NICHE_PROFILES.find((p) => p.niche.toLowerCase() === needle)
  if (exact) return { profile: exact, matched: true }

  const partial = NICHE_PROFILES.find(
    (p) => needle.includes(p.niche.toLowerCase()) || p.niche.toLowerCase().includes(needle)
  )
  if (partial) return { profile: partial, matched: true }

  return { profile: FALLBACK_PROFILE, matched: false }
}
