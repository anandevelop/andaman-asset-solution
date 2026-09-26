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

## §2b — Phase 2b: จัดบทความและรูปภาพให้ใช้งานได้จริง

> ที่มาของ Phase นี้: Phase 2 ทำ editor ขึ้นมาใช้ได้ แต่ "จัดบทความ/จัดรูป" ยังยาก
> เพราะ 3 เรื่องเชิงโครงสร้าง — รูปที่แทรกแล้วแก้ไม่ได้ (`Figure` เป็น `atom: true`
> ไม่มี NodeView), ความกว้างรูปถูกล็อกไว้ใน CSS, และทุกคำสั่งต้องเอื้อมไป toolbar
> ด้านบนที่ไม่ sticky — บวกบั๊กเงียบ 1 ตัวที่ทำให้เนื้อหาหายตอนบันทึก
>
> ส่ง §0 ก่อนเสมอ แล้วส่งทีละ step (2b-0 → 2b-7) **อย่าส่งทั้ง Phase รวดเดียว**
> ลำดับสำคัญ: 2b-0 ต้องมาก่อนทุกอย่าง เพราะเป็นบั๊กที่ทำข้อมูลหาย

---

### 2b-0 — แก้บั๊กเงียบก่อน: underline / strike หายตอนบันทึก

```text
Phase 2b-0 — ปิดช่องที่เนื้อหาหายเงียบ ๆ ระหว่าง editor กับ sanitizer

อาการ (ยืนยันจากโค้ดแล้ว ไม่ต้องไปหาซ้ำ):
  @tiptap/starter-kit 3.31 bundle ทั้ง extension-underline และ extension-strike
  มาให้โดยอัตโนมัติ — RichTextEditor.tsx ไม่ได้ปิดไว้ ดังนั้น ⌘U และ ⌘⇧X
  ใช้ได้จริงในหน้าจอ และ render ออกมาเป็น <u> กับ <s>
  แต่ ALLOWED_TAGS ใน lib/markdown.ts (บรรทัด ~37) มีแค่ "del" ไม่มี "s" ไม่มี "u"
  ผลคือ admin เห็นตัวขีดเส้นใต้/ขีดฆ่าบนจอ กดบันทึก แล้วมันหายไปเงียบ ๆ
  ไม่มี error ไม่มี warning — เป็น data loss ที่ผู้ใช้โทษ editor ว่า "พัง"

การตัดสินใจที่ล็อกไว้แล้ว อย่าเปลี่ยนเอง:
  - ขีดฆ่า (strike) = เก็บไว้ ให้ใช้งานได้จริง
      เพิ่ม "s" เข้า ALLOWED_TAGS (ห้ามลบ "del" ออก — marked แปลง ~~x~~
      เป็น <del> ดังนั้นบทความ MARKDOWN เดิมยังต้องผ่าน)
      เพิ่มปุ่มขีดฆ่าใน toolbar ของ RichTextEditor + i18n key
      เพิ่ม style ของ s/del ใน @utility prose-article (app/globals.css ~321)
  - ขีดเส้นใต้ (underline) = ปิดทิ้ง
      StarterKit.configure({ ..., underline: false })
      เหตุผล: prose-article ใช้ underline เป็นสัญญะของ "ลิงก์" อยู่แล้ว
      (& a { @apply underline ... }) ขีดเส้นใต้ข้อความธรรมดาจะอ่านเป็นลิงก์
      ที่กดไม่ได้ ทั้งเสีย UX และเสีย accessibility — ปิดที่ต้นทางถูกกว่า
      ขยาย allowlist

ตรวจ marks/nodes ตัวอื่นที่ StarterKit เปิดให้แต่ไม่มีปุ่ม แล้วสรุปเป็นตาราง
ก่อนแก้: code, codeBlock, horizontalRule, hardBreak, listKeymap
  - ตัวที่ ALLOWED_TAGS รับอยู่แล้ว (code, pre, hr, br) → เพิ่มปุ่มใน toolbar
  - ตัวที่ไม่รับ → ปิดใน StarterKit.configure ไปเลย ห้ามปล่อยให้พิมพ์ได้แต่หาย

สิ่งที่ต้องส่งมอบ
  - tests/markdown.test.ts: เคสใหม่ที่ยืนยันว่า tag ทุกตัวที่ editor
    "สร้างได้" รอด sanitizeArticleHtml() — เขียนเป็น list เดียวที่ทั้งสองฝั่ง
    อ้างถึงได้ ไม่ใช่ literal สองชุดที่หลุดกันทีหลัง
  - tests/components/RichTextEditor.test.tsx: ยืนยันว่า underline command
    ไม่มีอยู่ใน schema แล้ว
  - i18n key ครบ 4 ไฟล์ (messages/en|th|zh|ru.json)

ห้ามแตะ Figure node ใน step นี้ — นั่นคือ 2b-1
```

---

### 2b-1 — Figure NodeView: แก้รูปในที่ได้ ไม่ต้องลบแล้วแทรกใหม่

```text
Phase 2b-1 — ทำให้รูปที่แทรกแล้วยังแก้ได้ (ต้นตออันดับ 1 ของ "จัดรูปยาก")

ปัญหาปัจจุบัน:
  Figure ใน RichTextEditor.tsx เป็น atom: true และไม่มี NodeView
  คลิกรูปแล้วไม่มีอะไรเกิดขึ้น — จะเปลี่ยน alignment, แก้ caption, แก้ alt
  ต้องลบรูปแล้วเปิด InsertImageModal แทรกใหม่ทั้งรอบ ทุกครั้ง

1.1 caption ต้องเป็นเนื้อหาที่แก้ในที่ได้ ไม่ใช่ attribute
  เปลี่ยน Figure เป็น:
    atom: false, content: "inline*", draggable: true, isolating: true
    renderHTML → ["figure", attrs, ["img", {...}], ["figcaption", {}, 0]]
    parseHTML → คง getAttrs เดิมไว้ แต่เพิ่ม contentElement: "figcaption"
    แล้ว *ลบ* attribute `caption` ออก
  ไม่ต้องทำ data migration: HTML ที่เก็บใน DB เป็น
  <figure><img><figcaption>ข้อความ</figcaption></figure> อยู่แล้ว
  (caption เคยเป็น attribute แค่ในหัวความคิดของ node ไม่เคยลงดิสก์)
  → ยืนยันข้อนี้ด้วยการเปิดบทความ seed ที่มีรูปแล้วดูว่า caption เดิมยังอยู่

  ผลข้างเคียงที่ต้องปิด: node ที่ content ว่างจะ render <figcaption></figcaption>
  เปล่า ๆ ออกหน้า public → เพิ่ม `& figcaption:empty { @apply hidden; }`
  ใน @utility prose-article

1.2 NodeView พร้อมแถบควบคุมติดรูป
  ใช้ ReactNodeViewRenderer จาก @tiptap/react (มีในโปรเจกต์แล้ว ไม่ต้องลง dep ใหม่)
  ไฟล์ใหม่: components/admin/editor/FigureNodeView.tsx
  ใช้ NodeViewWrapper + NodeViewContent (NodeViewContent = figcaption)
  แสดงแถบควบคุมเมื่อ props.selected เท่านั้น (ไม่ใช่ hover — hover
  ทำให้แถบกระพริบตอนเลื่อนอ่าน) มีปุ่ม:
    ตำแหน่ง: ซ้าย / กลาง / ขวา / ไม่จัด
    ความกว้าง: ปกติ / กว้าง / เต็มคอลัมน์   ← ดู 2b-2
    แก้ alt  (popover ช่องเดียว)
    ลบรูป
  ทุกปุ่มเรียก updateAttributes() ไม่ใช่ลบ-แทรกใหม่ เพื่อไม่ให้ history พัง

1.3 alt ต้องเขียนกลับเข้าคลังสื่อ
  ถ้า node มี mediaId ให้เขียน alt ที่แก้ใหม่กลับไปที่ Media.altText[locale]
  ผ่าน updateMediaMeta() ตัวเดิมที่ InsertImageModal.tsx ใช้อยู่
  (ห้ามเขียน server action ใหม่) — debounce แล้วยิงครั้งเดียวตอน popover ปิด
  ไม่ใช่ทุก keystroke

1.4 รูปที่ alt ว่างต้องมองเห็น
  ใส่กรอบ/ป้ายเตือนบน NodeView เมื่อ alt เป็นค่าว่าง และให้ข้อ "รูปทุกใบมี alt"
  (น้ำหนัก 3, fail) ใน lib/article-seo.ts จับได้เหมือนเดิม
  — ตอนนี้ InsertImageModal บังคับ alt ตอนแทรก แต่พอแก้ในที่ได้แล้ว
  ต้องมีทางกันไม่ให้ลบ alt ทิ้งภายหลัง

ข้อควรระวัง
  - NodeView เป็น client component ใน tree ของ NewsForm ที่เป็น "use client" แล้ว
  - ห้ามให้ NodeView อ่าน useTranslations เองถ้าทำให้ต้อง provider ใหม่ —
    รับ label ผ่าน props แบบเดียวกับ toolbarLabels ที่ RichTextEditor ทำอยู่
  - immediatelyRender: false ต้องคงไว้ (SSR hydration)

สิ่งที่ต้องส่งมอบ
  - tests/components/RichTextEditor.test.tsx: round-trip figure ที่มี caption
    → setContent(html) แล้ว getHTML() ต้องได้ caption กลับมาเหมือนเดิม
  - e2e/admin-news-rich-text.spec.ts: แทรกรูป → คลิกรูป → เปลี่ยนเป็นจัดขวา
    → พิมพ์ caption → บันทึก → เปิดกลับมาแก้ ค่ายังอยู่ครบ
```

---

### 2b-2 — ความกว้างรูป: แยก `data-width` ออกจาก `data-align`

```text
Phase 2b-2 — ปลดล็อกความกว้างรูปที่ตอนนี้ฟิกซ์อยู่ใน CSS

ปัญหาปัจจุบัน:
  app/globals.css (~404) ฟิกซ์ figure[data-align="left"|"right"] ไว้ที่
  w-1/2 sm:w-2/5 และ "center" ที่ max-w-2xl — ความกว้างจึงผูกติดกับตำแหน่ง
  ทำ "รูปเล็กชิดขวา" หรือ "รูปเต็มความกว้างคอลัมน์" แยกกันไม่ได้

2.1 attribute ใหม่: width  ค่าที่รับ: "normal" | "wide" | "full"  (default "normal")
  carry เป็น data-width บน <figure> ตามเหตุผลเดียวกับที่ data-align ใช้
  → เพิ่ม "data-width" เข้า ALLOWED_ATTR ใน lib/markdown.ts (~48)
    พร้อม comment อธิบายเหมือนที่ data-align มีอยู่

2.2 CSS ใน @utility prose-article
  data-align คุมแค่การลอย/จัดกลาง — เอา w-* ออกจาก selector ของ align ทั้งหมด
  data-width คุมความกว้าง:
    normal → ความกว้างเต็มคอลัมน์ (พฤติกรรมเดิมของ figure ที่ไม่มี align)
    wide   → ล้นออกนอกคอลัมน์ข้างละ ~3rem บนจอ lg ขึ้นไป (ใช้ค่าจากความกว้าง
             ของ container หน้าบทความจริง ห้าม hard-code px สุ่ม)
    full   → เต็มความกว้าง container ของหน้าบทความ
  ถ้า align เป็น left/right ให้ width บังคับเป็น ~40% เหมือนเดิม
  (ลอยแล้วเต็มความกว้างไม่มีความหมาย) — เขียนกฎนี้เป็น CSS ไม่ใช่ logic ใน JS

2.3 UI
  ปุ่มความกว้าง 3 ตัวใน FigureNodeView (2b-1) + ตัวเลือกใน InsertImageModal
  ให้ค่า default ตอนแทรกเป็น "normal" + align null = พฤติกรรมเดิมทุกประการ
  บทความเก่าที่ไม่มี data-width ต้องแสดงผลไม่เปลี่ยนเลยแม้แต่พิกเซลเดียว
  ← ข้อนี้คือเกณฑ์ตรวจรับหลักของ step นี้

2.4 ความกว้างคอลัมน์ editor ต้องเท่าหน้าจริง
  EditorContent ใส่ prose-article ไว้แล้ว (ดีอยู่) แต่ NewsForm.tsx วางมันใน
  grid lg:grid-cols-[minmax(0,1fr)_320px] ซึ่งแคบกว่า container ของหน้า
  news/[slug] จริง → รูป wide/full และรูปลอย 40% จะดูไม่ตรงกับหน้าจริง
  ให้ตั้ง max-width ของพื้นที่เขียนให้เท่ากับ container ของหน้าบทความ public
  (อ่านค่าจาก app/[locale]/(site)/news/[slug]/page.tsx อย่าเดา)
  ถ้าพื้นที่ไม่พอ ให้ทำเป็นโหมดโฟกัสใน 2b-7 แทนการบีบตัวหนังสือ
```

---

### 2b-3 — BubbleMenu, toolbar ที่ไม่หนีหาย, และแก้ลิงก์เดิมได้

```text
Phase 2b-3 — เลิกบังคับให้เอื้อมไป toolbar ด้านบน

ปัญหาปัจจุบัน:
  toolbar อยู่บนสุดของ editor และไม่ sticky — checklist SEO ของเราเองบังคับ
  บทความ >= 600 คำ แปลว่าคนเขียนต้องเลื่อนขึ้น-ลงหา toolbar ตลอด
  และ "คลิกลิงก์ที่แทรกไว้แล้วเพื่อแก้หรือลบ" ทำไม่ได้เลย ต้องลากคลุมแล้วแทรกทับ

3.1 BubbleMenu ตอนเลือกข้อความ
  import { BubbleMenu } from "@tiptap/react/menus"
  (TipTap 3 ย้าย menus ออกมาเป็น subpath export — มีใน @tiptap/react
   ที่ลงไว้แล้ว ไม่ต้อง npm install เพิ่ม ยืนยันก่อนลงมือด้วย
   node_modules/@tiptap/react/package.json → exports["./menus"])
  ปุ่ม: ระดับหัวข้อ (H2/H3/H4) · ตัวหนา · ตัวเอน · ขีดฆ่า · ลิงก์ · คำพูดอ้างอิง
  ซ่อนเมื่อ selection อยู่ใน figure หรือ codeBlock

3.2 BubbleMenu เฉพาะตอนเคอร์เซอร์อยู่บนลิงก์
  shouldShow: เมื่อ editor.isActive("link")
  แสดง href ที่ลิงก์ชี้ไป + ปุ่ม แก้ (เปิด InternalLinkModal ที่มีอยู่ พร้อม
  prefill ค่าเดิมทั้ง href/anchor/newTab/nofollow) · เปิดดู · ลบลิงก์
  → InternalLinkModal.tsx ต้องรับ initial values ได้ ตอนนี้รับไม่ได้
    เพิ่ม prop เข้าไป ห้ามสร้าง modal ตัวที่สอง

3.3 toolbar หลัก sticky
  ให้ toolbar ติดขอบบนของพื้นที่เขียนตอนเลื่อน โดยไม่ทับ AdminTopbar
  (เช็กความสูง/ z-index ของ AdminTopbar.tsx ก่อน อย่าเดาค่า)

3.4 เติมปุ่มที่ขาด
  ตอนนี้ toolbar มีแค่ ¶ H2 H3 H4 + dropdown H1–H6, หนา, เอน, bullet,
  ordered, quote, ลิงก์, รูป
  เพิ่ม: undo/redo (มี history อยู่แล้วแต่ไม่มีปุ่ม), ขีดฆ่า (จาก 2b-0),
  เส้นคั่น (hr), code inline, ล้างรูปแบบ (unsetAllMarks)
  จัดกลุ่มด้วยเส้นคั่นแบบที่ไฟล์ทำอยู่ ไม่ต้องเพิ่ม token ใหม่

3.5 แสดงคีย์ลัดให้คนเห็น
  title/aria-label ของทุกปุ่มต่อท้ายด้วยคีย์ลัด (เช่น "ตัวหนา (⌘B)")
  ตรวจ platform แล้วสลับ ⌘/Ctrl — ห้าม hard-code ⌘ ตัวเดียว

i18n key ครบ 4 ไฟล์ทุกปุ่มที่เพิ่ม
```

---

### 2b-4 — ลากไฟล์มาวาง, วางรูปจาก clipboard, ล้าง paste จาก Word

```text
Phase 2b-4 — ทางเข้ารูปที่สั้นกว่า 4 คลิก และ paste ที่ไม่พารูปแบบขยะเข้ามา

ปัญหาปัจจุบัน:
  แทรกรูป 1 ใบ = กดปุ่มรูป → รอโหลดคลังสื่อ → เลือกไฟล์ → กรอก alt → แทรก
  ทุกใบ ทุกครั้ง แม้เป็นรูปที่เพิ่ง screenshot มาสด ๆ

4.1 ลากไฟล์รูปมาวางในพื้นที่เขียน + ⌘V วางรูปจาก clipboard
  ใช้ editorProps.handleDrop / handlePaste
  เส้นทาง upload ต้องเป็นเส้นเดิมเป๊ะ: presign (app/api/uploads/presign) →
  PUT → createMedia() — ยกฟังก์ชัน putToS3 + การแม็ป PRESIGN_ERROR_KEYS
  ออกจาก components/admin/MediaUploadButton.tsx ไปเป็น hook/โมดูลที่ทั้งสอง
  ที่ import ได้ ห้าม copy-paste โค้ด upload ชุดที่สอง และห้ามเขียน
  route ใหม่
  ระหว่าง upload ให้แทรก figure placeholder ที่มี progress แล้วค่อย
  updateAttributes ใส่ src/mediaId จริงเมื่อเสร็จ — ถ้า upload ล้มให้ลบ
  placeholder ทิ้งพร้อมข้อความจาก admin.upload.* ชุดเดิม
  ข้อจำกัดเดิมต้องบังคับเหมือนกัน: ACCEPT list และ MAX_BYTES ของ
  MediaUploadButton (อ่านค่าจากไฟล์ อย่าพิมพ์ซ้ำ)
  alt: แทรกได้โดยยังไม่มี alt แต่ figure ต้องขึ้นป้ายเตือน (2b-1 ข้อ 1.4)
  และ checklist "รูปทุกใบมี alt" ยังบล็อกการเผยแพร่เหมือนเดิม

4.2 ล้าง HTML ที่ paste มาจาก Word / Google Docs / เว็บอื่น
  editorProps.transformPastedHTML — ตัด <span>/style/class/comment ของ Office
  แปลง "ย่อหน้าที่เป็นตัวหนาทั้งบรรทัด" เป็นหัวข้อไม่ได้โดยอัตโนมัติ
  (เดาผิดแล้วน่ารำคาญกว่า) ให้ทำแค่ล้างให้สะอาดพอที่ schema ของ TipTap
  จะไม่ทิ้งทั้งย่อหน้า
  logic การล้างอยู่ใน lib/ ที่ทดสอบได้ (เช่น lib/paste-html.ts) + unit test
  ที่มี fixture จริงจาก Word และ Google Docs อย่างน้อย 1 ชุดต่อแหล่ง
  ห้ามวาง regex ยาว ๆ ไว้ใน component

4.3 เตือนเมื่อ paste รูปแบบ base64 ก้อนใหญ่
  <img src="data:..."> จาก Word จะถูก sanitizer ตัดทิ้งอยู่แล้ว (SAFE_URI)
  แต่ตอนนี้ตัดแบบเงียบ — ให้บอกผู้ใช้ว่ารูปที่ paste มาต้อง upload
  แล้วเสนอ upload ให้เลยถ้าทำได้
```

---

### 2b-5 — บล็อกสำเร็จรูปที่ค้างจาก §2.5

```text
Phase 2b-5 — custom node ที่ §2.5 ระบุไว้แต่ยังไม่ได้ทำ

ลำดับความสำคัญ (ทำตามนี้ ทีละตัว ตัวละ 1 รอบรีวิว):
  1. FAQ    ← มีคะแนน SEO ผูกอยู่จริง ทำก่อน
  2. ตาราง
  3. กล่องสรุป (callout)
  4. quote เด่น (pull-quote)
  5. การ์ดโครงการ + CTA

5.1 FAQ block
  lib/article-seo.ts (~149) และ lib/article-schema.ts (~51) มี TODO(Phase 2b)
  ค้างอยู่ทั้งคู่: ข้อ "มีบล็อก FAQ" (น้ำหนัก 2) คืนค่าไม่ผ่านตลอด และ
  FAQPage JSON-LD ยัง generate ไม่ได้ → ทุกบทความเสียคะแนนข้อนี้ฟรี
  โครง node: faqList > faqItem { question: heading-ish, answer: block+ }
  ต้อง parse กลับจาก HTML ได้ (round-trip) ด้วย tag ที่อยู่ใน ALLOWED_TAGS
  แล้วเท่านั้น — ถ้าต้องเพิ่ม attribute ให้เพิ่มแบบ data-* พร้อมเหตุผล
  แล้วเก็บ TODO ทั้งสองจุดออกในคอมมิตเดียวกับที่ node นี้เข้า
  ตามที่ doc-comment ในสองไฟล์นั้นสั่งไว้

5.2 ตาราง
  ALLOWED_TAGS รับ table/thead/tbody/tr/th/td + colspan/rowspan ไว้แล้ว
  แต่ editor ไม่มี table node → paste ตารางเข้ามาถูก TipTap ทิ้งก่อนถึง
  sanitizer ด้วยซ้ำ
  ต้อง npm install @tiptap/extension-table (+ row/cell/header ตามที่ package
  นั้นกำหนดใน version 3) — ตรวจว่าเป็น MIT/open source ก่อนลง
  ถ้าเป็น paid extension ให้หยุดแล้วรายงาน อย่าลงเอง
  ต้องมี: เพิ่ม/ลบแถว-คอลัมน์, แถวหัวตาราง, และ CSS ตารางใน prose-article
  (ตอนนี้ยังไม่มี style ของ table เลย — ตารางจะโล้นทั้งใน editor และหน้าจริง)

5.3 กล่องสรุป / pull-quote / การ์ดโครงการ / CTA
  ทั้งสี่ตัวต้องแทนด้วย tag ที่ allowlist รับได้อยู่แล้ว + data-* เท่านั้น
  (ห้ามขยาย allowlist ให้รับ div/class/style — นั่นคือการเปิดช่อง XSS
   กลับมาเพื่อความสวยงาม)
  ถ้าตัวไหนแทนไม่ได้ในข้อจำกัดนี้ ให้หยุดแล้วเสนอทางเลือกก่อนเขียนโค้ด
  การ์ดโครงการ: อ้างโครงการด้วย slug ไม่ใช่ id (id เปลี่ยน slug ไม่เปลี่ยน
  ในทางปฏิบัติ และ slug อ่านออกใน HTML) แล้ว render ค่าจริงตอน render หน้า

5.4 แต่ละ node ต้องมีทางเข้าใน UI ครบสามทาง
  ปุ่ม/เมนูใน toolbar · slash command (2b-6) · keyboard ถ้าเหมาะ
  และต้องแสดงผลใน editor ใกล้เคียงหน้าจริง (prose-article ครอบอยู่แล้ว
  ถ้า style ไหนอยู่นอก prose-article ต้องย้ายเข้า ไม่ใช่เขียนซ้ำ)
```

---

### 2b-6 — ย้ายบล็อก: drag handle + slash command + สารบัญที่ลากได้

```text
Phase 2b-6 — จัดลำดับเนื้อหาโดยไม่ต้อง cut/paste

6.1 drag handle
  ลองใช้ @tiptap/extension-drag-handle-react ก่อน — ถ้าเป็น paid/Pro
  หรือขัดกับ version 3.31 ที่ใช้อยู่ ให้หยุดแล้วรายงาน แล้วทำเองแบบเล็ก:
  ปุ่มจับลอยซ้ายบล็อกที่เคอร์เซอร์อยู่ ใช้ ProseMirror view.dragging เดิม
  (Figure มี draggable: true อยู่แล้วแต่ไม่มี handle ให้จับ)
  ต้องลากได้ทั้ง ย่อหน้า / หัวข้อ / รูป / list item / บล็อกจาก 2b-5

6.2 slash command
  พิมพ์ "/" ที่ต้นบรรทัดว่าง → เมนูค้นหาได้ (ทั้งไทยและอังกฤษ) สำหรับ
  หัวข้อ H2–H4 · bullet · ordered · quote · เส้นคั่น · รูป · ลิงก์ ·
  ตาราง · FAQ · กล่องสรุป · pull-quote
  ใช้ Suggestion utility ของ @tiptap/core (มีอยู่แล้ว) หรือ FloatingMenu
  จาก @tiptap/react/menus ห้ามลง dependency ใหม่ถ้าไม่จำเป็น
  คำค้นไทยต้องใช้ i18n key ไม่ใช่ literal ในโค้ด

6.3 สารบัญในแผงขวาลากสลับได้
  NewsSeoPanel.tsx มีสารบัญ (outlineTitle ~563) แบบอ่านอย่างเดียว
  ให้คลิกหัวข้อ = เลื่อน editor ไปที่หัวข้อนั้น (อันนี้ทำก่อน คุ้มสุด)
  และลากสลับ = ย้ายทั้ง section (หัวข้อ + เนื้อหาใต้มันจนถึงหัวข้อระดับ
  เดียวกันตัวถัดไป) ถ้าข้อหลังทำให้ scope บาน ให้แยกเป็น step ย่อยแล้วบอกก่อน
  หัวข้อที่ skipsLevel อยู่แล้วต้องยังไฮไลต์ได้เหมือนเดิม
```

---

### 2b-7 — กันงานหาย และพื้นที่เขียน

```text
Phase 2b-7 — autosave, โหมดโฟกัส, ตัวนับคำในโหมด rich text

7.1 autosave ฉบับร่าง
  ตอนนี้บันทึกผ่าน form action เท่านั้น — เขียนบทความ 1,500 คำแล้วปิดแท็บ
  หรือ session หมดอายุ = หายทั้งหมด ทั้งที่มี ContentRevision +
  lib/content-revisions.ts พร้อมใช้อยู่แล้ว
  ทำสองชั้น:
    - ชั้นเบราว์เซอร์: เก็บ draft ลง localStorage key ที่ผูกกับ
      articleId + locale ทุก ~5 วินาทีหลังหยุดพิมพ์ เปิดหน้าเดิมแล้วถ้า
      draft ใหม่กว่าค่าจาก server ให้ขึ้น banner "มีฉบับร่างที่ยังไม่บันทึก
      — กู้คืน / ทิ้ง" ห้ามกู้คืนอัตโนมัติ
    - ชั้น server: autosave เป็น ContentRevision ทุก ~60 วินาทีเมื่อมีการ
      เปลี่ยนแปลงจริง และ *ห้าม* แตะสถานะ/publishedAt ของบทความ
      ต้องเช็กสิทธิ์ใน server action เหมือนทุก action ตาม AGENTS.md
  เตือนก่อนออกจากหน้าเมื่อมีการแก้ที่ยังไม่บันทึก (beforeunload)

7.2 โหมดโฟกัส
  ปุ่มสลับที่ซ่อนแผง SEO 320px และขยายพื้นที่เขียนเป็นความกว้างเท่าหน้า
  บทความจริง (ต่อจาก 2b-2 ข้อ 2.4) จำสถานะไว้ใน localStorage
  แผงขวาต้องยังคำนวณอยู่เบื้องหลัง — ปิดการแสดงผล ไม่ใช่ปิดการคำนวณ
  เพราะการบล็อกการเผยแพร่ (§3.5) อ้างผลนั้น

7.3 ตัวนับคำในโหมด rich text
  BodyField (โหมด MARKDOWN) แสดงจำนวนตัวอักษร + เวลาอ่านไว้ข้างช่อง
  แต่โหมด HTML ไม่มีเลย ต้องเหลือบไปดูแผงขวา
  ให้แสดง จำนวนคำ / เวลาอ่าน ใต้ editor โดยเรียก getContentStats() จาก
  lib/content-stats.ts ตัวเดียวกับที่แผงขวาใช้ (ห้ามนับเองซ้ำ — การนับคำไทย
  มีสูตรเฉพาะอยู่ในไฟล์นั้นแล้ว)
```

---

### เกณฑ์ตรวจรับ Phase 2b

```text
ก่อนปิด Phase 2b ตรวจให้ครบ:

  [ ] npm run verify ผ่าน
  [ ] npm run test:e2e ผ่าน (หยุด npm run dev ก่อนรัน)
  [ ] messages/en|th|zh|ru.json key ครบเท่ากันทุกไฟล์
  [ ] ทุก mark/node ที่ editor สร้างได้ รอด sanitizeArticleHtml() — ไม่มีตัวไหน
      ที่กดได้บนจอแล้วหายตอนบันทึก (นี่คือ 2b-0 ต้องมี test คุมไว้ถาวร)
  [ ] เปิดบทความเก่าที่มีรูป + caption → caption เดิมยังอยู่ แก้ในที่ได้
      บันทึกแล้วหน้า public แสดงเหมือนเดิม
  [ ] บทความเก่าที่ไม่มี data-width แสดงผลหน้า public เหมือนเดิมทุกพิกเซล
  [ ] บทความ MARKDOWN เดิมยังเปิดแก้และแสดงผลได้ (ห้ามพังไปกับ node ใหม่)
  [ ] ลากรูปมาวาง → ขึ้น placeholder → upload เสร็จ → เป็น figure ที่มี mediaId
      และรูปนั้นโผล่ในคลังสื่อ /admin/media ด้วย
  [ ] paste จาก Word แล้วหัวข้อ/ย่อหน้า/list ไม่หาย และไม่มี style/class
      หลุดเข้า DB
  [ ] บทความที่มี FAQ block → JSON-LD หน้า public มี FAQPage และข้อ
      "มีบล็อก FAQ" ในแผง SEO ขึ้นผ่าน
  [ ] คะแนน SEO ที่คำนวณฝั่ง client ยังตรงกับฝั่ง server เป๊ะ
  [ ] Lighthouse หน้าบทความ public ยังได้ SEO 100
  [ ] CLS ของหน้าบทความไม่แย่ลงจากรูป wide/full (วัดก่อน-หลัง)
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
| ขีดเส้นใต้ในเนื้อหา | ปิดทิ้ง (`underline: false`) | prose-article ใช้ underline เป็นสัญญะของลิงก์อยู่แล้ว ขีดเส้นใต้ข้อความธรรมดาจะอ่านเป็นลิงก์ที่กดไม่ได้ |
| ขีดฆ่า | เก็บไว้ + เพิ่ม `s` ใน ALLOWED_TAGS (คง `del` ไว้ด้วย) | `del` คือสิ่งที่ marked แปลง `~~x~~` ออกมา บทความ MARKDOWN เดิมต้องไม่พัง |
| caption ของรูป | เนื้อหาของ node (`content: "inline*"`) ไม่ใช่ attribute | แก้ caption ในที่ได้ และ HTML ที่เก็บใน DB เป็น `<figcaption>` อยู่แล้ว จึงไม่ต้อง migrate |
| ความกว้างรูป | `data-width` แยกจาก `data-align` | ความกว้างกับตำแหน่งเป็นสองเรื่อง ล็อกรวมกันแล้วจัดรูปแบบที่ต้องการไม่ได้ |
| บล็อกสำเร็จรูป | แทนด้วย tag ที่ allowlist รับอยู่แล้ว + `data-*` เท่านั้น | ขยาย allowlist ให้รับ `div`/`class`/`style` คือเปิดช่อง XSS กลับมาเพื่อความสวยงาม |
