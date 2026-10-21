# PrayerLock ASO Package

App Store Optimization for launch, engineered against the six niche
validation filters. Every product and listing decision below exists to make
each filter pass.

The six filters (from the validation slide):

| # | Filter | Target |
|---|--------|--------|
| 1 | Keyword Popularity (KP) | > 20 |
| 2 | Keyword Difficulty (KD) | < 50 |
| 3 | Weak apps ranking | Low-rating apps already in Top 10 |
| 4 | Market freshness | Recently released apps in Top 10 |
| 5 | Combined weakness | 2+ apps that are both low-rated and recent |
| 6 | Revenue proof | Top niche apps at ~$10K+ MRR |

Honesty note: KP, KD, ratings, and revenue are live market numbers that only
an ASO tool can confirm on launch week (AppTweak, Appfigures, or Sensor
Tower). This package does two things: (a) selects a keyword territory whose
historical pattern fits KP > 20 with KD < 50, and (b) builds every
controllable ranking lever into the product and listing. Run the validation
worksheet at the bottom before spending on ads.

---

## 1. Niche selection and why it fits the filters

PrayerLock sits at the intersection of two proven territories:

- **Prayer tracking** (Muslim prayer / salat companion): high, stable search
  volume driven by 1.9B Muslims, dominated by a few old incumbents whose
  apps have not meaningfully changed in years (filters 3 and 6).
- **Habit tracking / self improvement**: enormous volume but brutal KD.
  We do not fight there head on.

The wedge is the long tail combination: prayer + habit + identity. Terms
like "prayer habit tracker", "salat tracker", "muslim productivity",
"future self", and "become who you want" show the exact signature the
filters ask for: real search demand (KP > 20) with weak, outdated, or
indirect competition (KD < 50), because the big habit apps ignore the
prayer use case and the big prayer apps ignore habit mechanics.

Why filters 3, 4, 5 pass in this territory:

- Top 10 for "salat tracker" and similar terms historically includes apps
  with dated UI, few reviews relative to volume, and ratings below the
  category leaders (filter 3).
- Several prayer adjacent apps launched within the last 1 to 2 years and
  already rank, proving recency is rewarded (filter 4).
- At least two of those recent entrants also carry mediocre ratings, which
  is the combined-weakness signal (filter 5). Outranking them with a
  better product and listing is the plan.
- The top prayer apps monetize with subscriptions (Athan's premium tier,
  Pillars, Muslim Pro historically at multi-million ARP). $10K+ MRR at the
  top of the niche is well documented by public revenue estimates
  (filter 6).

Re-confirm all four market-side filters in your ASO tool during launch
week. Algorithm mixes shift.

## 2. How the product itself is built to rank

Ranking is not only metadata. These are implemented in the app:

- **Ratings prompt timing**: the app asks for a rating only after a Perfect
  Day (100% daily score) or a 7 day streak, the two moments of peak
  satisfaction. This directly attacks filter 3: our rating stays high while
  incumbent ratings stagnate.
- **Review velocity loop**: streak notifications re-engage lapsed users,
  growing active devices, which the stores reward with keyword ranking.
- **Retention mechanics**: daily quests, streaks, and the weekly report
  drive D30 retention, the strongest ranking signal after downloads.
- **Demo account for screenshots**: the store listing shows real product
  screens with real data (seeded demo user), not mockups.
- **No paywall in v1**: conversion first, monetization experiments later.
  (A single premium tier can be added in v1.1 without touching ASO.)

## 3. Keyword strategy (see keywords.json)

Structure:

- **Brand**: prayerlock
- **Core wedge** (title + subtitle + keyword field): prayer habit tracker,
  salat tracker, muslim habits, future self
- **Supporting** (description, Android full text): prayer times companion,
  daily deen, quran reading habit, discipline app, identity habits,
  accountability coach
- **Expansion tests after launch**: athan companion, ramadan tracker
  (seasonal spike, prepare a Ramadan update), habit streak

Rules applied:

- iOS keyword field is exactly 100 characters, comma separated, no spaces,
  no words already in the title (they are indexed for free).
- Singular forms only where Apple treats plural as separate.
- No competitor trademarks in metadata.

## 4. Listing files

- `store_listing_ios.md`: app name, subtitle, 100 char keyword field,
  promotional text, full description
- `store_listing_android.md`: title, short description, full description
  (Google indexes the full text, so keywords are woven into sentences)
- `screenshots.md`: 6 screenshot captions using real app screens

## 5. Pre-launch validation worksheet

Do this in AppTweak or Appfigures before launch spend:

| Check | How | Pass |
|-------|-----|------|
| KP of "salat tracker", "prayer habit tracker", "muslim productivity" | Keyword tool | Each > 20 |
| KD of same terms | Keyword tool | Each < 50 |
| Top 10 ratings for "salat tracker" | SERP view | 2+ apps < 4.5 |
| Release dates in Top 10 | App pages | 2+ apps < 2 years old |
| Combined weakness | Cross reference | Same 2 apps on both lists |
| Revenue of top 3 niche apps | Revenue estimates | $10K+ MRR each |

If any check fails, rotate to the backup territory order in keywords.json
(muslim productivity first, then prayer habits) and re-check. Do not launch
paid UA until all six pass.

## 6. Post-launch cadence

- Week 1: monitor keyword rankings for the 4 wedge terms daily.
- Week 2: first update (even a small one) to trigger the recency boost.
- Monthly: swap one underperforming keyword in the iOS keyword field, never
  more than one per release, so attribution stays clean.
- Ramadan: dedicated update with seasonal screenshot 6 and "Ramadan
  tracker" keyword swap. Biggest organic spike of the year in this niche.
