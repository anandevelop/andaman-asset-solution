# SEO Analytics — แผนการทำงาน 6 เฟส

> **สถานะ: ข้อเสนอ (proposal) ยังไม่ถูก implement**
> เอกสารนี้เขียนจากการอ่านโค้ดจริงใน repo ณ วันที่ 2026-09-12
> ไฟล์อ้างอิงหลัก: `lib/seo-audit.ts`, `lib/admin/nav.ts`,
> `app/[locale]/admin/(growth)/`, `app/api/page-view/route.ts`,
> `lib/reports.ts`, `lib/csv.ts`, `prisma/schema.prisma`
>
> เอกสารประกอบ: [ADMIN_IA_BLUEPRINT.md](./ADMIN_IA_BLUEPRINT.md) ·
> [AGENTS.md](../AGENTS.md) · [TESTING.md](./TESTING.md)

---

## 0. TL;DR

| เฟส | ได้อะไร | ต้องใช้ Google credential | ขนาด | บล็อกโดย |
|---|---|---|---|---|
| **1. On-Page Audit** | rule engine 15 กฎ + คะแนนต่อ URL + export CSV ที่ขาด | **ไม่ต้อง** | ~4 วัน | — |
| **2. Core Web Vitals** | p75 จากผู้ใช้จริงราย route + attribution | **ไม่ต้อง** | ~2 วัน | 1 (โครง tab) |
| **3. เรียลไทม์** | กำลังชมกี่คน หน้าไหน นานเท่าไร | **ไม่ต้อง** | ~2 วัน | — |
| **4. Google APIs** | คำค้น อันดับ ประเทศ หน้าไหนติด + URL Inspection | **ต้อง** | ~5 วัน | 1 (โครง cron) |
| **5. Indexation & Crawl** | funnel sitemap→index + bot log + crawl budget | ใช้ผลจากเฟส 4 | ~3 วัน | 4 |
| **6. รายงาน** | PDF/CSV/Excel + อีเมลอัตโนมัติถึง CEO | — | ~3 วัน | 1–5 |

**รวมประมาณ 19 วันทำงาน** ถ้าทำคนเดียวเรียงลำดับ · เฟส 1–3 ทำขนานกับ
การเคลียร์ credential ได้ เพราะไม่แตะ Google เลย

**หัวใจของการแบ่ง:** เรียงตาม **ของที่ไม่ต้องพึ่งใครข้างนอก มาก่อน** ไม่ใช่
เรียงตามหมายเลขเสาหลัก เสาที่ 2 (On-Page) คำนวณจาก Postgres ล้วน ๆ จึงเป็น
เฟสแรก — มันพิสูจน์โครงทั้งหมด (tab, cron auth, rule engine, การส่งออก)
โดยไม่มี failure mode จากภายนอกมาปนตอน debug

---

## 1. เรื่องที่ต้องตัดสินก่อนเริ่ม: อะไรอยู่หน้าไหน

mockup รอบแรกยัดทุกอย่างไว้ใต้ `/admin/seo` ซึ่ง **ผิดกับ IA ที่ repo นี้
ตั้งไว้เอง** หลังจากอ่าน `app/[locale]/admin/(growth)/analytics/page.tsx`
แล้วชัดว่าโซน growth มีสองหน้าที่คนละคำถาม:

| หน้า | คำถามที่มันตอบ | อะไรควรไปอยู่ |
|---|---|---|
| `(growth)/seo` | "Google มองเว็บเรายังไง" | เสา 1, 2, 4 — คำค้น อันดับ การตรวจหน้าเว็บ การเก็บ index |
| `(growth)/analytics` | "คนใช้เว็บเรายังไง" | เรียลไทม์, Core Web Vitals, PathHitDay ที่มีอยู่ |
| `(growth)/reports` *(ใหม่)* | "จะส่งให้ผู้บริหารยังไง" | รายงานทุกชุด |

หน้า analytics มี tab Traffic / Content / Leads อยู่แล้ว เฟส 2 กับ 3 จึง
**เพิ่ม tab เข้าไปในหน้าที่มีอยู่** ไม่ใช่สร้างหน้าใหม่

### Sidebar ไม่ต้องเพิ่มแถวใหม่เลย

`lib/admin/nav.ts` เขียนกฎไว้ว่า sidebar ถือแค่ entity กับ page ส่วน
sub-navigation เป็น `PageTabs` ทุกเฟสจึงเพิ่มแค่ entry ใน
`NAV_TAB_GROUPS` ไม่มีเฟสไหนแตะ `ADMIN_NAV` ยกเว้นเฟส 6 ที่เพิ่ม
`reports` หนึ่งแถวในกลุ่ม administration

---

## 2. กฎที่ทุกเฟสต้องผ่าน (จาก AGENTS.md)

ไม่ใช่ checklist ตอนท้าย — เป็นส่วนหนึ่งของ definition of done ทุกเฟส

1. **`npm run verify` ต้องเขียว** (lint + typecheck + vitest) ก่อนบอกว่าเฟสเสร็จ
2. **i18n ครบ 4 ภาษา** ทุก key ที่เพิ่มต้องมีใน `messages/{en,th,zh,ru}.json`
   ครบทั้งสี่ — `tests/i18n.test.ts` จับทั้งสองทิศทาง และ next-intl throw
   ตอน render ไม่ใช่ fallback เงียบ ๆ **นี่คือต้นทุนจริงของทุกเฟส
   ประมาณ 40–70 key ต่อเฟส × 4**
3. **ทุกหน้า admin และทุก server action เรียก guard เอง** — `lib/admin/guard.ts`
   โซน `(growth)` มี floor เป็น `Role.ADMIN` อยู่แล้ว แต่ layout guard
   ไม่ป้องกัน server action ที่ถูกเรียกตรง
4. **env ใหม่ต้องเข้า `lib/env.ts`** — SEO ทั้งหมดเป็น `RECOMMENDED`
   (warn ไม่ fatal) ไม่ใช่ `REQUIRED` เพราะเว็บต้องรันได้โดยไม่มี Google
   และต้องมี case ใน `tests/env.test.ts`
5. **read path สาธารณะผ่าน `safeQuery`** — beacon endpoint ของเฟส 2/3
   เป็น write จึง **ไม่** wrap; หน้า admin ที่อ่าน rollup wrap
6. **พฤติกรรมใหม่ต้องมี test** — rule engine เฟส 1 เหมาะกับ unit test
   ที่สุดใน repo นี้ (กฎละไฟล์ ทดสอบด้วย fixture ไม่ต้องมี DB)
7. **comment อธิบาย "ทำไม" เป็นร้อยแก้วที่หัวไฟล์** ตามสไตล์บ้าน

---

## 3. รายละเอียดแต่ละเฟส

### เฟส 1 — On-Page Audit Engine (~4 วัน)

**เป้าหมาย:** ตอบได้ว่าหน้าไหนของเว็บขาดอะไร โดยไม่ต้องถาม Google

**ทำไมเป็นเฟสแรก:** ไม่ต้องใช้ credential, คำนวณจากแถวเดียวกับที่หน้าเว็บ
สาธารณะ render อยู่แล้ว, และ `lib/seo-audit.ts` มีโครงอยู่แล้วครึ่งทาง
เฟสนี้พิสูจน์โครงที่อีกห้าเฟสจะใช้ต่อ — `NAV_TAB_GROUPS.seo`,
`/api/cron/*` กับ `CRON_SECRET`, การส่งออก CSV — บนเฟสที่ถ้าพังคือโค้ดเราพัง
ไม่ใช่ 403 จาก Google

**งานที่ทำ**

- แตก `lib/seo-audit.ts` เป็น `lib/seo/rules/*.ts` กฎละไฟล์ แต่ละไฟล์
  export `{ key, severity, weight, check(input) }` — testable โดยไม่ต้องมี DB
- `lib/seo/score.ts` รวมน้ำหนักเป็นคะแนน 0–100
- `lib/seo/fetch-rendered.ts` ดึง HTML ของหน้าตัวเองมาตรวจ canonical /
  hreflang / H1 / JSON-LD (กฎที่อ่านจาก DB อย่างเดียวไม่ได้)
- Prisma: model `SeoUrlState` (url, auditScore, failedRules Json, checkedAt)
- `/api/cron/seo-audit` + `lib/seo/cron-auth.ts` ตรวจ `CRON_SECRET`
- เขียน `(growth)/seo/page.tsx` ใหม่เป็น PageTabs: ภาพรวม | ตรวจหน้าเว็บ
- ปุ่มส่งออก "รายการที่ขาด" เป็น CSV ด้วย `lib/csv.ts` ที่มีอยู่
- env: `CRON_SECRET`

**เสร็จเมื่อ:** เปิด `/admin/seo` แล้วเห็นคะแนนของ 372 URL, กดส่งออก CSV
ได้ไฟล์ที่ส่งให้นักแปลได้ทันที, `npm run verify` เขียว, มี unit test ครบทุกกฎ

**สิ่งที่ได้ทันที:** meta description ที่ขาด 37 หน้า แก้ได้ตั้งแต่สัปดาห์แรก

---

### เฟส 2 — Core Web Vitals จากผู้ใช้จริง (~2 วัน)

**เป้าหมาย:** รู้ว่าหน้าไหนช้าจริงบนมือถือลูกค้า ไม่ใช่บนเครื่อง dev

**ทำไมอยู่ตรงนี้:** เล็กที่สุดในบรรดาเฟสที่เหลือ และเป็นเฟสเดียวที่
เพิ่ม dependency ใหม่ (`web-vitals`) — ทำตอนโครง tab เพิ่งเสร็จจะได้
เห็นว่าโครงรับของใหม่ไหว

**งานที่ทำ**

- `npm i web-vitals` (attribution build)
- `components/WebVitalsBeacon.tsx` — ลอกโครงจาก `PageViewBeacon.tsx`
  รวมถึงการกัน double-mount ของ React dev
- `POST /api/vitals` — rate limited, ผูกกับ analytics consent ใน `lib/pdpa.ts`
- Prisma: model `WebVital` + `enum VitalMetric`
- `/api/cron/vitals-rollup` สรุป p75 รายวัน ลบ raw ที่เกิน 30 วัน
- tab "Core Web Vitals" ใน `(growth)/analytics`

**ระวัง:** p75 คำนวณตอน rollup ไม่ใช่ตอนเปิดหน้า — percentile บนตารางดิบ
ที่โตวันละหลักหมื่นแถวจะทำให้หน้า admin ช้าลงเรื่อย ๆ แบบที่ไม่มีใครสังเกต
จนสายเกินไป

**เสร็จเมื่อ:** เปิดเว็บจริงจากมือถือแล้วเห็นแถวเข้า `WebVital` ภายในไม่กี่วินาที
และ tab แสดง p75 ต่อ route ได้

---

### เฟส 3 — เรียลไทม์ (~2 วัน)

**เป้าหมาย:** "ตอนนี้มีคนอยู่ในเว็บกี่คน อยู่หน้าไหน นานแล้วเท่าไร"

**ทำไมไม่ใช้ GA4:** GA4 Realtime API ให้ `activeUsers` ได้ แต่มิติหน้าเว็บ
คือ `unifiedScreenName` (ชื่อหน้า ไม่ใช่ path), มองย้อนได้แค่ 30 นาที,
และ **ไม่มี metric เวลาเฉลี่ยเลย** — มีแค่ activeUsers, screenPageViews,
eventCount, keyEvents ข้อมูลที่อยากได้จึงต้องเก็บเอง ซึ่งโปรเจกต์นี้
มีครึ่งทางอยู่แล้วใน `PageViewBeacon` + `/api/page-view`

**งานที่ทำ**

- ขยาย `PageViewBeacon` ให้ยิง heartbeat ทุก 15 วินาที พร้อม `dwellMs`
- ขยาย `COUNTED_PREFIXES` ใน `/api/page-view` จาก `/news/` เป็นทุก path
  สาธารณะ (ผ่าน `lib/public-paths.ts`) — ระวังตารางโตเร็วขึ้นมาก
- Prisma: model `LiveVisit` (visitHash, path, locale, startedAt, lastSeenAt)
  โดย `visitHash` เป็น hash ที่ไม่ย้อนกลับ ไม่เก็บ IP ตรงตามที่
  `/api/page-view` ตั้งใจไว้แต่แรก
- ลบแถวที่ `lastSeenAt` เกิน 15 นาที ตอนเขียนครั้งถัดไป (ไม่ต้องมี cron)
- tab "เรียลไทม์" ใน `(growth)/analytics` — poll ทุก 20 วินาที
- (ทางเลือก) GA4 Realtime สำหรับประเทศ/เมือง ซึ่งเราเดาเองไม่ได้ถ้าไม่เก็บ IP

**เสร็จเมื่อ:** เปิดเว็บสองแท็บแล้วตัวเลขขึ้นเป็น 2 ภายใน 20 วินาที

---

### เฟส 4 — Google APIs (~5 วัน) · **ต้องมี credential**

**เป้าหมาย:** คำค้น อันดับ ประเทศ และ "คำนี้ติดจากหน้าไหน" แบบ Search Console

**ทำไมอยู่หลัง 1–3 ทั้งที่ credential พร้อมแล้ว:** เป็นเฟสที่ใหญ่ที่สุดและมี
failure mode ภายนอกมากที่สุด (403 จาก property ที่ไม่ได้แชร์, โควตาหมด,
ข้อมูลหน่วง 2–3 วัน) การเจอ bug ตอนที่โครง tab กับ cron ยังไม่เคยผ่านการใช้งาน
จริง จะแยกไม่ออกว่าพังที่ฝั่งไหน — ถ้าอยากสลับมาทำก่อนเฟส 1 ทำได้ แต่ให้
ยกโครง cron + `CRON_SECRET` จากเฟส 1 มาก่อน

**งานที่ทำ**

- `lib/seo/google-client.ts` — mint access token จาก service account ด้วย
  `node:crypto` ตรง ๆ ตามที่ `scripts/seo-check.ts` ทำไว้แล้ว
  **ไม่ลง `googleapis`** (60MB สำหรับ 4 endpoint ไม่คุ้ม และ Dockerfile
  ก็ไม่ต้องโตตาม)
- `lib/seo/search-console.ts` — `searchanalytics.query` รองรับ dimension
  ผสม (query + page + country + device) ในคำขอเดียว, `dimensionFilterGroups`,
  paginate ด้วย `startRow` ครั้งละ 25,000 แถว
- รองรับ dimension `HOUR` + `dataState: HOURLY_ALL` (ย้อนได้ 10 วัน)
  เพื่อทำมุมมอง 24 ชั่วโมง
- `lib/seo/url-inspection.ts` — โควตา **2,000 URL/วัน ต่อ property**
  คือข้อจำกัดจริงข้อเดียวของระบบนี้ ตอนนี้เว็บมี 372 URL กวาดครบทุกวันสบาย
  เขียนโค้ดให้สุ่มตามรอบไว้ตั้งแต่แรก เผื่อวันที่เกิน 2,000
- Prisma: `SeoQueryStat` (@@id [date, query, page, device]) + เติมฟิลด์
  coverageState / googleCanonical / lastCrawled ใน `SeoUrlState`
- cron 3 ตัว: seo-search (03:00), seo-inspect (04:00), psi (05:00)
- tab "คำค้น & หน้าเว็บ" พร้อมแถวกดขยายดู page/country/device
- env: `GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`, `GSC_SITE_URL`,
  `GA4_PROPERTY_ID`, `PAGESPEED_API_KEY`

**เสร็จเมื่อ:** `npm run seo:check` เขียวทุกบรรทัด และตารางคำค้นมีข้อมูลจริง
ย้อนหลัง 28 วัน

**ต้องบอกผู้ใช้ในหน้าจอ:** Google ตัดคำค้นที่คนค้นน้อยมากทิ้งเพื่อความเป็นส่วนตัว
ผลรวมของแถวจึงน้อยกว่ายอดรวมเสมอ — ถ้าไม่เขียนไว้ จะมีคนแจ้งว่าเป็นบั๊กทุกเดือน

---

### เฟส 5 — Indexation & Crawl (~3 วัน)

**เป้าหมาย:** "บอทเข้ามาเจออะไร" และ URL ไหนค้างไม่ถูก index

**บล็อกโดยเฟส 4:** funnel ต้องใช้ `coverageState` จาก URL Inspection

**งานที่ทำ**

- ตรวจ user-agent ใน `proxy.ts` เขียน `CrawlHit` — **เขียนแบบ
  fire-and-forget ห้าม await** ในเส้นทาง request ของผู้ใช้จริง
- Prisma: model `CrawlHit` + rollup รายชั่วโมง
- funnel: sitemap → discovered → crawled → indexed → มี impression
  โดย join `SeoUrlState` กับ `SeoQueryStat`
- ต่อยอดตาราง `NotFoundHit` ที่มีอยู่ ให้มีคอลัมน์ "บอทตัวไหนเจอ"
- tab "การเก็บ Index" ใน `(growth)/seo`

**ระวัง:** `proxy.ts` รันบน edge runtime — Prisma เขียนตรงจากตรงนั้นไม่ได้
ต้องยิงเข้า route handler ใน node runtime หรือ buffer แล้ว flush เป็นชุด

---

### เฟส 6 — รายงาน (~3 วัน)

**เป้าหมาย:** ส่งให้ CEO อ่านรู้เรื่องใน 2 นาที

**งานที่ทำ**

- `(growth)/reports/page.tsx` — เลือกกลุ่มผู้อ่าน (ผู้บริหาร / การตลาด /
  ทีมพัฒนา), ช่วงเวลา, ภาษา
- หน้ารายงานเป็น HTML ที่มี `@media print` → Save as PDF ได้ทุกเบราว์เซอร์
  **ไม่ลง Puppeteer/Playwright ใน image** (โตขึ้นราว 400MB เพื่อฟีเจอร์ที่
  กดเองได้อยู่แล้ว) ถ้าวันหนึ่งต้องแนบ PDF ไปกับอีเมลจริง ๆ ค่อยเพิ่มทีหลัง
  โดยไม่ต้องรื้อหน้ารายงาน
- ส่งออก CSV/Excel ด้วย `lib/csv.ts` + SpreadsheetML แบบ XML ธรรมดา
- `/api/cron/monthly-report` ส่งอีเมล HTML ผ่าน `lib/email.ts` + SMTP ที่ตั้งแล้ว
- เพิ่ม `reports` หนึ่งแถวใน `ADMIN_NAV` กลุ่ม administration

**ตัวเลขที่สำคัญที่สุดของรายงาน** คือการ join Search Console เข้ากับ
`LeadInquiry` ผ่าน `lib/reports.ts` — "โครงการนี้คนเข้าดู 1,284 ครั้ง
ได้ผู้สนใจ 11 ราย" รายงาน SEO ที่ไม่ผูกกับ lead คือรายงานที่อ่านจบแล้ว
ไม่รู้จะทำอะไรต่อ

---

## 4. ความเสี่ยงที่ประเมินไว้

| ความเสี่ยง | เฟส | ทางรับมือ |
|---|---|---|
| ตาราง `PathHitDay` / `LiveVisit` โตเร็วกว่าที่คิดเมื่อเลิกจำกัดแค่ `/news/` | 3 | rollup รายวัน + ลบ raw เกิน 30 วัน วัดขนาดตารางหลังสัปดาห์แรก |
| โควตา URL Inspection 2,000/วัน ตันเมื่อเว็บโตเกิน 2,000 URL | 4 | เขียน scheduler แบบสุ่มตามรอบตั้งแต่แรก ไม่ใช่กวาดทั้งหมดเสมอ |
| `proxy.ts` เขียน DB ทำให้ทุก request ช้าลง | 5 | fire-and-forget + buffer, วัด TTFB ก่อน/หลังด้วยเฟส 2 ที่ทำไว้แล้ว |
| i18n 4 ภาษาบวมจนคนข้าม | ทุกเฟส | เขียน key ตอนเขียนหน้า ไม่ใช่ตอนท้าย `tests/i18n.test.ts` จับให้อยู่แล้ว |
| ข้อมูล Google หน่วง 2–3 วัน ทำให้คนคิดว่าระบบพัง | 4, 6 | เขียน "ข้อมูลถึงวันที่ ..." บนหน้าจอและในรายงานทุกฉบับ |

---

## 5. ลำดับที่แนะนำ กับลำดับที่สลับได้

```
เฟส 1 ─┬─► เฟส 2 ──┐
       │            ├─► เฟส 6
       ├─► เฟส 3 ───┤
       │            │
       └─► เฟส 4 ──►┴─ เฟส 5 ─┘
```

- **เฟส 3 ไม่ขึ้นกับใครเลย** ทำแทรกเมื่อไรก็ได้ ถ้าอยากได้ของที่เห็นผลเร็ว
  ที่สุดเพื่อโชว์ ให้ทำเฟส 3 ก่อน
- **เฟส 4 สลับมาก่อนเฟส 1 ได้** ถ้าอยากเห็นข้อมูล Search Console เร็ว ๆ
  แต่ต้องยกโครง cron + `CRON_SECRET` จากเฟส 1 มาทำก่อน
- **เฟส 6 ทำก่อนเฟส 4–5 ได้** โดยออกรายงานจากข้อมูลเฟส 1–3 ไปก่อน
  แล้วค่อยเติมส่วน Google ทีหลัง — โครงรายงานไม่ต้องรื้อ
