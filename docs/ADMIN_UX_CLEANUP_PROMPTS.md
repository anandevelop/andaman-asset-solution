# Admin UX Cleanup — ลดความซ้ำซ้อนในหลังบ้าน

ต่อจาก `docs/ADMIN_IA_BLUEPRINT.md` + `docs/ADMIN_IA_PROMPTS.md` (ยุบเมนู section เข้า `/admin/pages` เสร็จแล้ว)
รอบนี้แก้ **งานเดียวกันที่ยังกระจายอยู่หลายที่** · Mockup: `Claude outputs/admin-ux-redesign-mockup.html`

**เป้าหมาย:** Sidebar ของ SUPER_ADMIN จาก **19 → 14** เมนู และทุกงานมี "ที่เดียว" ให้ไป

---

## วิธีใช้

แต่ละเฟสด้านล่างคือ **คำสั่งที่ copy ไปวางใน Claude Code ได้ทั้งก้อน** (ส่วนที่อยู่ใต้หัวข้อ "คำสั่ง")
ทำทีละเฟส หนึ่งเฟส = หนึ่ง branch = หนึ่ง PR · เรียงตามความเสี่ยงจากน้อยไปมาก

| # | เฟส | ลดเมนู | ประเมิน | ความเสี่ยง |
|---|---|---|---|---|
| 1 | Dashboard เหลือแค่ "งานวันนี้" — กราฟย้ายไปรายงาน | 0 | 0.5–1 วัน | ต่ำ |
| 2 | รวม "คำแปล" เข้า "ตรวจและเผยแพร่" | −1 | 1 วัน | ต่ำ |
| 3 | SEO hub เดียว (แท็บ + ย้ายค่าเริ่มต้นจากตั้งค่า) | 0 | 1 วัน | ต่ำ |
| 4 | ย้ายเนื้อหาหน้าเว็บออกจาก "ตั้งค่า" | 0 | 1–2 วัน | กลาง |
| 5 | Workspace โครงการ (ความคืบหน้า / โบรชัวร์ / ผัง) | −2 | 2 วัน | กลาง |
| 6 | CRM: นัดหมายเป็นมุมมองของลูกค้า + ซ่อนโหมดมือถือบนเดสก์ท็อป | −2 | 1 วัน | กลาง |
| 7 | แยกกลุ่มเมนู "การตลาด" / "ระบบ" + เปลี่ยนชื่อเมนู | 0 | 0.5 วัน | ต่ำ |
| 8 | แผง SEO component เดียว (refactor) | 0 | 2–3 วัน | กลาง |
| 9 | *(ไม่บังคับ)* หน้าแรกแบบ page builder | 0 | 3–4 วัน | สูง |

**ถ้าเวลาจำกัด:** ทำเฟส 1 + 2 + 5 + 7 ก็เห็นผลชัดที่สุดแล้ว (เมนูลด 5 ตัว, Dashboard ไม่ซ้ำรายงาน)

---

## กติกาที่ใช้กับทุกเฟส (แปะไว้ท้ายทุกคำสั่งแล้ว)

- อ่าน `AGENTS.md` ก่อนเริ่ม · `npm run verify` ต้องผ่านก่อนรายงานว่าเสร็จ
- เฟสที่ย้าย route (3, 4, 5, 6) ต้องรัน `npm run test:e2e` ด้วย — **หยุด `npm run dev` ก่อน**
- ข้อความใหม่ต้องเพิ่มครบ 4 ไฟล์ `messages/{th,en,zh,ru}.json` (next-intl throw ตอน render ถ้าขาด)
- โครงสร้างเมนูแก้ที่ `lib/admin/nav.ts` เท่านั้น แล้วอัปเดต `tests/admin/nav.test.ts`
- **URL ที่ย้ายต้องมี redirect** ใน `next.config.js` → `redirects()` (permanent) และใส่ path เดิมใน `alias` ของ nav item เพื่อให้ไฮไลต์ถูก
- **ห้ามเปลี่ยน schema / ข้อมูลใน DB** — รอบนี้ย้ายแค่ UI (SiteSetting key เดิมทั้งหมด)
- ห้ามลดสิทธิ์ของ role ใด ๆ: guard ของหน้าที่ย้ายต้องเท่าเดิมหรือเข้มกว่าเท่านั้น
- เจอปัญหานอกขอบเขตเฟส → **รายงาน ห้ามแก้**
- หลังย้าย route ให้ `grep` path เดิมทั่ว `app components lib tests e2e` แล้วแก้ลิงก์ที่ hard-code ไว้ (เช่น `lib/media-usage.ts`, `lib/seo-audit.ts`, `ProjectsTable.tsx`, `MobileTabBar.tsx`, `command-search-actions.ts`)

---

## ต้องตัดสินใจก่อนเริ่ม

1. **เฟส 6 — โหมดมือถือ (`/admin/m`)**: ข้อเสนอคือ *เก็บหน้า /m ไว้* แต่แสดงเมนูนี้เฉพาะใน drawer มือถือ (ไม่ขึ้นใน rail เดสก์ท็อป) — ถ้าอยากให้ redirect อัตโนมัติตามขนาดจอ บอกก่อน
2. **เฟส 4 — หน้า "ติดต่อเรา"**: ใครแก้ได้? ตอนนี้ `settings/contact` อยู่โซน system (ADMIN+) ถ้าย้ายเข้า Pages ข้อเสนอคือ **คง ADMIN+ ไว้สำหรับเขียน** และให้ EDITOR/VIEWER อ่านได้ — ถ้าอยากให้ EDITOR แก้ได้ด้วย ต้องบอก
3. **เฟส 9** จะทำหรือไม่ (เป็นการเปลี่ยนวิธีทำงานของทีมคอนเทนต์)

---

## เฟส 1 — Dashboard เหลือแค่ "งานวันนี้"

**ปัญหา:** `app/[locale]/admin/page.tsx` (737 บรรทัด) แสดงรายงานชุดเดียวกับ `(growth)/analytics/page.tsx`
ได้แก่ `reports.monthly`, `reports.sources`, `reports.pipeline`, `reports.conversion` และมี `reports.rsvp`, `reports.cookieConsent`, `reports.localeCompleteness` เพิ่ม
ตัวเลือกช่วงเวลา + ปุ่ม Export (`DashboardControls`) อยู่ที่ Dashboard แต่หน้า Analytics ไม่มี Export

### คำสั่ง

```
งาน: ทำให้ Dashboard (/admin) เป็นหน้า "งานวันนี้" อย่างเดียว และให้หน้า Analytics เป็นที่เดียวของรายงาน

1. อ่าน app/[locale]/admin/page.tsx และ app/[locale]/admin/(growth)/analytics/page.tsx + components/admin/AnalyticsTabs.tsx
   ทำตารางว่ารายงานไหนอยู่หน้าไหนบ้าง ก่อนแก้
2. Dashboard คงไว้:
   - header ทักทาย + subtitle (ไม่ต้องมีตัวเลือกช่วงเวลา)
   - work queue 4 การ์ด (unassigned / appointments today / overdue / review queue) — การ์ดแต่ละใบต้องเป็นลิงก์ไปหน้าที่ทำงานนั้นได้เลย
   - "คิวงานของฉัน" (ถ้ามีข้อมูลอยู่แล้วใน lib/dashboard-queue.ts)
   - สรุปเดือนนี้ 3 ตัวเลข (ลีดใหม่ / นัดชม / จอง) + ลิงก์ "ดูรายงานเต็ม" ไป /admin/analytics
3. ลบออกจาก Dashboard: monthly, sources, pipeline, conversion, rsvp, cookieConsent, localeCompleteness
   - ถ้ารายงานไหนยังไม่มีใน Analytics (น่าจะเป็น rsvp, cookieConsent) ให้ย้ายไปเป็นแท็บ/การ์ดใน Analytics ก่อนลบ ห้ามหายไปจากระบบ
   - localeCompleteness ไม่ต้องย้าย — เฟส 2 จะไปอยู่ที่หน้าเผยแพร่
4. ย้าย DashboardControls (range + export) ไปไว้ใน header ของหน้า Analytics
   - Analytics ต้องรับ ?range= แบบเดียวกับที่ Dashboard รับอยู่
   - endpoint export เดิมใช้ต่อ ห้ามเขียนใหม่
5. VIEWER / EDITOR / SALES ที่เปิด Dashboard ต้องไม่เห็นลิงก์ "ดูรายงานเต็ม" ถ้าเข้า Analytics ไม่ได้ (ใช้ canSee จาก lib/admin/nav.ts)
6. ลบ query ที่ Dashboard ไม่ใช้แล้ว เพื่อให้หน้าโหลดเร็วขึ้น และลบ message key ที่ไม่มีใครใช้แล้ว (ทั้ง 4 ภาษา)

ตรวจรับ:
- ไม่มีกราฟใดแสดงซ้ำระหว่าง /admin และ /admin/analytics
- ทุกรายงานที่เคยมี ยังหาเจอได้ใน /admin/analytics
- npm run verify ผ่าน

(กติกาทั่วไป: ดูหัวข้อ "กติกาที่ใช้กับทุกเฟส" ใน docs/ADMIN_UX_CLEANUP_PROMPTS.md)
```

---

## เฟส 2 — รวม "คำแปล" เข้า "ตรวจและเผยแพร่"

**ปัญหา:** เรื่องภาษาอยู่ 3 ที่ — เมนู `seoTranslations` (`/admin/seo/translations`), เมนู `publishing` ชื่อ "การเผยแพร่และภาษา", การ์ดใน Dashboard
และ `/seo/translations` ต้องมี `ROUTE_EXCEPTIONS` ใน `(growth)/layout.tsx` เพราะมันไม่ใช่งาน growth ตั้งแต่แรก

### คำสั่ง

```
งาน: ย้ายหน้ารายงานคำแปลจาก /admin/seo/translations ไปเป็นแท็บของหน้า Publishing

1. สร้าง tab strip ให้ /admin/publishing ด้วย PageTabs + NAV_TAB_GROUPS ใน lib/admin/nav.ts:
   publishing: [ queue (""), translations ("/translations"), history ("/history" — ถ้า revision panel แยกเป็นหน้าได้ง่าย ไม่งั้นข้ามไปก่อน) ]
2. ย้ายไฟล์ app/[locale]/admin/(growth)/seo/translations/page.tsx
   → app/[locale]/admin/(content)/publishing/translations/page.tsx
   - guard ของหน้า: requireAdmin(locale, Role.EDITOR) เหมือนเดิม (โซน content มี floor เป็น VIEWER ต้องกันเองในหน้า)
   - ย้าย api/admin/seo/translations/export ไม่ต้อง แค่แก้ลิงก์ปุ่ม export ให้ถูก
3. ลบ { prefix: "/seo/translations", ... } ออกจาก ROUTE_EXCEPTIONS ใน (growth)/layout.tsx
   ถ้า ROUTE_EXCEPTIONS ว่าง ให้คงกลไกไว้ (array ว่าง) และอัปเดต tests/admin/growth-route-exceptions.test.ts
4. lib/admin/nav.ts: ลบ item "seoTranslations" ออกจาก sidebar
   ให้ badge บนเมนู publishing = reviewQueue (เหมือนเดิม) — ห้ามรวมจำนวนคำแปลเข้า badge
5. เปลี่ยนชื่อเมนู admin.nav.publishing:
   th "ตรวจและเผยแพร่" · en "Review & publish" · zh/ru แปลให้ตรงความหมาย
6. redirect: /:locale/admin/seo/translations → /:locale/admin/publishing/translations
7. ใน TranslationStatusBadges (ที่ใช้อยู่ ~12 หน้า) ถ้ามีจุดให้กด ให้ลิงก์ไปที่แท็บ translations ที่กรองรายการนั้นไว้
8. ลบการ์ด localeCompleteness ออกจาก Dashboard (ถ้าเฟส 1 ยังไม่ลบ)

ตรวจรับ:
- EDITOR เข้า /admin/publishing/translations ได้, VIEWER เห็นแท็บนี้ก็ต่อเมื่อเข้าได้จริง (visibleTabs)
- URL เก่า redirect ถูก, sidebar ไม่มี "คำแปล" แล้ว
- npm run verify + npm run test:e2e ผ่าน
```

---

## เฟส 3 — SEO hub เดียว

**ปัญหา:** `/admin/seo` เข้า keywords / links ได้จากปุ่มในหน้าเท่านั้น, `/admin/seo/urls` ไม่มีทางเข้าที่ชัด
และ "ค่าเริ่มต้น SEO" (title template, OG default, Search Console) อยู่ที่ `/admin/settings/seo` แยกโซน

### คำสั่ง

```
งาน: ทำให้ /admin/seo เป็น hub เดียวของ SEO ระดับทั้งเว็บ

1. สร้าง app/[locale]/admin/(growth)/seo/layout.tsx ที่วาด PageTabs:
   overview ("") · keywords ("/keywords") · links ("/links") · urls ("/urls") · defaults ("/defaults")
   ประกาศใน NAV_TAB_GROUPS ของ lib/admin/nav.ts (roles ADMIN_UP)
2. ลบปุ่ม keywords / links ออกจาก header ของ seo/page.tsx (แท็บแทนแล้ว)
3. ย้าย app/[locale]/admin/(system)/settings/seo/page.tsx → app/[locale]/admin/(growth)/seo/defaults/page.tsx
   - ใช้ SettingsForm + action เดิม (อย่าคัดลอก action — import หรือย้ายไฟล์ actions ไปด้วย)
   - ตรวจว่า revalidatePath ใน action ยังชี้ path ที่ถูก
4. ลบ entry "seo" ออกจาก SettingsNav (components/admin/SettingsNav.tsx)
5. redirect: /:locale/admin/settings/seo → /:locale/admin/seo/defaults
6. แก้ href ใน lib/seo-audit.ts ที่ชี้ "/admin/settings/seo" → "/admin/seo/defaults"
7. แต่ละ issue ใน overview ต้องมีปุ่ม "แก้ใน<ประเภท>" ที่พาไปหน้าแก้ไขของรายการนั้น (แท็บ SEO ของโครงการ / ฟอร์มข่าว ฯลฯ) ถ้ามีข้อมูล href อยู่แล้ว

ตรวจรับ:
- ทุกหน้าที่เกี่ยวกับ SEO ระดับทั้งเว็บ เข้าได้จากแท็บของ /admin/seo
- ตั้งค่าเหลือ 6 แท็บ, ค่า SEO ที่บันทึกไว้เดิมยังแสดงและบันทึกได้
- npm run verify + npm run test:e2e ผ่าน
```

---

## เฟส 4 — ย้ายเนื้อหาหน้าเว็บออกจาก "ตั้งค่า"

**ปัญหา:**
- `settings/company` (`CompanyProfileForm`) แก้ aboutUs, รูป Hero ของ About, story eyebrow/title/image, foundedYear → เป็น **เนื้อหาหน้า About** ซ้ำกับ `/admin/pages/about`
- `settings/contact` มีที่อยู่ 4 ภาษา + เวลาทำการ 4 ภาษาเป็น **8 ช่องแยก** ไม่ได้ใช้ `LanguageTabs` เหมือนหน้าอื่น และ blueprint §2.1 วางไว้ว่าต้องมี tab `contact` ใต้ Pages (ยังไม่ได้ทำ — ดู comment ใน `NAV_TAB_GROUPS.pages`)

### คำสั่ง

```
งาน: ย้ายเนื้อหาของหน้า About และ Contact ออกจาก Settings ไปไว้ใต้ /admin/pages

A) เรื่องราวบริษัท
1. เพิ่มแท็บ "story" เป็นแท็บแรกของ NAV_TAB_GROUPS.pagesAbout (segment "/story")
2. ย้าย app/[locale]/admin/(system)/settings/company/{page,actions}.tsx → app/[locale]/admin/(content)/pages/about/story/
   - ใช้ CompanyProfileForm เดิม · guard ใช้แบบเดียวกับแท็บอื่นใน pages/about (canWrite fieldset)
   - แต่ action ต้องเช็คสิทธิ์เขียนเท่าเดิมหรือเข้มกว่า (ตอนนี้ ADMIN+) — ถ้าแท็บอื่นใน About ให้ EDITOR เขียนได้ ให้ถามก่อนลดเป็น EDITOR (ดู "ต้องตัดสินใจก่อนเริ่ม" ข้อ 2)
   - pages/about/page.tsx redirect ไป ./story แทน ./corporate
3. ถ้าใน company มีฟิลด์ที่ไม่ใช่เนื้อหาหน้าเว็บ (เช่น ชื่อนิติบุคคล / เลขภาษี) ให้คงไว้ใน Settings เป็นแท็บ "บริษัท" ที่เหลือแค่ฟิลด์เหล่านั้น — ถ้าไม่มีเลย ให้ลบแท็บ company ออกจาก SettingsNav

B) หน้าติดต่อเรา
4. เพิ่ม { key: "contact", segment: "/contact" } ใน NAV_TAB_GROUPS.pages (ระหว่าง about กับ faq) และลบ comment "No contact tab yet"
5. สร้าง app/[locale]/admin/(content)/pages/contact/page.tsx:
   - โทรศัพท์ / WhatsApp / อีเมล / แผนที่ / โซเชียล = ฟิลด์ปกติ
   - ที่อยู่ + เวลาทำการ ใช้ LanguageTabs (TH | EN | ZH | RU) แทน 8 ช่อง — SiteSetting key เดิม (contact.addressTh ฯลฯ) ห้ามเปลี่ยน
   - ใช้ action เดิมของ settings (import) ห้ามเขียนซ้ำ
6. ลบ settings/contact ออกจาก SettingsNav

C) ทั้งสองส่วน
7. redirect: /settings/company → /pages/about/story, /settings/contact → /pages/contact
8. settings/page.tsx redirect ไปแท็บแรกที่เหลือ (notifications)
9. ตรวจ revalidatePath / revalidateTag ใน actions ว่ายังล้าง cache ของหน้าสาธารณะที่ถูกต้อง

ตรวจรับ:
- Settings เหลือ: notifications · integrations · privacy · system (+ company ถ้ามีฟิลด์นิติบุคคลเหลือ)
- แก้ที่อยู่ภาษาจีนใน /admin/pages/contact แล้วหน้า /zh/contact เปลี่ยนตาม
- สิทธิ์เขียนของทุกฟิลด์เท่าเดิม (มีเทส)
- npm run verify + npm run test:e2e ผ่าน
```

---

## เฟส 5 — Workspace โครงการ

**ปัญหา:**
- แท็บ "ความคืบหน้า" ใน `ProjectHubTabs` ลิงก์ออกไป `/admin/progress/[projectId]` → เมนูซ้ายไฮไลต์เปลี่ยน, breadcrumb หลุด
- `projects/[id]/site-plan` **ไม่มีลิงก์จากที่ไหนในหลังบ้านเลย**
- `unit-types` กับ `units` แยก 2 แท็บ ทั้งที่ทำงานต่อเนื่องกัน
- E-Brochure มี `projectId` แต่เป็นเมนูแยกระดับบนสุด
- `ProjectForm` มี hidden input metaTitle/metaDescription (SEO จริงอยู่แท็บ SEO) — เสี่ยงเขียนทับ

### คำสั่ง

```
งาน: ทำให้ทุกอย่างของโครงการอยู่ใต้ /admin/projects/[id]/… และลดเมนู "ความคืบหน้า" + "อีโบรชัวร์" ออกจาก sidebar

1. ย้าย app/[locale]/admin/(catalog)/progress/[projectId]/page.tsx → app/[locale]/admin/(catalog)/projects/[id]/progress/page.tsx
   - แก้ ProjectHubTabs ให้แท็บ progress ชี้ /projects/[id]/progress
   - redirect: /:locale/admin/progress/:projectId → /:locale/admin/projects/:projectId/progress
   - แก้ลิงก์ใน ProjectsTable.tsx, lib/media-usage.ts และทุกที่ที่ grep เจอ
2. แท็บ "แบบบ้าน ยูนิต และผัง": รวม unit-types, units, site-plan เป็นแท็บเดียวใน ProjectHubTabs
   - ง่ายสุด: คง 3 route เดิม แต่ ProjectHubTabs แสดงเป็นแท็บเดียว (key "units") ที่ active เมื่อ path เป็น 1 ใน 3
     แล้วใต้แท็บมี segmented control: ผังโครงการ | รายการยูนิต | แบบบ้าน ลิงก์ไป 3 route
   - site-plan ต้องเข้าถึงได้แล้ว (ตอนนี้ไม่มีลิงก์)
3. เพิ่มแท็บ "อีโบรชัวร์" ใน ProjectHubTabs → /projects/[id]/brochures แสดงรายการ EBrochure ที่ projectId ตรง + ปุ่มสร้างใหม่ที่ prefill projectId
   (ฟอร์มแก้ไขใช้ route e-brochures/[id]/edit เดิม)
4. หน้ารายการ /admin/projects: เพิ่ม tab strip ระดับรายการ (NAV_TAB_GROUPS.projects):
   โครงการ ("") · ความคืบหน้าประจำเดือน ("/progress" → ใช้ /admin/progress เดิม) · อีโบรชัวร์ทั้งหมด (→ /admin/e-brochures เดิม)
   เพื่อให้งาน cross-project ยังมีที่อยู่ โดยไม่ต้องเป็นเมนูใน sidebar
5. lib/admin/nav.ts: ลบ item progress และ eBrochures ออกจาก sidebar แล้วเพิ่ม alias ["/progress", "/e-brochures"] ให้ item projects
6. ProjectForm: ลบ hidden input metaTitle/metaDescription ถ้า action ของ edit ไม่จำเป็นต้องได้รับ (ตรวจ action ว่าไม่ได้ set เป็นค่าว่างเมื่อไม่มีฟิลด์ — ถ้าจำเป็น ให้ action ไม่แตะฟิลด์ SEO แทน)
7. (ถ้าเวลาพอ) แผง "ความพร้อมของโครงการ" ด้านขวาของ workspace: รวม locale completeness + มี hero/gallery + มี unit type + SEO ครบ + ความคืบหน้าเดือนนี้ — อ่านจาก lib ที่มีอยู่ ห้ามสร้าง query ใหม่ที่หนัก

ตรวจรับ:
- เปิดทุกแท็บของโครงการแล้ว sidebar ไฮไลต์ "โครงการ" ตลอด และ URL ขึ้นต้นด้วย /projects/[id]
- site-plan เข้าได้จาก UI
- bookmark เก่า /admin/progress/xxx ยังใช้ได้
- npm run verify + npm run test:e2e ผ่าน
```

---

## เฟส 6 — CRM: นัดหมาย + โหมดมือถือ

**ปัญหา:** "นัดชมโครงการ" เป็นเมนูแยกจาก "รายชื่อผู้สนใจ" ทั้งที่นัดหมายผูกกับลีด (สร้างนัดได้จาก `LeadActivityComposer` อยู่แล้ว)
"โหมดมือถือ" (`/admin/m`) เป็นเมนูใน rail เดสก์ท็อป ทั้งที่ออกแบบมาใช้บนมือถือ

### คำสั่ง

```
งาน: รวม Leads กับ Appointments เป็นเมนูเดียว "ลูกค้าและนัดหมาย" และซ่อนโหมดมือถือจาก rail เดสก์ท็อป

1. NAV_TAB_GROUPS.leads: รายการ/บอร์ด ("" — LeadViewToggle เดิมคุม list/board อยู่แล้ว) · ปฏิทินนัดหมาย ("/appointments" → ชี้ route /admin/appointments เดิม)
   - PageTabs ต้องอยู่ทั้งใน leads/page.tsx และ appointments/page.tsx
   - ย้าย badge appointmentsToday ไปเป็น badge บนแท็บ ปฏิทินนัดหมาย
2. lib/admin/nav.ts:
   - ลบ item appointments ออกจาก sidebar, เพิ่ม alias "/appointments" ให้ item leads
   - badge ของ leads = newLeads เหมือนเดิม
   - เปลี่ยนชื่อ admin.nav.leads → th "ลูกค้าและนัดหมาย" / en "Leads & appointments" (+ zh, ru)
   - URL ไม่ต้องเปลี่ยน ไม่ต้องมี redirect
3. โหมดมือถือ: เพิ่ม field ใน NavItem เช่น `mobileOnly?: boolean` แล้วตั้งให้ mobileView
   - AdminSidebar: rail เดสก์ท็อปไม่วาด item ที่ mobileOnly, drawer มือถือวาด (และวางไว้บนสุดของกลุ่ม sales)
   - CommandK ยังค้นเจอได้
   - ห้ามลบ route /admin/m หรือ component mobile/*
4. ตัวกรองของ leads (LeadFilters) ถ้ามีฟิลด์ที่ใช้กับนัดหมายได้ (project, assignee) ให้ appointments อ่าน query string ชุดเดียวกัน เพื่อสลับแท็บแล้วตัวกรองไม่หาย — ถ้าต้องแก้เยอะ ให้รายงานแทน

ตรวจรับ:
- SALES เห็นเมนู "ลูกค้าและนัดหมาย" และ "ทีมขาย" บนเดสก์ท็อป (ไม่มีโหมดมือถือ) และเห็นโหมดมือถือใน drawer บนจอเล็ก
- ไฮไลต์ถูกเมื่ออยู่ที่ /admin/appointments
- nav.test.ts ครอบ mobileOnly
- npm run verify + npm run test:e2e ผ่าน
```

---

## เฟส 7 — กลุ่มเมนูและชื่อเมนู

**ปัญหา:** กลุ่ม `administration` ("ผู้ดูแลระบบ") มี SEO + สถิติ ปนกับ ตั้งค่า/ผู้ใช้/ประวัติ
comment ใน `lib/admin/nav.ts` ระบุไว้แล้วว่าจะ rename group key (`projects → properties`, `administration → system`, เพิ่ม `growth`)

### คำสั่ง

```
งาน: จัดกลุ่ม sidebar ใหม่ให้เป็นตามงาน (ทำหลังเฟส 2, 5, 6)

เป้าหมาย sidebar (SUPER_ADMIN):
  overview:   งานวันนี้ (dashboard)
  sales:      ลูกค้าและนัดหมาย · ทีมขาย  (+ โหมดมือถือ เฉพาะ drawer)
  properties: โครงการ
  content:    หน้าเว็บไซต์ · ข่าวสาร · กิจกรรม · คลังสื่อ · ตรวจและเผยแพร่
  growth:     SEO · รายงานและสถิติ
  system:     ตั้งค่า · ผู้ใช้งาน · ประวัติการใช้งาน
  = 14 รายการ

1. NavGroupKey: เปลี่ยน projects → properties, administration → system, เพิ่ม growth
   ย้าย seo + analytics ไป growth
2. messages ทั้ง 4 ไฟล์: admin.navGroups.{sales,properties,content,growth,system}
   th: งานขาย · โครงการ · เนื้อหาเว็บไซต์ · การตลาด · ระบบ
3. admin.nav: dashboard → th "งานวันนี้", analytics → th "รายงานและสถิติ"
4. ลบ comment ใน nav.ts ที่บอกว่ายังไม่ได้ rename
5. อัปเดต tests/admin/nav.test.ts: จำนวนเมนูต่อ role (SUPER_ADMIN 14, ADMIN = ไม่มี users/activity, EDITOR, SALES, VIEWER) — เขียนเป็นตารางคาดหวัง

ตรวจรับ: npm run verify ผ่าน · ภาพหน้าจอ sidebar ของแต่ละ role แนบใน PR
```

---

## เฟส 8 — แผง SEO component เดียว

**ปัญหา:** มีตัวแก้ SEO รายหน้า 3 แบบ: `PageSeoEditor` (โครงการ), `NewsSeoPanel` (ข่าว, 896 บรรทัด), `SeoPreviewFields` (กิจกรรม) — หน้าตาและกติกาไม่เหมือนกัน

### คำสั่ง

```
งาน: ทำให้ทุกหน้าแก้ไขเนื้อหาใช้แผง SEO หน้าตาและพฤติกรรมเดียวกัน (refactor ล้วน ข้อมูลเดิม)

1. อ่านทั้ง 3 component + OgPreviewCard + SlugField + lib/seo-limits.ts แล้วสรุปความต่าง (ฟิลด์, validation, preview, keyword/LSI) ใน PR description ก่อนเขียนโค้ด
2. สร้าง components/admin/seo/SeoPanel.tsx ที่มี:
   - title / description / (slug ถ้าส่งมา) / OG image / Google preview / ตัวนับความยาวจาก seo-limits
   - ส่วน focus keyword + LSI เป็น optional slot (ข่าวใช้, ที่อื่นยังไม่ใช้)
   - รองรับหลายภาษาผ่าน LanguageTabs
3. เปลี่ยนทีละหน้า: กิจกรรม → โครงการ → ข่าว (ข่าวซับซ้อนสุด ทำท้าย) หนึ่ง commit ต่อหน้า
4. ห้ามเปลี่ยนชื่อ field ที่ส่งเข้า action (name="metaTitle" ฯลฯ) — action ไม่ต้องแก้
5. ลบ component เดิมเมื่อไม่มีใครใช้แล้ว

ตรวจรับ: ค่า SEO ที่มีอยู่แสดงครบทุกภาษาในทั้ง 3 หน้า, บันทึกแล้วค่าเท่าเดิม (เขียนเทส), npm run verify + test:e2e ผ่าน
```

---

## เฟส 9 *(ไม่บังคับ)* — หน้าแรกแบบ page builder

**ปัญหา:** `/admin/pages/home` มีแท็บ sections (จัดลำดับ/ซ่อน) แยกจาก hero / gallery / cta (แก้เนื้อหา) — ต้องสลับไปมา
ดู mockup หน้า "หน้าเว็บไซต์"

### คำสั่ง

```
งาน: ออกแบบ /admin/pages/home ใหม่เป็นหน้าจอเดียว — ซ้าย = รายการ section (ลากจัดลำดับ, สวิตช์ซ่อน/แสดง), ขวา = ฟอร์มแก้ section ที่เลือก

ขั้นแรก *ยังไม่เขียนโค้ด*: อ่าน lib/home-sections.ts, pages/home/{sections,hero,gallery,cta}/ และ components ที่เกี่ยวข้อง
แล้วเขียนแผนสั้น ๆ ว่า
- section ไหนมีฟอร์มให้แก้ (hero, gallery, cta, …) และ section ไหนดึงข้อมูลอัตโนมัติ (featured projects, latest news) → แสดงเป็น "อัตโนมัติ" + ลิงก์ไปแหล่งข้อมูล
- state ของ section ที่เลือกเก็บใน URL (?section=hero) เพื่อ refresh แล้วไม่หาย
- route เดิม /pages/home/{hero,gallery,cta} จะ redirect ไป ?section=… อย่างไร
หยุดรอให้ยืนยันแผนก่อนลงมือ
```

---

## หลังจบทั้งหมด

- อัปเดต `docs/ADMIN_GUIDE.md` ให้ตรงกับเมนูใหม่ (คู่มือผู้ใช้)
- อัปเดตสถานะใน `docs/ADMIN_IA_BLUEPRINT.md` ว่าหัวข้อไหน implement แล้ว
- เช็ค CommandK (`components/admin/CommandK.tsx`) ว่าค้นเจอทุกแท็บใหม่ (ความคืบหน้า, ปฏิทินนัดหมาย, คำแปล, ค่าเริ่มต้น SEO, ติดต่อเรา)
