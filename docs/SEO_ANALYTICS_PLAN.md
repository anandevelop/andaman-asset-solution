# SEO Analytics — แผนการทำงาน 6 เฟส

> **สถานะ: ข้อเสนอ (proposal) ยังไม่ถูก implement** · **ปรับรอบ 2 เมื่อ 2026-09-25**
> เอกสารนี้เขียนจากการอ่านโค้ดจริงใน repo ณ วันที่ 2026-09-12 และแก้ตาม
> review ของ mockup `Claude outputs/seo-analytics-mockup.html` — ดูสิ่งที่
> เปลี่ยนได้ที่ [หัวข้อ 6](#6-ประวัติการแก้)
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
| **1. On-Page Audit** | rule engine 15 กฎ + คะแนนต่อ URL + ประวัติคะแนน + ยกเว้นกฎ + export CSV | **ไม่ต้อง** | ~5 วัน | — |
| **2. Core Web Vitals** | p75 จากผู้ใช้จริงราย route + attribution + TTFB | **ไม่ต้อง** | ~2 วัน | 1 (โครง tab) |
| **3. เรียลไทม์** | กำลังชมกี่คน หน้าไหน นานเท่าไร | **ไม่ต้อง** | ~2 วัน | — |
| **4. Google APIs** | ข้อมูลจริงเข้า tab คำค้น**เดิม** + แบรนด์/ไม่ใช่แบรนด์ + โอกาส + URL Inspection | **ต้อง** | ~5 วัน | 1 (โครง cron) |
| **5. Indexation & Crawl** | funnel sitemap→index + bot log + crawl budget | ใช้ผลจากเฟส 4 | ~3 วัน | 4 |
| **6. รายงาน** | PDF/CSV/Excel + อีเมลอัตโนมัติ + ผูก lead ที่มาจาก Google + แจ้งเตือน | — | ~4 วัน | 1–5 |

**รวมประมาณ 21 วันทำงาน** ถ้าทำคนเดียวเรียงลำดับ (รอบแรก 19 — เพิ่มเฟส 1 กับ 6 อย่างละวัน) · เฟส 1–3 ทำขนานกับ
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
`reports` หนึ่งแถวใน**กลุ่ม growth** (ถัดจาก SEO กับ Analytics)

> รอบแรกเขียนว่า "กลุ่ม administration" ซึ่งขัดกับตารางด้านบน
> (`(growth)/reports`) และขัดกับหัวไฟล์ `nav.ts` ที่ย้าย SEO/analytics
> ออกจาก Administration มาแล้วโดยเจตนา — "เว็บเราเป็นยังไง" กับ
> "ใครลบอันนั้น" ไม่ควรอยู่ลิสต์เดียวกัน

### tab ที่มีอยู่แล้วใน `(growth)/seo` — ห้ามทำซ้ำ

`NAV_TAB_GROUPS.seo` มี `overview · keywords · links · urls · defaults`
อยู่แล้ว และแต่ละหน้ามีข้อมูลของตัวเอง mockup รอบแรกสร้างของซ้ำกับ
สามหน้าในนี้ รอบนี้จึงกำหนดให้ชัด:

| tab เดิม | มีอะไรอยู่แล้ว | เฟสไหนใช้ยังไง |
|---|---|---|
| `keywords` | `lib/admin/keyword-library.ts` — model `Keyword` (currentRank, previousRank, rankCheckedAt, trend), cannibalization, cluster | **เฟส 4 เติมข้อมูลเข้าหน้านี้** ไม่สร้าง tab "คำค้น & หน้าเว็บ" ใหม่ — ไม่งั้นจะมีตัวเลขอันดับสองชุดที่ไม่ตรงกัน |
| `links` | `lib/admin/link-graph.ts` — ลิงก์เสีย, orphan pages, redirect chain | กฎ "ลิงก์ภายในเสีย" ของเฟส 1 **อ่านผลจาก link-graph** ไม่สแกนซ้ำ |
| `urls` | redirect ที่จัดการเองและอัตโนมัติ (`RedirectSource`) | ปุ่ม "ตั้ง redirect" ในตาราง 404 ของเฟส 5 เปิดหน้านี้พร้อมกรอก path ไว้ให้ |
| `defaults` | ค่าเริ่มต้น SEO + แบรนด์ | เฟส 4 เพิ่มช่อง **คำแบรนด์** (`brandTerms`) ไว้ที่นี่ |

tab ใหม่มีแค่ `audit` (เฟส 1) กับ `index` (เฟส 5) — `overview` เขียนใหม่ในเฟส 1

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
8. **ทุกการ์ดที่อ่านข้อมูลต้องมี 4 สถานะ ไม่ใช่แค่ตอนมีข้อมูล** — มีข้อมูล ·
   ยังไม่ตั้ง credential (การ์ด Google ว่างพร้อมบอกวิธีตั้ง ส่วนการ์ด
   Postgres ยังใช้ได้) · cron รอบล่าสุดล้มเหลว (แสดงข้อมูลรอบล่าสุดที่
   สำเร็จ + สาเหตุ + ปุ่มรันใหม่) · DB ออฟไลน์ (`isDatabaseOffline`)
   ก่อนถึงเฟส 4 หน้าภาพรวมจะว่างครึ่งหน้า ซึ่งต้องดูตั้งใจ ไม่ใช่ดูพัง
   mockup มีตัวจำลองสถานะมุมขวาบนให้ดูครบทั้ง 4 แบบ

---

## 3. รายละเอียดแต่ละเฟส

### เฟส 1 — On-Page Audit Engine (~4 วัน)

**เป้าหมาย:** ตอบได้ว่าหน้าไหนของเว็บขาดอะไร และพาไปแก้ได้ในคลิกเดียว โดยไม่ต้องถาม Google

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
  — เก็บ**ค่าล่าสุด**เท่านั้น
- Prisma: model `SeoAuditRun` (runAt, urlCount, avgScore, passAllCount,
  failCountByRule Json) — snapshot หนึ่งแถวต่อรอบ ตัวเลข "▲ 4 จากรอบก่อน"
  และกราฟคะแนนย้อนหลังต้องมีตารางนี้ ถ้าไม่มีก็ต้องตัดตัวเลขเทียบออก
  เพราะ `SeoUrlState` เขียนทับทุกรอบ
- Prisma: model `SeoRuleWaiver` (url, ruleKey, reason, createdById, createdAt)
  สำหรับหน้าที่ตั้งใจไม่ผ่านกฎ (เช่น หน้านโยบายที่สั้นโดยธรรมชาติ)
  ต้องใส่เหตุผล และเขียนลงบันทึกกิจกรรม — ไม่งั้นหน้าเหล่านี้จะแดงตลอดไป
  จนคนเลิกดู
- กฎ `internal-links` อ่านผลจาก `lib/admin/link-graph.ts` ที่ tab `links`
  ใช้อยู่แล้ว ไม่สแกนเอง
- `/api/cron/seo-audit` + `lib/seo/cron-auth.ts` ตรวจ `CRON_SECRET`
- เขียน `(growth)/seo/page.tsx` ใหม่เป็นภาพรวม + เพิ่ม tab `audit` —
  tab keywords / links / urls / defaults เดิมอยู่ที่เดิม
- ตาราง audit: กดกฎแล้วกรองตาราง · แต่ละแถวมีลิงก์ "แก้ไข ↗" ไปหน้าแก้ไข
  ของ entity นั้นใน admin พร้อมเลือกภาษาไว้ให้ · ปุ่ม "ยกเว้น" — หน้าจอ
  ต้องพาไปแก้ได้ในคลิกเดียว ไม่ใช่แค่บอกว่าผิด
- ปุ่มส่งออก "รายการที่ขาด" เป็น CSV ด้วย `lib/csv.ts` ที่มีอยู่
- env: `CRON_SECRET`

**เสร็จเมื่อ:** เปิด `/admin/seo` แล้วเห็นคะแนนของ 372 URL, กดส่งออก CSV
ได้ไฟล์ที่ส่งให้นักแปลได้ทันที, cron รันครบสองรอบแล้วเห็นกราฟคะแนน
ย้อนหลังจาก `SeoAuditRun`, `npm run verify` เขียว, มี unit test ครบทุกกฎ
รวมถึง case ที่ URL ถูกยกเว้น

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
- Prisma: model `WebVital` + `enum VitalMetric { LCP INP CLS TTFB }`
  — **TTFB ต้องมีตั้งแต่แรก** เพราะหัวข้อ 4 ใช้มันวัดว่า `proxy.ts` ของ
  เฟส 5 ทำให้ทุก request ช้าลงไหม ถ้าไม่เก็บตั้งแต่เฟส 2 จะไม่มีเส้นฐาน
  ให้เทียบ
- `/api/cron/vitals-rollup` สรุป p75 รายวัน ลบ raw ที่เกิน 30 วัน
- tab "Core Web Vitals" ใน `(growth)/analytics` — กำกับสถานะเป็นข้อความ
  (ดี / ต้องปรับ / แย่) ไม่ใช้จุดสีอย่างเดียว · route ที่มีตัวอย่างไม่ถึง
  200 ครั้งในช่วงที่เลือกแสดง "ตัวอย่างไม่พอ" แทน p75 (p75 จากไม่กี่สิบ
  ครั้งแกว่งจนอ่านไม่ได้) · บอกด้วยว่าข้อมูลมาจากเฉพาะผู้ยินยอม analytics
  cookie กี่ %
- กราฟ p75 รายวันมีหมุดวัน deploy (อ่าน commit sha จาก build ที่ส่งมากับ
  beacon) — "LCP พุ่งหลัง deploy a41f2c" ควรเห็นเองจากกราฟ ไม่ใช่ให้คนเดา

**ระวัง:** p75 คำนวณตอน rollup ไม่ใช่ตอนเปิดหน้า — percentile บนตารางดิบ
ที่โตวันละหลักหมื่นแถวจะทำให้หน้า admin ช้าลงเรื่อย ๆ แบบที่ไม่มีใครสังเกต
จนสายเกินไป

**เสร็จเมื่อ:** เปิดเว็บจริงจากมือถือแล้วเห็นแถวเข้า `WebVital` ภายในไม่กี่วินาที,
tab แสดง p75 ต่อ route ได้ และ**จดเส้นฐาน TTFB ไว้ก่อนเริ่มเฟส 5**

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
- tab "เรียลไทม์" ใน `(growth)/analytics` — poll ทุก 20 วินาที ฟีด
  ความเคลื่อนไหวแสดงเฉพาะสิ่งที่ `LiveVisit` รู้จริง (เข้า / เปลี่ยนหน้า /
  หายไป) — mockup รอบแรกมี "ส่งฟอร์มติดต่อ" ซึ่งตารางนี้ไม่ได้เก็บ
- **ฝากงานให้เฟส 6:** ตอนขยาย `PageViewBeacon` ให้เก็บ landing path กับ
  referrer ของการเข้าครั้งแรกใน `sessionStorage` ไว้ด้วย (ดูเฟส 6
  "การผูก lead") — ทำตรงนี้เพราะแตะไฟล์เดียวกัน และยิ่งเริ่มเก็บเร็ว
  รายงานเฟส 6 ยิ่งมีข้อมูลย้อนหลัง
- (ทางเลือก) GA4 Realtime สำหรับประเทศ/เมือง ซึ่งเราเดาเองไม่ได้ถ้าไม่เก็บ IP

**เสร็จเมื่อ:** เปิดเว็บสองแท็บแล้วตัวเลขขึ้นเป็น 2 ภายใน 20 วินาที

---

### เฟส 4 — Google APIs (~5 วัน) · **ต้องมี credential**

**เป้าหมาย:** คำค้น อันดับ ประเทศ และ "คำนี้ติดจากหน้าไหน" แบบ Search Console
— โดยเติมเข้า tab `keywords` ที่มีอยู่ ไม่สร้างหน้าคำค้นหน้าที่สอง

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
- `seo-search` เขียน `Keyword.currentRank` / `previousRank` /
  `rankCheckedAt` / `trend` จาก `SeoQueryStat` ให้คำที่อยู่ในคลัง — อันดับ
  ในระบบจะมาจากแหล่งเดียว
- tab `keywords` เดิมได้ 3 มุมมอง:
  - **ติดตามอยู่** — คลังเดิม + คอลัมน์คลิก / การแสดงผล / CTR / อันดับจริง
    แถวกดขยายดู page / country / device, cannibalization ใช้ข้อมูลจริง
    ว่าหน้าไหนได้คลิกเท่าไร
  - **ไม่ได้ติดตาม** — คำที่ Google ส่งคนมาแต่ยังไม่อยู่ในคลัง พร้อมปุ่ม
    "+ ติดตาม"
  - **โอกาส** — อันดับ 5–15, การแสดงผล ≥ 1,000, CTR ต่ำกว่าค่ากลางของคำ
    อันดับใกล้กันในเว็บเราเอง เรียงตาม "คลิกที่ได้เพิ่มถ้า CTR ถึงค่ากลาง"
    พร้อมสิ่งที่แก้ได้จากผล audit ของหน้านั้น (เชื่อมกับเฟส 1)
- **แยกแบรนด์ / ไม่ใช่แบรนด์** ทุกที่ที่แสดงคลิก — คำอย่าง "trinity
  village" ดันตัวเลขให้ดูดีเกินจริง คนที่หาเราเจอจริง ๆ คือกลุ่มไม่ใช่
  แบรนด์ รายการคำแบรนด์ (`brandTerms String[]`) ตั้งใน tab `defaults`
  จับด้วย contains แบบไม่สนตัวพิมพ์ ต้องใส่ทุกภาษาที่ใช้เรียกโครงการ
- env: `GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`, `GSC_SITE_URL`,
  `GA4_PROPERTY_ID`, `PAGESPEED_API_KEY`

**เสร็จเมื่อ:** `npm run seo:check` เขียวทุกบรรทัด, tab `keywords` มีข้อมูลจริง
ย้อนหลัง 28 วันทั้ง 3 มุมมอง และ `Keyword.currentRank` ไม่ต้องกรอกมือแล้ว

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
  และปุ่ม "ตั้ง redirect ↗" ที่เปิด tab `urls` พร้อมกรอก path ไว้ให้ —
  ไม่สร้างฟอร์ม redirect ชุดที่สอง
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
- เพิ่ม `reports` หนึ่งแถวใน `ADMIN_NAV` **กลุ่ม growth** (ดูหัวข้อ 1)
- **"สิ่งที่ควรทำ" แก้ได้ก่อนส่ง** — ระบบร่างจากผล audit / โอกาส / CWV
  แต่ทีมแก้ข้อความได้ในหน้ารายงาน เก็บใน model `ReportNote` (period,
  audience, locale, body, updatedById, updatedAt) ถ้าถึงวันส่งแล้วยังไม่มี
  ใครแก้ ให้ส่งฉบับร่างพร้อมป้าย "ร่างอัตโนมัติ" ไม่ส่งเงียบ ๆ ราวกับคน
  เขียนเอง
- **แจ้งเตือน** — `lib/seo/alerts.ts` เช็กหลัง cron แต่ละรอบ ส่งอีเมล
  ผ่าน `lib/email.ts` และเขียนลง `SeoAlert` (kind, message, payload Json,
  createdAt) ให้การ์ด "แจ้งเตือน" ในหน้าภาพรวม SEO อ่าน กฎเริ่มต้น:
  index ลดลง > 3 URL/วัน · path เดียวโดน 404 > 50 ครั้ง/วัน · p75 หลุด
  เกณฑ์ "ดี" ภายใน 48 ชม. หลัง deploy · คลิกลดลง > 25% เทียบสัปดาห์ก่อน ·
  cron ล้มเหลว เปิดปิดแต่ละกฎได้จากหน้ารายงาน

**ตัวเลขที่สำคัญที่สุดของรายงาน** คือการ join Search Console เข้ากับ
`LeadInquiry` ผ่าน `lib/reports.ts` — "โครงการนี้คนเข้าจาก Google 1,284
ครั้ง ได้ผู้สนใจที่มาจาก Google 6 ราย" รายงาน SEO ที่ไม่ผูกกับ lead คือ
รายงานที่อ่านจบแล้วไม่รู้จะทำอะไรต่อ

**การผูก lead — ต้องไม่หารข้ามฐาน** รอบแรกเอาคลิกจาก Google ไปเทียบกับ
lead **ทุกช่องทาง** (11 ราย รวม LINE OA, referral, walk-in) อัตราที่ได้
จึงไม่มีความหมาย ต้องนับเฉพาะ lead ที่มาจาก Google จริง ซึ่งข้อมูลตอนนี้
**ยังบอกไม่ได้**:

- `LeadSource` มีแค่ PROJECT_PAGE / CONTACT_PAGE / … / OTHER ไม่มีค่าไหน
  บอกว่ามาจาก search
- `sourcePath` คือหน้าที่**กดส่งฟอร์ม** ไม่ใช่หน้าที่เข้ามาครั้งแรก —
  คนเข้าจาก Google ที่หน้าบทความแล้วไปกรอกที่ `/contact` จะถูกนับเป็น
  `/contact`
- `utmSource` / `utmMedium` มีเฉพาะคนที่มาจากลิงก์ติด utm ซึ่ง organic
  search ไม่มี

จึงเพิ่มสองคอลัมน์ใน `LeadInquiry`: `landingPath String?` และ
`landingReferrer String?` (เก็บแค่ host เช่น `www.google.co.th`)
`PageViewBeacon` จดค่าของการเข้าครั้งแรกไว้ใน `sessionStorage` (งานนี้
ทำพร้อมเฟส 3) และ `LeadForm` ส่งไปพร้อมฟอร์ม เหมือนที่ส่ง utm อยู่แล้ว
"มาจาก Google" = referrer host เป็น google.* และไม่มี `utmMedium`
แล้ว map `landingPath` ไปหาโครงการ

รายงานแสดงสองคอลัมน์คู่กัน: "ผู้สนใจจาก Google" (ใช้คิดอัตรา) กับ
"ผู้สนใจทุกช่องทาง" (ดูภาพรวม) — **ไม่ backfill ได้** lead เก่าก่อน deploy
คอลัมน์นี้จะไม่มี landing ต้องเขียนในรายงานว่านับตั้งแต่วันไหน

---

## 4. ความเสี่ยงที่ประเมินไว้

| ความเสี่ยง | เฟส | ทางรับมือ |
|---|---|---|
| ตาราง `PathHitDay` / `LiveVisit` โตเร็วกว่าที่คิดเมื่อเลิกจำกัดแค่ `/news/` | 3 | rollup รายวัน + ลบ raw เกิน 30 วัน วัดขนาดตารางหลังสัปดาห์แรก |
| โควตา URL Inspection 2,000/วัน ตันเมื่อเว็บโตเกิน 2,000 URL | 4 | เขียน scheduler แบบสุ่มตามรอบตั้งแต่แรก ไม่ใช่กวาดทั้งหมดเสมอ |
| `proxy.ts` เขียน DB ทำให้ทุก request ช้าลง | 5 | fire-and-forget + buffer, วัด TTFB ก่อน/หลังด้วยเฟส 2 ที่ทำไว้แล้ว |
| i18n 4 ภาษาบวมจนคนข้าม | ทุกเฟส | เขียน key ตอนเขียนหน้า ไม่ใช่ตอนท้าย `tests/i18n.test.ts` จับให้อยู่แล้ว |
| ข้อมูล Google หน่วง 2–3 วัน ทำให้คนคิดว่าระบบพัง | 4, 6 | เขียน "ข้อมูลถึงวันที่ ..." บนหน้าจอและในรายงานทุกฉบับ |
| อัตรา lead จาก Google มีข้อมูลน้อยในเดือนแรก เพราะ `landingReferrer` เริ่มเก็บตอน deploy | 3, 6 | ทำ landing capture พร้อมเฟส 3 ไม่ใช่รอเฟส 6 · รายงานเขียนว่านับตั้งแต่วันไหน |
| ตั้งคำแบรนด์ไม่ครบทุกภาษา ตัวเลข "ไม่ใช่แบรนด์" จึงสูงเกินจริง | 4 | หน้า `defaults` แสดงคำที่มีชื่อโครงการแต่ยังไม่ถูกจับเป็นแบรนด์ให้ดู |
| ปุ่ม "ยกเว้นกฎ" ถูกใช้ปิดปัญหาจริง | 1 | ต้องใส่เหตุผล · ลงบันทึกกิจกรรม · การ์ด audit แสดงจำนวนที่ยกเว้นไว้เสมอ |

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
- **แต่ landing capture ของเฟส 6 ต้องไปกับเฟส 3 เสมอ** (สองคอลัมน์ใน
  `LeadInquiry` + การจดใน `PageViewBeacon`) ไม่ว่าเฟส 6 จะทำเมื่อไร
  เพราะข้อมูลนี้ย้อนหลังไม่ได้

---

## 6. ประวัติการแก้

### รอบ 2 — 2026-09-25 (จาก review mockup)

| # | เปลี่ยนอะไร | หัวข้อ |
|---|---|---|
| 1 | เฟส 4 เติมข้อมูลเข้า tab `keywords` เดิม ไม่สร้าง tab "คำค้น & หน้าเว็บ" ใหม่ + ตาราง tab เดิมที่ห้ามทำซ้ำ | 1, เฟส 4 |
| 2 | `reports` อยู่กลุ่ม growth ไม่ใช่ administration | 1, เฟส 6 |
| 3 | เพิ่ม `SeoAuditRun` (ประวัติคะแนน) และ `SeoRuleWaiver` (ยกเว้นกฎ) | เฟส 1 |
| 4 | กฎข้อ 8: ทุกการ์ดต้องมี 4 สถานะ | 2 |
| 5 | การผูก lead นับเฉพาะที่มาจาก Google — เพิ่ม `landingPath` / `landingReferrer` เพราะ `sourcePath` คือหน้าที่ส่งฟอร์ม และ `LeadSource` ไม่มีค่า organic | เฟส 3, เฟส 6 |
| 6 | ฟีดเรียลไทม์แสดงเฉพาะสิ่งที่ `LiveVisit` เก็บ | เฟส 3 |
| 7 | CWV กำกับสถานะเป็นข้อความ + ตัวอย่างขั้นต่ำ 200 | เฟส 2 |
| 8 | เพิ่ม TTFB ใน `VitalMetric` เป็นเส้นฐานให้เฟส 5 | เฟส 2 |
| 9 | แยกคำค้นแบรนด์ / ไม่ใช่แบรนด์ (`brandTerms` ใน `defaults`) | เฟส 4 |
| 10 | มุมมอง "โอกาส" | เฟส 4 |
| 11 | audit กรองตามกฎ + ลิงก์ไปหน้าแก้ไข + ปุ่มยกเว้น; กฎลิงก์เสียอ่านจาก link-graph | เฟส 1 |
| 12 | หมุด deploy บนกราฟ | เฟส 2 |
| 13 | "สิ่งที่ควรทำ" แก้ได้ก่อนส่ง (`ReportNote`) | เฟส 6 |
| 14 | กฎแจ้งเตือน + `SeoAlert` + การ์ดในภาพรวม | เฟส 6 |
| — | ประมาณการรวม 19 → 21 วัน (เฟส 1 +1, เฟส 6 +1) และความเสี่ยงเพิ่ม 3 ข้อ | 0, 4 |
