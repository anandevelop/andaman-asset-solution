# Implementation Prompt — News & Article Studio (andaman)

เอกสารนี้คือ **prompt สำหรับส่งให้ AI coding agent** (Claude Code / Cursor) ทำงานในรีโป `andaman`
คู่กับ mockup ที่ `Claude outputs/andaman-news-studio-mockup.html`

วิธีใช้: ส่ง **§0 บริบท** เป็นข้อความแรกเสมอ แล้วตามด้วย Phase ที่ต้องการทีละ Phase
(อย่าส่งทั้งไฟล์รวดเดียว — งานใหญ่เกินกว่าจะรีวิวได้ในรอบเดียว)

---

## §0 — บริบท (ส่งข้อความนี้ก่อนทุกครั้ง)

```text
เราจะยกเครื่องระบบหลังบ้าน "ข่าวสารและบทความ" ของโปรเจกต์นี้ให้เป็น
content studio เต็มรูปแบบสำหรับทำ SEO

อ่านก่อนเริ่ม ห้ามข้าม:
  - AGENTS.md  (กติกาของรีโปนี้ — โดยเฉพาะเรื่อง translation parity 4 ภาษา
    และ "npm run verify คือประตูสุดท้าย")
  - docs/HANDOFF.md
  - prisma/schema.prisma  → model NewsArticle, NewsArticleTranslation,
    Media, Redirect, ContentRevision, enum ContentStatus
  - components/admin/NewsForm.tsx, NewsTable.tsx, NewsFilters.tsx
  - app/[locale]/admin/(content)/news/actions.ts
  - lib/news.ts, lib/admin/news-list.ts
  - lib/markdown.ts, lib/content-links.ts, lib/content-revisions.ts,
    lib/seo-audit.ts, lib/seo-limits.ts, lib/slugify.ts
  - i18n.ts (locales = en/th/zh/ru, LOCALE_DISPLAY_ORDER = th/en/zh/ru)

แบบที่ต้องการ: เปิดไฟล์ "Claude outputs/andaman-news-studio-mockup.html"
ในเบราว์เซอร์ — นั่นคือ UI เป้าหมาย ใช้เป็น reference ของ layout, ลำดับ field
และ copy ภาษาไทยได้เลย (mockup ใช้ design token ชุดเดียวกับ app/globals.css แล้ว)

กติกาที่ใช้ตลอดทุก Phase:
  1. ใช้ primitive เดิมเท่านั้น: admin-card / admin-input / admin-label /
     admin-btn / admin-btn-ghost / admin-th / admin-td / admin-hint
     ห้ามสร้าง design token หรือ palette ใหม่
  2. ข้อความ UI ทุกคำผ่าน next-intl — เพิ่ม key ครบทั้ง 4 ไฟล์
     (messages/en|th|zh|ru.json) ในคอมมิตเดียวกัน ไม่งั้น tests/i18n.test.ts พัง
     และหน้าเว็บล่มตอน render ไม่ใช่ตอน build
  3. ทุกไฟล์ใหม่ต้องมี doc-comment หัวไฟล์สไตล์เดียวกับไฟล์รอบข้าง —
     อธิบาย "ทำไมถึงออกแบบแบบนี้" ไม่ใช่ "ไฟล์นี้ทำอะไร"
  4. Logic ที่คำนวณอะไรก็ตาม (คะแนน SEO, density, heading hierarchy)
     ต้องอยู่ในไฟล์ lib/ ที่ import ได้จากทั้ง server และ client
     (ห้ามใส่ "server-only" ถ้า client component ต้องใช้ — ดูเหตุผลใน
     lib/seo-limits.ts) และต้องมี unit test ใน tests/
  5. จบทุก Phase ด้วย `npm run verify` ต้องผ่าน ห้ามรายงานว่าเสร็จก่อนผ่าน
  6. ห้ามแก้ไฟล์นอกขอบเขตของ Phase นั้น ถ้าเจอว่าต้องแก้ ให้หยุดแล้วบอกก่อน

ตอบกลับด้วยแผนก่อนลงมือ: ไฟล์ที่จะสร้าง ไฟล์ที่จะแก้ และ migration ที่ต้องรัน
รอให้ฉันอนุมัติแล้วค่อยเขียนโค้ด
```

---

## §1 — Phase 1: Data model

```text
Phase 1 — ขยาย schema รองรับ content studio

1.1 NewsArticle — เพิ่ม field
  - contentFormat  enum ArticleFormat { MARKDOWN, HTML }  @default(MARKDOWN)
    เหตุผล: บทความเดิมเก็บเป็น Markdown และ lib/markdown.ts render ทางนั้น
    ส่วนบทความใหม่จาก rich text editor จะเก็บเป็น sanitized HTML
    ห้าม migrate ข้อมูลเก่า ให้ทั้งสองอยู่ร่วมกันแล้วเลือก renderer ตาม field นี้
  - focusKeyword       String?
  - secondaryKeywords  String[]  @default([])
  - schemaType         String?   @default("NewsArticle")  // NewsArticle | BlogPosting | Report
  - canonicalUrl       String?
  - readingMinutes     Int?      // cache ไว้ ไม่ต้องคำนวณทุก request
  - seoScore           Int?      // cache สำหรับคอลัมน์ในตาราง list
  - seoScoreAt         DateTime?

1.2 NewsArticleTranslation — เพิ่ม field
  - focusKeyword  String?   // คีย์เวิร์ดไม่ได้แปลตรงตัว ต้องตั้งแยกรายภาษา
  - seoScore      Int?
  ให้ field ระดับ NewsArticle ข้างบนเป็นค่าของภาษา default เท่านั้น

1.3 model ใหม่ — Keyword
  id, phrase @unique, searchVolume Int?, difficulty Int?, locale String,
  currentRank Int?, previousRank Int?, rankCheckedAt DateTime?,
  trend Json?  // อันดับย้อนหลัง 12 สัปดาห์ [{w, rank}]
  createdAt, updatedAt
  @@map("keywords")

1.4 model ใหม่ — KeywordAssignment
  id, keywordId → Keyword (Cascade),
  contentType String, contentId String, locale String,
  isPrimary Boolean @default(false)
  @@unique([keywordId, contentType, contentId, locale])
  @@map("keyword_assignments")
  เหตุผลที่ contentType เป็น String ไม่ใช่ enum: เหมือน ContentRevision.contentType
  และ AuditLog.model — content type ที่ 5 ไม่ควรต้อง migrate

1.5 model ใหม่ — ContentLink  (ผลสแกนลิงก์ภายใน)
  id, fromType String, fromId String, fromLocale String,
  toPath String, anchorText String?, isInternal Boolean,
  httpStatus Int?, checkedAt DateTime?
  @@index([toPath]) @@index([fromType, fromId])
  @@map("content_links")
  ใช้คู่กับ lib/content-links.ts ที่มีอยู่แล้ว — อย่าเขียน regex แกะลิงก์ใหม่
  ให้เรียก extractLinks() ตัวเดิม

สิ่งที่ต้องส่งมอบ
  - prisma migration + `npm run prisma:generate`
  - zod schema ใน lib/validations.ts สำหรับ field ใหม่ทุกตัว
  - อัปเดต prisma/seed.ts ให้มีข้อมูลตัวอย่าง: keyword 6 คำ
    ผูกกับบทความ seed เดิม 2 ชิ้น
  - tests/ ครอบคลุม zod ของ field ใหม่

ยังไม่ต้องแตะ UI ใน Phase นี้
```

---

## §2 — Phase 2: Rich text editor พร้อม H1–H6

```text
Phase 2 — เปลี่ยน NewsForm จาก textarea Markdown เป็น rich text editor

ใช้ TipTap (@tiptap/react + @tiptap/starter-kit + extension ที่จำเป็น)
เหตุผลที่เลือก TipTap: round-trip HTML ได้ตรง ไม่แปลงกลับไปกลับมาเหมือน
Markdown WYSIWYG ซึ่งเป็น failure mode ที่ doc-comment เดิมใน NewsForm.tsx
เขียนเตือนไว้ — เราแก้ด้วยการเลิกแปลง ไม่ใช่แปลงให้เก่งขึ้น

2.1 ระดับหัวข้อ H1 ถึง H6  ← ข้อกำหนดหลักของ Phase นี้
  - Heading extension ตั้ง levels: [1,2,3,4,5,6]
  - Toolbar: dropdown "รูปแบบข้อความ" (ย่อหน้า / H1–H6 / คำพูดอ้างอิง)
    + ปุ่มลัด H2 H3 H4 และ ¶ ตามที่ mockup ทำไว้
  - คีย์ลัด ⌥⌘1 … ⌥⌘6 → H1–H6, ⌥⌘0 → ย่อหน้า
  - นโยบาย H1 (สำคัญ — ตัดสินใจไว้แล้ว อย่าเปลี่ยนเอง):
      หน้าเว็บสาธารณะ render `title` ของบทความเป็น H1 อยู่แล้ว
      ดังนั้น H1 ตัวแรกในเนื้อหา = ชื่อบทความ ให้ sync สองทางกับช่อง title
      ถ้าเนื้อหามี H1 มากกว่า 1 ตัว = error ระดับ blocking ในรายการตรวจ SEO
      ตอน render หน้าจริงให้ตัด H1 ตัวแรกออก ไม่ให้ซ้ำกับ title
  - เตือนเมื่อลำดับหัวข้อข้ามระดับ (H2 → H4 โดยไม่มี H3)
    ให้ไฮไลต์บรรทัดนั้นในสารบัญด้านซ้าย ไม่ใช่แค่ขึ้นข้อความรวม
  - ทุก heading ต้องได้ id แบบ slugify(ข้อความ) ตอน render
    เพื่อให้ทำ anchor link และสารบัญบนหน้าเว็บจริงได้

2.2 ขยาย lib/markdown.ts
  - ALLOWED_TAGS เพิ่ม "h1", "h5", "h6"  (ตอนนี้มีแค่ h2,h3,h4)
  - เพิ่มฟังก์ชัน sanitizeArticleHtml() สำหรับ contentFormat = HTML
    allowlist ชุดเดียวกัน + อนุญาต attribute: id, href, src, alt, title,
    rel, target, colspan, rowspan, data-internal, data-media-id
    ยังคงห้าม script / iframe / inline style / on* เหมือนเดิม
  - สำคัญ: sanitize ทั้งฝั่ง server action ตอนบันทึก และตอน render
    (ห้ามเชื่อ client แม้จะเป็น editor ของเราเอง)

2.3 แทรกลิงก์ภายใน (modal)
  - ค้นหาข้าม Project / NewsArticle / Event / หน้า static ในภาษาที่กำลังแก้
  - เลือกแล้วใส่ anchor text ได้ พร้อม toggle: เปิดแท็บใหม่ / rel=nofollow
  - ลิงก์ภายในเก็บเป็น path สัมพัทธ์ ไม่มี locale prefix (เหมือน Redirect.fromPath)
    แล้วเติม locale ตอน render — หนึ่งลิงก์ครอบทั้ง 4 ภาษา
  - คีย์ลัด ⌘K

2.4 แทรกรูปภาพ (modal)
  - ต่อกับ components/admin/MediaLibrary.tsx ที่มีอยู่ ห้ามสร้าง uploader ใหม่
  - alt text เป็น required — ปุ่ม "แทรกรูป" disabled จนกว่าจะกรอก
    ดึงค่าเริ่มต้นจาก Media.altText[locale] ถ้ามี และเขียนกลับไปที่นั่นเมื่อแก้
  - รองรับ caption, alignment, loading lazy/eager
  - output เป็น <figure><img><figcaption> ตาม allowlist

2.5 บล็อกสำเร็จรูป (custom TipTap nodes)
  กล่องสรุป / FAQ / ตาราง / การ์ดโครงการ / CTA / quote เด่น
  บล็อก FAQ ต้องเก็บ structure ที่ generate FAQPage JSON-LD ได้ (Phase 3)

2.6 สารบัญ + สถิติเนื้อหาแบบ live (คอลัมน์ซ้ายใน mockup)
  จำนวนคำ / เวลาอ่าน / ย่อหน้า / H2-H3-H4~H6 / รูป / ลิงก์ภายใน / ความยาวประโยค
  การนับคำภาษาไทยไม่มีช่องว่างคั่น — ใช้สูตรประมาณ (จำนวนอักขระไทย / 4.2) + จำนวนคำ latin
  แยกไปไว้ที่ lib/content-stats.ts พร้อม unit test ที่มีเคสไทยล้วน / ปนอังกฤษ / มี emoji

ข้อควรระวัง
  - NewsForm.tsx เป็น client component ที่ผูกกับ useActionState + server action เดิม
    รักษา contract นั้นไว้ — editor ส่งค่าออกมาเป็น hidden input ชื่อ "content" เหมือนเดิม
  - บทความเก่าที่ contentFormat = MARKDOWN ต้องเปิดแก้ได้ ไม่เจ๊ง
    ให้แสดง banner "บทความนี้เป็น Markdown — แปลงเป็น rich text?" พร้อมปุ่มแปลงแบบ explicit
    ห้ามแปลงอัตโนมัติ
  - e2e: เพิ่ม spec ใน e2e/ ที่เขียนบทความใหม่ ใส่ H2/H3/H4 แทรกลิงก์ แล้วบันทึก
```

---

## §3 — Phase 3: SEO engine + inspector panel

```text
Phase 3 — แผง SEO ด้านขวา และเครื่องคำนวณคะแนน

3.1 lib/article-seo.ts  (ห้ามใส่ "server-only" — client ต้อง import)
  export type SeoCheck = {
    id: string; weight: 1|2|3; status: "pass"|"warn"|"fail"; messageKey: string;
  }
  export function auditArticle(input): { score: number; checks: SeoCheck[] }
  คะแนน = ผลรวม weight ที่ pass / ผลรวม weight ทั้งหมด × 100
  น้ำหนัก 3 ที่ไม่ผ่าน = fail (บล็อกการเผยแพร่), น้ำหนัก 1–2 ที่ไม่ผ่าน = warn

  รายการตรวจ (21 ข้อ ตาม mockup — id ต้องตรงกับ messageKey ใน messages/*.json):
    focusKw ใน H1 (3) / ใน meta title (3) / ใน meta description (2) / ในย่อหน้าแรก (2)
    มี H1 เดียว (2, fail) · H2 ≥ 2 (2) · H3 ≥ 1 (1)
    ลำดับ H1–H6 ไม่ข้ามระดับ (2, fail)
    ความยาว meta title 30–60 (3) · meta description 120–160 (3)
    เนื้อหา ≥ 600 คำ (3) · ลิงก์ภายใน ≥ 2 (3) · ลิงก์ภายนอก ≥ 1 (1)
    รูปทุกใบมี alt (3, fail) · มีรูป ≥ 1 ใบ (2)
    slug เป็น [a-z0-9-] และยาว ≤ 60 (2) · มี excerpt ≥ 60 ตัวอักษร (2)
    ประโยคเฉลี่ย ≤ 28 คำ (1) · มีบล็อก FAQ (2)
    แปลครบ 4 ภาษา (1) · มีภาพหน้าปกและ OG image (2)
  ใช้ SEO_LIMITS จาก lib/seo-limits.ts สำหรับ 60/160 อย่า hard-code ซ้ำ

3.2 UI แผงขวา 5 แท็บ (SEO / คีย์เวิร์ด / ลิงก์ / ตั้งค่า / Schema)
  - donut คะแนน + checklist จัดกลุ่ม ต้องแก้ / ควรปรับ / ผ่านแล้ว
  - Google SERP preview + OG preview ที่ไฮไลต์ focus keyword
  - ตัวนับ meta title / description พร้อมแถบสี
  - ทุกอย่างคำนวณสดตอนพิมพ์ (debounce 300ms) ไม่ต้องกดบันทึกก่อน
  - ต่อยอดจาก components/admin/SeoPreviewFields.tsx และ SlugField.tsx ที่มีอยู่
    อย่าสร้างซ้ำ

3.3 Schema / JSON-LD
  - lib/article-schema.ts สร้าง JSON-LD จากบทความ: NewsArticle | BlogPosting | Report
  - รวม FAQPage เข้าไปอัตโนมัติเมื่อบทความมีบล็อก FAQ
  - แสดง preview ใน editor และฝังจริงในหน้า public
  - อัปเดต lib/seo-audit.ts ที่ระบุว่า codebase ปล่อย schema type อะไรบ้าง —
    doc-comment ในไฟล์นั้นสั่งไว้ว่าให้แก้ในคอมมิตเดียวกับที่เพิ่ม type

3.4 บันทึก seoScore ลง DB ทุกครั้งที่บันทึกบทความ
  เพื่อให้คอลัมน์ SEO ในหน้า list เรียง/กรองได้โดยไม่ต้องคำนวณทั้งตาราง

3.5 บล็อกการเผยแพร่
  ถ้ามี check ระดับ fail ค้างอยู่ ปุ่มเผยแพร่ต้อง disabled พร้อมบอกเหตุผล
  (ยกเว้น role ADMIN ที่ override ได้ และบันทึกลง AuditLog)
```

---

## §4 — Phase 4: Keyword manager

```text
Phase 4 — หน้า /admin/seo/keywords และแท็บคีย์เวิร์ดใน editor

4.1 หน้าคลังคีย์เวิร์ด (ตาม mockup view "คลังคีย์เวิร์ด")
  - ตาราง: คีย์เวิร์ด / ค้นหาต่อเดือน / ความยาก / อันดับ / เปลี่ยนแปลง /
    หน้าที่จับคู่ / sparkline แนวโน้ม 12 สัปดาห์
  - KPI: จำนวนที่ติดตาม / ติด 10 อันดับแรก / ยังไม่มีหน้ารองรับ / แย่งอันดับกันเอง
  - ตรวจ keyword cannibalization: คีย์เวิร์ดเดียวกันถูก assign
    เป็น isPrimary ให้ ≥ 2 content ในภาษาเดียวกัน → แจ้งเตือนพร้อมชื่อทั้งสองหน้า
  - topic cluster: จัดกลุ่มจาก KeywordAssignment + ContentLink
    หน้าเสาหลัก = หน้าที่มีลิงก์ภายในชี้เข้ามากที่สุดในกลุ่ม

4.2 แท็บคีย์เวิร์ดใน editor
  - ความหนาแน่น: นับจำนวนครั้งที่พบ / จำนวนคำทั้งหมด เป้าหมาย 0.8–2.5%
    ระวังการนับคำไทย ใช้ lib/content-stats.ts ตัวเดียวกับ Phase 2
  - คีย์เวิร์ดรอง สูงสุด 5 คำ
  - คำแนะนำ LSI (Phase นี้ใช้ list แบบ manual ที่ admin เติมเองได้ก่อน
    ยังไม่ต้องต่อ API ภายนอก)

4.3 แหล่งข้อมูลอันดับ
  Phase นี้ยังไม่ต้องต่อ Google Search Console API
  ให้ทำ import CSV ของ GSC (query, impressions, clicks, position)
  แล้วอัปเดต Keyword.currentRank / trend
  วาง seam ไว้ที่ lib/keywords/source.ts เพื่อเปลี่ยนเป็น API ทีหลังได้
```

---

## §5 — Phase 5: Internal link manager

```text
Phase 5 — หน้า /admin/seo/links และแท็บลิงก์ใน editor

5.1 ตัวสแกนทั้งเว็บ
  - lib/admin/link-graph.ts: เดินทุก content ที่มี body แล้วเรียก
    extractLinks() จาก lib/content-links.ts เขียนผลลง ContentLink
  - รันเป็น script (scripts/link-scan.ts) + ปุ่ม "สแกนใหม่" ในหน้า admin
  - ตรวจ HTTP status ของลิงก์ภายนอกแบบ batch พร้อม timeout และ rate limit
  - ต่อกับ lib/admin/url-health.ts ที่มีอยู่แล้ว อย่าทำซ้ำ

5.2 หน้า Link health (ตาม mockup view "สุขภาพลิงก์ภายใน")
  - KPI: ลิงก์ภายในทั้งหมด / หน้ากำพร้า / ลิงก์เสีย / redirect ที่ใช้งานอยู่
  - หน้ากำพร้า = content ที่ publish แล้วแต่ไม่มี ContentLink.toPath ชี้ถึง
    ยกเว้นหน้าระบบ (privacy, terms) — ทำ allowlist ไว้
  - ลิงก์เสีย: แสดงต้นทาง ปลายทาง status code และปุ่มแก้
  - ตรวจ redirect chain จากตาราง Redirect (A→B→C) และแจ้งให้ยุบเป็น A→C

5.3 โอกาสเชื่อมลิงก์
  - หาข้อความในบทความที่ตรงกับ title ของ content อื่น แต่ยังไม่ได้เป็นลิงก์
  - จัดอันดับน้ำหนักจาก: ความตรงของข้อความ + จำนวนลิงก์ที่ปลายทางมีอยู่แล้ว
    (หน้าที่ลิงก์เข้าน้อย = โอกาสน้ำหนักสูง)
  - ปุ่ม "เพิ่มลิงก์" แก้ body ของบทความต้นทางให้เลย
    ต้องบันทึก ContentRevision ก่อนแก้ทุกครั้ง

5.4 แท็บลิงก์ใน editor
  ลิงก์ภายในบทความนี้ / ควรลิงก์ไปเพิ่ม / ลิงก์ที่ชี้เข้ามา / ลิงก์ภายนอก + ลิงก์เสีย
```

---

## §6 — Phase 6: Workflow, หลายภาษา, revision

```text
Phase 6 — เวิร์กโฟลว์และการแปล

6.1 สถานะ
  ใช้ enum ContentStatus เดิม (อย่าสร้าง enum ใหม่) — DRAFT → IN_REVIEW → PUBLISHED
  ปุ่มขวาบนเปลี่ยนตามสถานะ: ส่งตรวจทาน → เผยแพร่ → อัปเดตบทความ
  สิทธิ์: EDITOR ส่งตรวจได้ / ADMIN เผยแพร่ได้ — ตรวจใน server action ด้วย
  ไม่ใช่ซ่อนปุ่มอย่างเดียว

6.2 ตั้งเวลาเผยแพร่
  publishedAt อนาคต + contentStatus PUBLISHED = ตั้งเวลา
  หน้า public ต้องกรอง publishedAt <= now() ทุกจุดที่ query บทความ
  (เช็ก lib/news.ts ให้ครบทุก query — นี่คือจุดที่พลาดง่ายที่สุดของ Phase นี้)

6.3 แท็บภาษา
  ต่อยอด components/admin/LanguageTabs.tsx และ TranslationStatusBadges.tsx
  วงแหวน % ความสมบูรณ์ต่อภาษา คำนวณจาก field ที่จำเป็น:
  title, excerpt, content, metaTitle, metaDescription, focusKeyword
  ใช้ลำดับการแสดงผลจาก LOCALE_DISPLAY_ORDER (th ก่อน) ไม่ใช่ locales

6.4 ประวัติการแก้ไข
  ใช้ ContentRevision + lib/content-revisions.ts ที่มีอยู่
  เพิ่ม modal ในหน้า editor: รายการเวอร์ชัน ผู้แก้ เวลา สรุปการเปลี่ยนแปลง
  และปุ่มกู้คืน ต่อกับ components/admin/PublishingRevisionPanel.tsx ที่มีอยู่แล้ว

6.5 ยังไม่ทำใน Phase นี้ (ทำเป็น TODO comment ไว้)
  - แปลด้วย AI
  - ส่งเข้า Google Indexing API
  - โพสต์ LINE OA / Facebook อัตโนมัติ
  - ลิงก์พรีวิวสำหรับคนนอก
```

---

## §7 — เกณฑ์ตรวจรับรวม

```text
ก่อนปิดงานทั้งชุด ตรวจให้ครบ:

  [ ] npm run verify ผ่าน (lint + typecheck + unit test)
  [ ] npm run test:e2e ผ่าน — หยุด npm run dev ก่อนรัน
  [ ] messages/en|th|zh|ru.json มี key ครบเท่ากันทุกไฟล์
  [ ] บทความ Markdown เดิมยังเปิดแก้และแสดงผลหน้าเว็บได้ปกติ
  [ ] เขียนบทความใหม่ที่มี H1 ถึง H6 ครบทุกระดับ บันทึก แล้วหน้า public
      render ออกมาเป็น h1..h6 จริง ไม่ถูก sanitize ทิ้ง
  [ ] เนื้อหาที่มี <script> หรือ onerror= ถูกตัดทิ้งทั้งตอนบันทึกและตอน render
  [ ] เปลี่ยน slug ของบทความที่เผยแพร่แล้ว → เกิด Redirect row อัตโนมัติ
      (พฤติกรรมเดิม ห้ามทำพัง — มี tests/redirect-on-rename.test.ts คุมอยู่)
  [ ] คะแนน SEO ที่คำนวณฝั่ง client ตรงกับที่คำนวณฝั่ง server เป๊ะ
      (ฟังก์ชันเดียวกัน ไม่ใช่สองชุด)
  [ ] Lighthouse หน้าบทความ public ยังได้ SEO 100 เหมือนเดิม
```

---

## หมายเหตุการตัดสินใจที่ล็อกไว้แล้ว

| ประเด็น | ทางที่เลือก | เหตุผล |
|---|---|---|
| รูปแบบจัดเก็บเนื้อหา | HTML ที่ sanitize แล้ว สำหรับบทความใหม่ / Markdown สำหรับของเดิม | round-trip Markdown ↔ WYSIWYG คือจุดที่ format เพี้ยนเงียบ ๆ ซึ่ง doc-comment เดิมใน NewsForm.tsx เตือนไว้ |
| Editor library | TipTap | ควบคุม schema ของ node ได้ ทำ custom block (FAQ, การ์ดโครงการ) ได้ และ output เป็น HTML ตรง ๆ |
| H1 ในเนื้อหา | H1 ตัวแรก = ชื่อบทความ sync สองทาง, ตัวที่ 2 ขึ้นไป = error | หน้า public render title เป็น H1 อยู่แล้ว สองตัวคือปัญหา SEO จริง |
| ลิงก์ภายใน | เก็บเป็น path ไม่มี locale prefix | หนึ่งลิงก์ครอบ 4 ภาษา เหมือน Redirect.fromPath |
| อันดับคีย์เวิร์ด | import CSV ก่อน ค่อยต่อ GSC API | ไม่ต้องรอ OAuth setup ก็ใช้งานได้จริงตั้งแต่วันแรก |
| คะแนน SEO | เก็บ cache ใน DB + คำนวณสดใน editor | ตาราง list ต้องเรียงตามคะแนนโดยไม่คำนวณ 142 แถว |
