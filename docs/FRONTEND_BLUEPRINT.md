# Front-end Blueprint v1

แผนออกแบบระบบ front-end ใหม่ทั้งชุดของ `app/[locale]/(site)`
เขียนจากการอ่านโค้ดจริง — ไม่ใช่แม่แบบทั่วไป · 8 ก.ย. 2026

> เอกสารฉบับอ่านง่าย (มี wireframe รายหน้า) เผยแพร่เป็น Artifact แล้ว
> ไฟล์นี้คือฉบับที่ใช้อ้างอิงตอนเขียนโค้ด

---

## 0. สิ่งที่ต้องรักษาไว้ ห้ามรื้อ

- URL state ของ `ProjectFilterBar` (back button + แชร์ลิงก์ได้ + SSR ตรงตั้งแต่เฟรมแรก)
- `FaqAccordion` ที่ใช้ `<details>` ไม่มี JS เลย
- `ImageWithSkeleton` ที่ครอบ `next/image` ทั้งเว็บ (ไม่มี `<img>` ดิบสักตัว)
- การคำนวณ contrast ของ hero scrim ใน `globals.css`
- `releasedForSale` ที่กรองฝั่ง server
- `localizedAlternates` / hreflang / canonical ที่ครบทุกหน้า
- กฎ "ซ่อน section เมื่อไม่มีข้อมูล" ในหน้าแรก

## 1. ปัญหาที่วัดได้จากโค้ด

| # | ปัญหา | หลักฐาน |
|---|---|---|
| 1 | ทุกหน้าเต้นจังหวะเดียว `eyebrow → h2 → grid` | ไม่มี full-bleed / asymmetry / dark band เป็นระบบ |
| 2 | Scale ไม่มีสัญญา | `py-20`×31 `py-28`×21 `py-24`×8 `py-16`×7 `py-14`×7 · `text-3xl`×39 `text-4xl`×39 |
| 3 | สีหลุด token | `Navbar.tsx:409,487` · `SalesTeamSection.tsx:142` · `contact/page.tsx:209,212,224` · `(site)/page.tsx:492,498,503,514` (`#E2AD7F` ×4 ในไฟล์เดียว) |
| 4 | หน้าโครงการ 1,026 บรรทัด ไม่มีชั้นปิดการขาย | ไม่มี sticky enquiry / breadcrumb UI / related / share |
| 5 | หลังบ้านมีของที่หน้าบ้านไม่ใช้ | `Appointment` มี workflow ครบใน admin แต่ไม่มีหน้า public |
| 6 | Component ปนกันชั้นเดียว | 35 ไฟล์แบน · 22 client · framer-motion ใน 10 ไฟล์ · `VisionMissionMosaic.tsx` = dead code |

## 2. หลักการหกข้อ

1. **ภาพนำ อินเทอร์เฟซถอย** — ค่าเริ่มต้นคือ ไม่มีเงา ไม่มีมุมมน มีแค่เส้นขน 1px
2. **จังหวะแบบนิตยสาร** — archetype 5 แบบ ห้ามซ้ำติดกัน ทุกหน้าต้องมี full-bleed ≥1 และ dark band ≥1
3. **เส้นแทนเงา** — เงาสงวนให้ของที่ลอยจริงเท่านั้น
4. **ลำดับตัวอักษรเป็นสัญญา** — 8 ขั้น ห้ามใช้ `text-3xl` ตรง ๆ ใน page
5. **การเคลื่อนไหวต้องหนัก** — ease-out ยาว ไม่ใช่ spring · hover zoom ≤ 1.04 / 900ms
6. **ชั้นปิดการขายลอยแยก** — rail ขวา (desktop) / bar ล่าง (mobile) ไม่แทรกเนื้อหา

## 3. Design tokens

ประกาศเป็น CSS custom properties ใน `app/globals.css` แล้วให้ `tailwind.config.ts`
อ่านค่าจาก variable แทนการฮาร์ดโค้ด hex

### 3.1 สี (semantic layer)

```
--band            #083551   navy หลัก
--band-deep       #041D2C   footer, overlay
--band-soft       #123A50   เส้นบนพื้นเข้ม
--accent-fill     #E8B384   ปุ่ม ไอคอน (ห้ามใช้กับตัวอักษรเล็ก)
--accent-ink      #9C602C   ตัวอักษร AA บนพื้นสว่าง (พื้นต่ำสุด)
--accent-ink-hi   #7A4A20   hover / active
--surface         #F9F9FA   พื้นหน้า
--surface-raised  #FFFFFF   การ์ด
--surface-sunk    #F0F1F3   section สลับ
--ink             #0D2635   เนื้อความ
--ink-muted       #516573   คำอธิบาย
--channel-wa      #25D366   WhatsApp เท่านั้น (ผ่าน Button variant="channel")
```

กลุ่มที่ยังไม่มีชื่อวันนี้ ต้องเพิ่ม:
- `--line-hairline` / `--line` / `--line-strong` = navy ที่ 10% / 16% / 28%
- `--status-available` / `--status-reserved` / `--status-sold` (ผังโครงการ)
- `--scrim-corner` / `--scrim-ramp` (ย้ายค่าที่คำนวณแล้วใน `globals.css` ขึ้นมา)
- `--ring` (focus ring)

### 3.2 มาตราส่วนตัวอักษร

| Token | ขนาด | lh | ls | w |
|---|---|---|---|---|
| `display-1` | clamp(2.75rem, 1.6rem + 4.4vw, 5rem) | 1.02 | −0.022em | 300 |
| `display-2` | clamp(2.25rem, 1.5rem + 2.8vw, 3.5rem) | 1.06 | −0.018em | 200 |
| `heading-1` | clamp(1.875rem, 1.4rem + 1.8vw, 2.75rem) | 1.12 | −0.015em | 300 |
| `heading-2` | 1.25rem → 1.5rem | 1.25 | 0 | 400 |
| `body-lg` | 1.0625rem | 1.75 | 0 | 300 |
| `body` | 0.9375rem | 1.70 | 0 | 300 |
| `data` | 0.8125rem | 1.5 | 0 | 400 · tabular-nums |
| `eyebrow-latin` | 0.6875rem | 1 | 0.28em | 500 · uppercase |
| `eyebrow-thai` | 0.8125rem | 1 | 0.12em | 500 · **ไม่** uppercase |

**กฎภาษาไทย** — บวก line-height 0.1 · ห้าม letter-spacing ติดลบ (สระลอยชนกัน) ·
ห้าม uppercase · `font-light` ของ FC Vision บางกว่า Roboto จึงต้องขยับขึ้นหนึ่งน้ำหนักบนพื้นเข้ม

### 3.3 ระยะและกริด

| Token | มือถือ | เดสก์ท็อป | ใช้กับ |
|---|---|---|---|
| `--space-section-sm` | 56 | 72 | แถบสถิติ, filter bar, breadcrumb, strip |
| `--space-section-md` | 88 | 120 | ค่าเริ่มต้นทุก section |
| `--space-section-lg` | 120 | 176 | feature / dark band · ≤2 ครั้งต่อหน้า |
| `--width-max` | 1440 | | ขอบนอกสุด (เดิม `max-w-container`) |
| `--width-content` | 1120 | | กริดการ์ด ฟอร์ม ตาราง |
| `--width-prose` | 680 | | บทความ FAQ กฎหมาย (~65ch) |
| `--gutter` | 20 | 32 / 48 | คงค่าเดิมของ `container-luxe` |

> หลังจากนี้ **ห้ามเขียน `py-*` บน `<section>`** — ผ่าน `<Section spacing="sm|md|lg">` เท่านั้น

### 3.4 ขอบ เงา จังหวะ

```
--radius-none 0        ค่าเริ่มต้นของทุกอย่าง
--radius-sm   2px      การ์ด ปุ่ม อินพุต
--radius-pill          เฉพาะ chip ตัวกรอง

เงา 3 ระดับ: flat (default) · card (การ์ดกดได้ตอน hover) · float (lightbox/dropdown/sheet)
ห้ามใช้ shadow-card เป็นของประดับ section

--ease-luxe   cubic-bezier(.16, 1, .3, 1)
--dur-fast 180 · --dur-base 320 · --dur-slow 600 · --dur-reveal 900
reveal stagger 80ms · เล่นครั้งเดียว · hover zoom ≤ 1.04 / 900ms
```

## 4. สถาปัตยกรรม component

**กฎเดียวที่บังคับทิศทาง: ชั้นล่างห้ามรู้จักชั้นบน**

```
components/
  ui/         primitive ไม่ผูก domain · ที่เดียวที่ import framer-motion ได้
  blocks/     รูปแบบใช้ซ้ำ ประกอบจาก ui/ · รับ prop ไม่ fetch เอง
  sections/   section เต็มความกว้าง · server component · fetch ได้
  forms/      client เท่านั้น · react-hook-form + zod
  admin/      คงเดิม ไม่แตะรอบนี้
```

**ui/** — `Container · Section · Stack · Eyebrow · Heading · Prose · Button · LinkArrow ·
Media · Chip · Badge · Divider · Field · Select · Accordion · Tabs · Dialog · Sheet ·
Scroller · Reveal · Skeleton`

`Button` มี 5 variant: `solid · outline · ghost · glass (บนภาพ) · channel (WhatsApp/โทร)`
— รวม `.btn-primary` `.btn-outline` `.btn-hero` และ hex ที่กระจายอยู่ 4 ไฟล์

**blocks/** — `SectionHeader · ProjectCard · ArticleCard · EventCard · BrochureCard ·
StatBar · SplitFeature · FullBleedFeature · PullQuote · Breadcrumbs · ShareRow ·
RelatedGrid · EnquiryRail · ContactChannels · PageHeader · EmptyState · Pagination`

`ProjectCard` มี 3 variant: `hero` (การ์ดใหญ่หน้าแรก) · `standard` (กริดหน้ารายการ) ·
`compact` (แถวโครงการใกล้เคียง) — สืบทอดจาก `FeaturedProjectCard` เดิม

### Section archetype 5 แบบ — ห้ามวางแบบเดียวกันติดกัน

| Archetype | โครง | ใช้เมื่อ |
|---|---|---|
| **Full-bleed** | ชนขอบจอ ไม่มี container | hero, ผังโครงการ, gallery, แผนที่ |
| **Split** | ภาพ 55–60 / ข้อความ 40–45 สลับด้าน | แนวคิดโครงการ, เรื่องราวบริษัท, event |
| **Grid** | 2–4 คอลัมน์เท่ากัน | รายการโครงการ, ข่าว, สิ่งอำนวยความสะดวก |
| **Scroller** | เลื่อนแนวนอน บลีดขอบขวา | รางวัล, หมุดหมาย, ความคืบหน้า |
| **Band** | พื้นเข้มเต็มความกว้าง เนื้อหากลาง | วิสัยทัศน์, CTA ปิดหน้า, 404 |

> **บังคับด้วยโค้ด ไม่ใช่ด้วยรีวิว** — ให้ `lib/home-sections.ts` เก็บ archetype ของแต่ละ key
> แล้วให้ renderer สลับพื้นหลัง (surface ↔ sunk ↔ band) อัตโนมัติเมื่อเจอ archetype ซ้ำติดกัน
> แอดมินจึงจัดลำดับผิดจนหน้าแบนไม่ได้

## 5. Global chrome

### Navbar (client · 3 สถานะ · 88px → 68px)
- **A** โปร่งใสทับ hero (หน้าแรก + หน้าโครงการ) — วันนี้ทึบตลอด กินพื้นที่ภาพ 88px ทันที
- **B** ทึบเมื่อเลื่อนพ้น hero — CSS + IntersectionObserver **ไม่ใช้ framer-motion**
- **C** Mega menu "โครงการ" — 3 โครงการล่าสุดพร้อมภาพ + ดูทั้งหมด + ทางลัดผัง/e-brochure
- **D** แถบขวา — ภาษา (TH/EN/中文/RU ไม่ใช่ธง) + โทร + **CTA "นัดชมโครงการ"**
- **E** Sheet เต็มจอบนมือถือ — ย้าย focus trap เดิมไปอยู่ใน `ui/Sheet`
- ยุบเมนู 7 รายการเหลือ 5 พร้อมเมนูย่อย · ดึง `/achievements` ขึ้นจาก `nav.secondary`

### Footer (server · band-deep)
แถบรางวัล → 4 คอลัมน์ (โครงการ / บริษัท / ทรัพยากร / ติดต่อ) → **รับข่าวโครงการใหม่**
(อีเมลช่องเดียว → `LeadInquiry` source ใหม่) → แถวกฎหมาย

### EnquiryRail (ใหม่ทั้งชิ้น)
- **Desktop** rail ขวา 300px ติดหนึบ โผล่หลังผ่าน hero: ชื่อโครงการ · สถานะ ·
  นัดชม · ขอ e-brochure · WhatsApp · เซลส์ที่ดูแล
- **Mobile** แถบล่าง 64px สองปุ่ม · ซ่อนเมื่อฟอร์มท้ายหน้าเข้าจอ

### SalesTeamSection
วันนี้ mount ทุกหน้าใน `(site)/layout.tsx` — **จำกัดให้เหลือ `/about`, `/contact`,
`/projects/[slug]`** (ทีมขายท้ายหน้านโยบายความเป็นส่วนตัวไม่ได้ช่วยอะไร)

## 6. พิมพ์เขียวรายหน้า

### `/` หน้าแรก — KPI: click ไปหน้าโครงการ
1. Hero carousel — **88vh ไม่ใช่ 100vh** · Navbar โปร่งทับ · CTA เดียว + scroll cue
2. **[ใหม่]** แถบความน่าเชื่อถือ `section-sm` — ปีก่อตั้ง · โครงการ · ยูนิตส่งมอบ · รางวัล
3. โครงการเด่น — **เปลี่ยนจากกริด 3 เท่ากัน เป็นการ์ดใหญ่ 1 + ซ้อน 2**
4. แนะนำบริษัท — Split ภาพบลีดชนขอบซ้าย
5. วิสัยทัศน์ — Band `section-lg` (จุดพักสายตาแรก)
6. ทำไมต้องเรา — 4 ช่องเส้นขน บีบเป็น `section-sm`
7. รางวัล — Scroller บนพื้น sunk
8. กิจกรรมถัดไป — Split (ซ่อนเองเมื่อว่าง)
9. ข่าวล่าสุด — Grid 3
10. FAQ — prose 680 · เป็นเจ้าของ FAQPage schema ของทั้งเว็บ
11. CTA ปิดหน้า — Band · **ถอด `#E2AD7F` 4 จุดไปใช้ token**

### `/projects/[slug]` หน้าที่ทำเงิน — KPI: lead ต่อผู้ชม
0. **[ใหม่]** Breadcrumb ที่มองเห็นได้ (วันนี้เป็น JSON-LD อย่างเดียว)
1. Hero 88vh · display-1 · ที่ตั้ง + สถานะเป็น chip · รองรับ `heroMediaType` VIDEO
2. แถบข้อมูลสำคัญ เกยขึ้น −56px — ประเภท · พื้นที่ · ยูนิต · สถานะ · **ยูนิตว่าง** · ปีแล้วเสร็จ
3. **[ใหม่]** แถบนำทางในหน้า ติดหนึบ — `id` มีอยู่แล้ว (`#unit-types #site-plan #progress #enquire`)
4. แนวคิดและการออกแบบ — Split · แสดง `specialFeatures` ที่ยังไม่ได้ใช้เต็มที่
5. แกลเลอรี — Scroller full-bleed + lightbox (`<dialog>` + คีย์บอร์ด)
6. สิ่งอำนวยความสะดวก — สลับ card/scroller เมื่อเกิน 4 (กลไกเดิม ถูกต้อง)
7. แบบยูนิต — แท็บต่อประเภท · `FloorPlanViewer` lazy · ปุ่ม "สอบถามยูนิตแบบนี้" pre-fill ฟอร์ม
8. ผังโครงการ — full-bleed · **`next/dynamic` + `ssr:false` บังคับ** (599 บรรทัด + react-zoom-pan-pinch) · เพิ่ม legend + `viewLabel`/`facing` ใน tooltip
9. ความคืบหน้า — Scroller · lazy · เปอร์เซ็นต์เป็นเส้นบาง ไม่ใช่ progress bar หนา
10. ที่ตั้งและใกล้เคียง — Split แผนที่/รายการระยะทาง · ใช้ `latitude`/`longitude` ที่มีอยู่
11. แถบ e-brochure — ปก + เปิด/ดาวน์โหลด (เก็บอีเมลก่อนดาวน์โหลด)
12. FAQ โครงการ
13. **[ใหม่]** โครงการที่เกี่ยวข้อง — compact 3 ใบ (ทำเลเดียวกันก่อน แล้วค่อย propertyType)
14. ฟอร์ม + เซลส์ — Split · `LeadForm` เดิม ถอด framer-motion
15. **[ใหม่]** ชั้นลอย: EnquiryRail + ShareRow (Web Share API / copy link)

### `/projects` หน้ารายการ
1. **PageHeader ไม่ใช่ hero รูป** `section-sm` (วันนี้ `pt-28 sm:pt-36` คือช่องว่างเปล่า)
2. แถบตัวกรองติดใต้ Navbar — **คง URL state เดิมทั้งหมด**
3. **[ใหม่]** ช่องค้นหาข้อความ (ทั้งเว็บไม่มีช่องค้นหาเลยสักช่อง)
4. กริดผลลัพธ์ **2 คอลัมน์** ภาพ 3:2 (ไม่ใช่ 3 คอลัมน์เล็ก)
5. **[ใหม่]** มุมมองแผนที่ — รายการซ้าย แผนที่ขวา ปักหมุดทุกโครงการ
6. Empty state (มีอยู่แล้ว คงไว้) · 7. CTA band

### `/about`
PageHeader → **[ใหม่] คำกล่าวผู้ก่อตั้ง (pull quote)** → StatBar → เรื่องราว (Split) →
หมุดหมาย (Scroller + เส้นแกนเวลา) → วิสัยทัศน์ (Band, **ลบ `VisionMissionMosaic.tsx`**) →
ทีม → CTA

### `/news` + `/news/[slug]`
- **รายการ:** PageHeader + chip หมวด → **[ใหม่] บทความเด่นชิ้นเดียวเป็น Split** → Grid 3 + แบ่งหน้าแบบมีเลข
- **รายละเอียด:** Breadcrumb + บล็อกหัวเรื่อง (**ไม่ใช้ hero ภาพเต็มจอ**) → ภาพปก 16:9 กว้าง 1120 →
  เนื้อหา prose 680 (`ui/Prose` คุมสไตล์ `marked` + DOMPurify ที่เดียว) →
  **[ใหม่] แชร์ + บทความเกี่ยวข้อง + การ์ดโครงการที่ผูกอยู่**

### `/events` + `/events/[slug]`
- **รายการ:** PageHeader → กิจกรรมถัดไปการ์ดใหญ่ (นับถอยหลัง + ที่นั่งเหลือ + ลงทะเบียนตรง) →
  **กิจกรรมที่ผ่านมาเป็นรายการบรรทัด ไม่ใช่การ์ด**
- **รายละเอียด:** Hero split + `<dl>` + ปุ่ม .ics → ฟอร์ม RSVP ติดหนึบ rail ขวา
  (**สถานะเต็ม/ปิดรับต้องชัดก่อนกดส่ง**) → แผนที่

### `/progress`
PageHeader → chip เลือกโครงการ + % กำกับ → **[ใหม่] แถบสรุป** (% · อัปเดตล่าสุด · กำหนดส่งมอบ · จำนวนภาพ)
→ แกนเวลารายเดือน (`ProgressGallery` lazy) → **[ใหม่] รับแจ้งเตือนความคืบหน้า** (อีเมล → `LeadInquiry`)

### `/e-brochure` + `/e-brochure/[slug]`
- **รายการ:** PageHeader + กรองตามโครงการ → กริดปก 3:4 (ภาษา · จำนวนหน้า · ขนาดไฟล์)
- **รายละเอียด:** ตัวอ่านเต็มความสูง (**`next/dynamic` บังคับ** — 754 บรรทัด + pdfjs-dist) ·
  แถบเครื่องมือ หน้า/ซูม/เต็มจอ/ดาวน์โหลด/แชร์ → **[ใหม่] เก็บอีเมลก่อนดาวน์โหลด**
  (อ่านออนไลน์ฟรีเสมอ ยกเลิกได้) → EnquiryRail

### `/achievements`
PageHeader → **[ใหม่] รางวัลล่าสุดเป็น feature (Split)** → กริดจัดกลุ่มตามปี (หัวปีตัวเลขใหญ่จาง) →
หมุดหมาย → **[ใหม่] ดึงขึ้นมาอยู่ในเมนูย่อยใต้ "เกี่ยวกับเรา"**

### `/contact`
PageHeader `section-sm` (ให้ฟอร์มอยู่เหนือ fold) → Split ฟอร์ม 60 / ช่องทาง 40
(ทุกช่องทางเป็น `Button variant="channel"` เพื่อเก็บ `#25D366` ไว้ที่เดียว) →
การ์ดสำนักงานขาย (ที่อยู่ · เวลาทำการ · นำทาง · ภาพหน้าสำนักงาน) →
แผนที่ full-bleed (**โหลด iframe เมื่อกดเท่านั้น** — ดีทั้ง perf และ consent) → ทีมขาย

### Utility
- **กฎหมาย** — prose 680 + สารบัญติดหนึบ · วันที่แก้ไขล่าสุดชัดเจน · ลิงก์ตั้งค่าคุกกี้ในหน้า
- **`/login`** — การ์ดกลางจอ ไม่มี chrome การตลาด (อยู่นอก `(site)` แล้ว ถูกต้อง)
- **404** — Band สามทางออก · ยิง `/api/not-found` ที่มีอยู่แล้ว
- **`error.tsx`** — บอกว่าเกิดอะไรและทำอะไรต่อได้ ไม่ใช่ "Something went wrong"

### หน้าใหม่ที่เสนอเพิ่ม

| Route | ทำไม |
|---|---|
| `/book-a-viewing` | **คุ้มที่สุด** — `Appointment` มี workflow ครบใน admin แล้ว เป็นงาน front-end ล้วน ไม่ต้องแตะ schema · เปลี่ยน CTA หลักจาก "ส่งข้อความ" เป็น "นัดหมาย" |
| `/search` | ค้นข้ามโครงการ/ข่าว/กิจกรรม/brochure · Postgres full-text ผ่าน Prisma ไม่ต้องพึ่ง service ภายนอก |
| `/guides/[slug]` | คู่มือผู้ซื้อ — "ต่างชาติซื้อวิลล่าภูเก็ตอย่างไร" · "Leasehold vs Freehold" · "ค่าใช้จ่ายหลังโอน" · ทางเข้า SEO ที่หน้าโครงการทำแทนไม่ได้ |
| `/projects/[slug]/units` | ตารางยูนิตกรองได้ — ข้อมูลมีครบใน `ProjectUnit` แล้ว วันนี้เข้าถึงได้ทางผังโครงการทางเดียว ซึ่งบนมือถือใช้ยาก |

## 7. สถาปัตยกรรม conversion

| ขั้น | การกระทำ | แรงเสียดทาน | ปรากฏที่ |
|---|---|---|---|
| หลัก | นัดชมโครงการ | สูง (4 ช่อง + วัน) | Navbar ทุกหน้า · EnquiryRail · CTA ปิดหน้า · bar มือถือ |
| รอง | ขอ e-brochure / ราคา | กลาง (อีเมลช่องเดียว) | หน้าโครงการ · หน้า e-brochure · แถบใต้ hero |
| เบา | WhatsApp / โทร | ต่ำ (ไม่มีฟอร์ม) | Navbar · rail · footer · dock ลอย |
| เฉื่อย | รับข่าวสาร / แจ้งเตือนความคืบหน้า | ต่ำสุด | Footer · หน้าความคืบหน้า · ท้ายบทความ |

**กฎของฟอร์ม**
- ขั้นแรก ≤ 4 ช่อง — ชื่อ · ช่องทางติดต่อ · โครงการ · ข้อความ
- ช่องทางติดต่อช่องเดียว รับทั้งอีเมลและเบอร์ ตรวจชนิดอัตโนมัติ
- ข้อผิดพลาดขึ้นตอนออกจากช่อง ไม่ใช่ตอนกดส่ง
- สถานะสำเร็จอยู่ในที่เดิม + บอกว่าจะติดต่อกลับเมื่อไหร่ (ไม่ใช่ toast แล้วหาย)
- reCAPTCHA v3 คงเดิม · โครงการที่กำลังดูถูกเลือกไว้ล่วงหน้าเสมอ

**เหตุการณ์ที่ต้องเก็บ** (ผ่านชั้น consent ที่ `CookieConsentBanner` คุมอยู่แล้ว)
`view_project` · `open_site_plan` · `select_unit` · `open_brochure` · `download_brochure` ·
`start_enquiry` · `submit_enquiry` · `book_viewing` · `contact_channel`

## 8. งบประมาณ performance

วัดบน Android ระดับกลาง / 4G ที่ภูเก็ต — ไม่ใช่ MacBook ต่อไฟเบอร์

| ตัวชี้วัด | เป้า | เพดาน | หมายเหตุ |
|---|---|---|---|
| LCP | ≤ 2.0s | 2.5s | hero สไลด์แรกเท่านั้นที่ตั้ง `priority` |
| CLS | ≤ 0.03 | 0.05 | ทุกภาพมี aspect-ratio · ฟอนต์ `size-adjust` |
| INP | ≤ 150ms | 200ms | ผังโครงการ + flipbook คือจุดเสี่ยงหลัก |
| JS/route (gz) | ≤ 150KB | 180KB | หน้าโครงการ ≤ 220KB หลังแยก lazy chunk |
| ภาพในจอแรก | ≤ 4 | 6 | scroller ต้อง `loading="lazy"` ทั้งหมด |

**ลดทันที — ผลชัดที่สุด**
1. **ถอด framer-motion ออกจาก 4 ไฟล์** — `Navbar` `LeadForm` `EventRsvpForm` `ProjectsHero`
   (Navbar อยู่ทุกหน้า จึงคืนขนาดให้ทั้งเว็บ)
2. **เขียน `Reveal` ใหม่ด้วย IntersectionObserver + CSS** — ตัวนี้ใช้แทบทุก section
3. **`next/dynamic` สี่ตัวหนัก** — `SitePlanMap` (+react-zoom-pan-pinch) ·
   `EBrochureViewer` (+pdfjs-dist) · `ProgressGallery` · `FloorPlanViewer`
4. **ลบ `VisionMissionMosaic.tsx`** (dead code)

**ภาพและฟอนต์**
- `sizes` ที่ตรงกับกริดจริงทุกจุด — ค่าผิดคือสาเหตุอันดับ 1 ของ LCP ช้าบน Next.js
- AVIF ก่อน WebP ใน `next.config.js`
- Blur placeholder สำหรับ hero (shimmer คงไว้สำหรับกริด)
- FC Vision: subset ไทย + `font-display: swap` + preload เฉพาะ locale `th`
- Roboto: เฉพาะน้ำหนักที่มาตราส่วนใช้จริง (200/300/400/500)
- Google Maps โหลดเมื่อกดเท่านั้นทุกหน้า

> **บังคับด้วย CI** — เพิ่ม Lighthouse CI ใน `.github/workflows` ให้ล้มเมื่อเกินเพดานข้างบน
> งบประมาณที่ไม่มีอะไรบังคับ คือความตั้งใจ ไม่ใช่งบประมาณ

## 9. A11y และสี่ภาษา

**มีอยู่แล้ว ทำไว้ดี** — skip link · `focus-visible` ทั้งเว็บ · focus trap ใน Navbar ·
การคำนวณ contrast ของ scrim

**ที่ยังขาด**
- Lightbox ทุกตัวต้องเป็น `<dialog>` — focus trap · Esc · คืน focus ให้ปุ่มที่เปิด
- Carousel ต้องเดินด้วยลูกศรซ้ายขวา + มีปุ่มหยุดเล่นอัตโนมัติ
- ผังโครงการต้องมีทางเลือกเป็นตารางสำหรับคีย์บอร์ด/screen reader
- Scroller แนวนอนทุกตัวต้องเลื่อนด้วยคีย์บอร์ดได้
- `prefers-reduced-motion` ต้อง**หยุด**การเล่นอัตโนมัติของ hero ไม่ใช่แค่ลดเวลา

**สี่ภาษา**
- **ไทย** — บวก line-height · ห้าม uppercase · ห้าม ls ติดลบ · ห้ามตัดคำกลางคำ
- **รัสเซีย** — สตริงยาวกว่าอังกฤษ ~30% · ปุ่ม/chip ต้องยืดได้ ห้ามกำหนดความกว้างตายตัว
- **จีน** — สั้นกว่ามาก หัวข้อจัดกลางจะดูโหว่ · test ทุก PageHeader
- **อังกฤษ** — eyebrow uppercase ได้ ภาษาอื่นใช้ variant ธรรมดา
- ตัวเลข/วันที่/สกุลเงินผ่าน `Intl` เสมอ (`lib/format.ts` ทำไว้แล้ว)
- ตั้ง Playwright ให้ผ่าน `ru` อย่างน้อยหนึ่ง run เพื่อจับ layout ล้นก่อนขึ้นโปรดักชัน

## 10. แผน migration

ทีมสองคน · ทุกเฟสส่งของที่ขึ้นโปรดักชันได้จริง · ไม่มี branch ยักษ์

### P0 · ฐานราก — ไม่มีอะไรเปลี่ยนบนหน้าจอ (1–2 สัปดาห์)
- ประกาศ token ทั้งหมดใน `globals.css` → `tailwind.config.ts` อ่านจาก CSS variable
- สร้าง `components/ui/` ครบชุด · เขียน `Reveal` ใหม่ไม่ใช้ framer-motion
- กวาด hex ที่เขียนตรง ๆ ออกทั้งหมด (4 ไฟล์)
- ลบ `VisionMissionMosaic.tsx` · เพิ่ม lint rule ห้าม import framer-motion นอก `ui/`
- เพิ่ม Lighthouse CI พร้อมเพดานตามข้อ 8

**เสร็จเมื่อ** `npm run verify` ผ่าน · หน้าตาเหมือนเดิมทุกพิกเซล · bundle เล็กลงวัดได้

### P1 · Chrome — เห็นผลทุกหน้าพร้อมกัน (1 สัปดาห์)
- Navbar 3 สถานะ + mega menu + CTA "นัดชมโครงการ"
- Footer ใหม่ + แถบรางวัล + ช่องรับข่าวสาร
- `blocks/Breadcrumbs` · `blocks/PageHeader` · `blocks/EnquiryRail`
- ยุบเมนู 7 → 5 + เมนูย่อย · ดึง `/achievements` ขึ้นมา
- จำกัด `SalesTeamSection` ให้เหลือ 3 หน้า

### P2 · หน้าที่ทำเงิน (2–3 สัปดาห์)
- `/projects/[slug]` — แตก 1,026 บรรทัดเป็น `sections/project/*` · แถบนำทางในหน้า ·
  EnquiryRail · โครงการที่เกี่ยวข้อง · lazy 4 ตัวหนัก
- `/projects` — PageHeader · กริด 2 คอลัมน์ · ช่องค้นหา
- `/` — โครงการเด่นไม่สมมาตร · แถบความน่าเชื่อถือ · กฎสลับพื้นหลังใน `lib/home-sections.ts`

**เสร็จเมื่อ** LCP หน้าโครงการ ≤ 2.0s · e2e เดิมผ่านหมด · เทียบ lead ต่อผู้ชมก่อน/หลังได้

### P3 · หน้าเนื้อหาที่เหลือ (1–2 สัปดาห์)
`/about` `/achievements` `/news` `/events` `/progress` `/e-brochure` `/contact` ·
หน้ากฎหมาย `/login` 404 `error.tsx` · `ui/Prose` ตัวเดียวสำหรับ rich text ทั้งเว็บ

### P4 · พื้นผิวใหม่ (2 สัปดาห์)
`/book-a-viewing` (**ทำก่อนข้ออื่นในเฟสนี้**) · มุมมองแผนที่ · `/search` ·
`/projects/[slug]/units` · `/guides/[slug]`

## 11. Definition of done — ทุก PR ต้องผ่าน

- [ ] ไม่มีค่า hex / px / ms ที่เขียนตรง ๆ — ทุกค่ามาจาก token
- [ ] ไม่มี `py-*` บน `<section>` — ใช้ `<Section spacing>` เท่านั้น
- [ ] Section archetype ไม่ซ้ำกับตัวที่อยู่ติดกัน
- [ ] อ่านได้ครบ 4 ภาษา รวมรัสเซียที่สตริงยาวที่สุด
- [ ] เดินด้วยคีย์บอร์ดจนจบหน้าได้ โดยเห็น focus ตลอด
- [ ] เปิดด้วย `prefers-reduced-motion` แล้วยังใช้งานครบ ไม่มีอะไรเล่นอัตโนมัติ
- [ ] ทุกภาพมี `sizes` ตรงกับกริดจริง และมีสัดส่วนกำหนดไว้
- [ ] Client component ทุกตัวมีคอมเมนต์กำกับว่าทำไมต้องเป็น client
- [ ] สถานะว่างเปล่าและข้อผิดพลาดออกแบบไว้ ไม่ใช่ปล่อยว่าง
- [ ] Lighthouse CI ผ่านเพดาน LCP และขนาด bundle
- [ ] `npm run verify` ผ่าน (lint · typecheck · unit)
- [ ] Playwright e2e ชุดเดิมยังผ่านทั้งหมด

---

## ถ้ามีเวลาแค่สัปดาห์เดียว

ทำ **P0 ครึ่งแรก** (token + ถอด framer-motion ออกจาก Navbar) แล้วข้ามไป
**EnquiryRail บนหน้าโครงการ** อย่างเดียว

สองอย่างนี้คือจุดที่ผลตอบแทนต่อบรรทัดโค้ดสูงที่สุด — อย่างแรกทำให้ทั้งเว็บเบาลง
และเปลี่ยนสีได้ที่เดียว อย่างที่สองคือชั้นปิดการขายที่หายไป บนหน้าที่ทำเงินหน้าเดียวของเว็บนี้
