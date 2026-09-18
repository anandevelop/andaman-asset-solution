# Admin IA Blueprint — Andaman Asset Solution

> **สถานะ: ข้อเสนอ (proposal) ยังไม่ถูก implement**
> เอกสารนี้เป็นผลจากการ audit โค้ดจริงใน repo ณ วันที่ 2026-09-10
> ไฟล์อ้างอิงหลัก: `components/admin/AdminSidebar.tsx`, `lib/permissions.ts`,
> `lib/role-rank.ts`, `lib/admin/guard.ts`, `app/[locale]/admin/**`

---

## 0. TL;DR

| | ก่อน | หลัง |
|---|---|---|
| ลิงก์ระดับบนสุดใน Sidebar (SUPER_ADMIN) | **26** | **18** |
| ลิงก์ที่ EDITOR เห็น | **20** | **11** |
| ลิงก์ที่ SALES เห็น | 5 | 5 |
| กลุ่มเมนู | 5 | 6 |
| เมนูกลุ่ม "Website Content" | **12** | **5** |
| เมนูระดับ Component (Hero/Why Us/Awards/CTA/...) ใน Sidebar หลัก | **9** | **0** (ย้ายเป็น Tab) |

**หัวใจของการแก้:** Sidebar ควรมีแค่ **"สิ่งที่เป็นก้อนข้อมูล" (Entity)** เท่านั้น
ส่วน **"ชิ้นส่วนของหน้าเว็บ" (Section/Component)** ต้องอยู่ใน Workspace ของหน้านั้น ๆ ในรูปแบบ Tab

---

## 1. Audit — สภาพปัจจุบัน

### 1.1 โครงสร้างที่มีอยู่

`NAV_GROUPS` + `ADMIN_NAV_GROUP` ใน `AdminSidebar.tsx` รวม **26 ลิงก์ / 5 กลุ่ม**

| กลุ่ม | จำนวน | รายการ |
|---|---|---|
| (ไม่มีหัวข้อ) | 1 | Dashboard |
| Sales & Leads | 5 | Leads, Appointments, Events, Sales Team, Mobile view |
| Projects & Progress | 3 | Projects, Progress, E-Brochures |
| **Website Content** | **12** | Home Builder, Hero Banner, Home Gallery, Closing CTA, Media, Corporate Services, Why Us, Mission & Principles, Awards, Milestones, News, FAQ |
| Administration | 5 | Publishing, SEO, Settings, Users, Activity |

### 1.2 จำแนกลิงก์ตาม "ระดับความเป็นข้อมูล"

นี่คือรากของปัญหา — ลิงก์ 3 ระดับที่ต่างกันโดยสิ้นเชิงถูกวางเรียงกันในระนาบเดียว

| ระดับ | นิยาม | ตัวอย่างในระบบ | ควรอยู่ที่ |
|---|---|---|---|
| **L1 — Entity / Collection** | ก้อนข้อมูลที่มี list + detail + URL สาธารณะของตัวเอง | Projects, News, Events, E-Brochures, Leads, Media | Sidebar |
| **L2 — Page** | หน้าเว็บสาธารณะ 1 หน้า | Home, About, Contact, FAQ | Sidebar (ใต้ hub เดียว) |
| **L3 — Section / Component** | บล็อกเนื้อหาใน L2 แก้แล้วมีผลกับหน้าเดียว | Hero Banner, Home Gallery, Closing CTA, Why Us, Mission, Awards, Milestones, Corporate | **Tab ในหน้า L2** ไม่ใช่ Sidebar |

ปัจจุบัน **L3 จำนวน 8 รายการ** ถูกวางไว้ระนาบเดียวกับ L1 → Sidebar ยาว รก และไม่มี mental model

### 1.3 ปัญหาที่พบ (พร้อมหลักฐานจากโค้ด)

#### P1 — Section-level ปนกับ Entity-level ⛔ สูง
`Hero Banner`, `Home Gallery`, `Closing CTA` แก้แค่หน้า Home
`Why Us`, `Mission`, `Awards`, `Milestones`, `Corporate` แก้แค่หน้า About/Achievements
แต่ทั้ง 8 ตัวนั่งข้าง `News` และ `Media` ซึ่งเป็น collection จริง

ที่ตลกร้ายคือ **มี `/admin/home-builder` อยู่แล้ว** ซึ่งคุมลำดับ/การซ่อน 9 sections ของหน้า Home
(`lib/home-sections.ts`: `COMPANY_INTRO, VISION_MISSION, FEATURED_PROJECTS, CORPORATE, AWARDS, WHY_US, UPCOMING_EVENT, LATEST_NEWS, FAQ`)
→ **หน้า Home Builder รู้จัก section เหล่านี้อยู่แล้ว แต่ลิงก์แก้เนื้อหาของแต่ละ section กลับไปอยู่ใน Sidebar** ผู้ใช้ต้องเด้งไปมา

#### P2 — `minRole` ladder ขัดกับ `capability` → มีลิงก์ที่พาไปหน้าที่ถูกปฏิเสธ ⛔ สูง

```ts
// AdminSidebar.tsx
{ key: "mobileView", href: "/m", icon: Smartphone, minRole: Role.SALES }
```
```ts
// app/[locale]/admin/m/page.tsx
const session = await requireCapability(locale, "viewAllLeads");
```

`ROLE_RANK` กำหนด `EDITOR (2) > SALES (1)` ⇒ `hasRole(EDITOR, SALES) === true`
แต่ `PERMISSION_MATRIX.viewAllLeads.EDITOR === false`

**ผลลัพธ์: Content Editor เห็นเมนู "Mobile view" แต่กดแล้วโดนเด้งออก** ทุกครั้ง
(เป็นเคสเดียวกับที่ comment ในไฟล์เตือนไว้เองว่า *"a mismatch means either a role sees a link that denies them..."* — เตือนแล้วแต่ยังหลุด 1 ตัว)

#### P3 — `viewContent` เป็น capability ที่ไม่มีใครบังคับใช้ (dead capability) ⛔ สูง

`grep -rn '"viewContent"' app components lib` → **0 ผลลัพธ์** นอกจาก `lib/permissions.ts` เอง

`PERMISSION_MATRIX.viewContent` ให้ `VIEWER: true, SALES: true` และหน้า Users & Permissions ก็ **วาดตารางบอกผู้ใช้ว่า VIEWER ดูเนื้อหาได้**
แต่ทุกหน้า content ใช้ `requireAdmin(locale)` ซึ่ง default = `Role.EDITOR` ⇒ VIEWER เข้าไม่ได้สักหน้า

นี่คือ drift แบบเดียวกับที่ header ของ `lib/permissions.ts` สัญญาว่าจะป้องกัน:
> *"the screen cannot describe a rule the app does not enforce"*
ตอนนี้มันอธิบายกฎที่แอปไม่ได้บังคับใช้จริง

#### P4 — VIEWER เห็นแค่ Dashboard 🟡 กลาง
ผลพวงจาก P3 — role นี้แทบไร้ประโยชน์ ทั้งที่มีไว้ให้ผู้บริหาร/ผู้ตรวจสอบดูอย่างเดียว

#### P5 — Sales Team อยู่กลุ่ม Sales แต่ gate ที่ EDITOR 🟡 กลาง
`{ key: "salesTeam", href: "/sales-team", icon: Contact }` → ไม่ระบุ `minRole` ⇒ default `EDITOR`
`app/[locale]/admin/sales-team/page.tsx` → `requireAdmin(locale)` ⇒ `EDITOR`
⇒ **พนักงานขาย (SALES) มองไม่เห็นรายชื่อทีมขายของตัวเอง** ทั้งที่ลิงก์อยู่ใต้หัวข้อ "Sales & Leads"

#### P6 — ปุ่ม "สร้างใหม่" gate สูงกว่าหน้า list 🟡 กลาง
| หน้า list | guard | หน้า new | guard |
|---|---|---|---|
| `projects/page.tsx` | EDITOR | `projects/new/page.tsx` | **ADMIN** |
| `events/page.tsx` | EDITOR | `events/new/page.tsx` | **ADMIN** |

EDITOR เห็นปุ่ม "New project" ในหน้า list แล้วกดโดนเด้ง — ต้องซ่อนปุ่มด้วย capability เดียวกัน

#### P7 — SEO ถูกฝังอยู่ใน "Administration" ทั้งที่เว็บเน้น SEO เต็มรูปแบบ 🟡 กลาง
เว็บนี้มี 4 ภาษา (`th, en, zh, ru`), มี `app/sitemap.ts` (256 บรรทัด + hreflang alternates), `app/robots.ts`, JSON-LD ครบ 14 หน้า, `lib/seo-audit.ts`, `lib/seo-limits.ts`, `lib/redirects.ts`
แต่ในหลังบ้าน SEO = **1 ลิงก์เดียว** ที่นั่งอยู่ระหว่าง "Publishing" กับ "Settings"

#### P8 — มี Business Logic ที่เขียนเสร็จแล้วแต่ไม่มีหน้า UI 🟡 กลาง
| lib | มี | หน้า UI |
|---|---|---|
| `lib/locale-completeness.ts` | ✅ | ❌ ไม่มีหน้ารวม (ใช้แค่ inline) |
| `lib/analytics.ts` | ✅ | ❌ ไม่มีหน้า Analytics |
| `lib/reports.ts` | ✅ | ❌ |
| `lib/company-stats.ts` | ✅ | ❌ |
| `lib/media-usage.ts` | ✅ | ❌ ไม่มีรายงาน unused media / alt-text |
| `app/api/not-found/route.ts` | ✅ | ❌ ไม่มีรายงาน 404 → redirect |

---

## 2. IA ใหม่ — 6 กลุ่ม

หลักการจัดกลุ่ม: **จัดตาม "งานที่คนทำ" ไม่ใช่ "ตารางในฐานข้อมูล"**

| # | กลุ่ม | เมนู | Role ที่เห็น |
|---|---|---|---|
| — | *(Overview)* | Dashboard | ทุก role |
| 1 | **Sales & CRM** | Leads · Appointments · Sales Team · Mobile | ADMIN+, SALES |
| 2 | **Properties** | Projects · Construction Progress · E-Brochures | ADMIN+, EDITOR, VIEWER |
| 3 | **Website Content** | **Pages** · News · Events · Media Library · Publishing | ADMIN+, EDITOR, VIEWER |
| 4 | **SEO & Growth** | SEO · Analytics | ADMIN+ (Analytics เปิดให้ EDITOR) |
| 5 | **System** | Users & Permissions · Settings · Activity Log | SUPER_ADMIN / ADMIN |

### 2.1 การยุบ 12 → 5 ในกลุ่ม Website Content

```
เดิม (12 ลิงก์)                       ใหม่
─────────────────────────────────────────────────────────────────
Home Builder      ─┐
Hero Banner       ─┤                  ▸ Pages
Home Gallery      ─┤                     ├ Home     → tabs: Sections | Hero | Gallery | Closing CTA
Closing CTA       ─┘                     ├ About    → tabs: Corporate | Why Us | Mission | Awards | Milestones
Corporate Services─┐                     ├ Contact  → tabs: Info | Map & Hours | Form
Why Us            ─┤                     └ FAQ
Mission           ─┤
Awards            ─┤                  ▸ News
Milestones        ─┘                  ▸ Events         (tab: Registrations — gate viewCustomerContact)
FAQ               ──                  ▸ Media Library
News              ──                  ▸ Publishing
Media             ──
```

### 2.2 จำนวนเมนูที่แต่ละ role เห็น (ก่อน → หลัง)

| Role | ก่อน | หลัง | หมายเหตุ |
|---|---|---|---|
| SUPER_ADMIN | 26 | **18** | −31% |
| ADMIN | 26 | 18 | |
| EDITOR | 20 | **11** | −45% และไม่มีลิงก์หลอกอีกต่อไป (แก้ P2) |
| SALES | 5 | 5 | เห็น Sales Team ได้แล้ว (แก้ P5) |
| VIEWER | 1 | **10** | อ่านอย่างเดียว — ทำให้ `viewContent` มีความหมาย (แก้ P3/P4) |

---

## 3. Folder Structure (App Router)

ใช้ **Route Group** `(...)` เพื่อได้ `layout.tsx` ต่อโซนโดย **URL ไม่เปลี่ยน** —
สำคัญมากเพราะ guard ต่อโซนจะได้เขียนที่เดียว แทนที่จะ copy `requireAdmin()` ลงทุก page

```
app/[locale]/admin/
├── layout.tsx                       # chrome + requireAdmin() ชั้นนอกสุด (เดิม)
├── page.tsx                         # Dashboard
├── account/                         # โปรไฟล์ตัวเอง (ไม่อยู่ใน sidebar — อยู่ที่ identity block)
│   └── security/
│
├── (crm)/                           # ── Sales & CRM ──────────────────
│   ├── layout.tsx                   # requireCapability("viewAllLeads") ยกโซน
│   ├── leads/[id]/
│   ├── appointments/
│   ├── sales-team/
│   └── m/                           # mobile shell (leads, units)
│
├── (catalog)/                       # ── Properties ───────────────────
│   ├── layout.tsx                   # requireAdmin(locale, Role.VIEWER)
│   ├── projects/
│   │   ├── page.tsx
│   │   ├── new/
│   │   └── [id]/                    # tabs เดิมที่ทำถูกอยู่แล้ว ✅
│   │       ├── layout.tsx           #   Overview | Content | Facilities | Units
│   │       ├── edit/  content/  facilities/  site-plan/
│   │       ├── unit-types/  units/  seo/
│   ├── progress/[projectId]/
│   └── e-brochures/[id]/edit/
│
├── (content)/                       # ── Website Content ──────────────
│   ├── layout.tsx
│   ├── pages/                       # ★ hub ใหม่ — แทน 8 ลิงก์เดิม
│   │   ├── layout.tsx               #   nav ย่อย: Home | About | Contact | FAQ
│   │   ├── page.tsx                 #   redirect → ./home
│   │   ├── home/
│   │   │   ├── layout.tsx           #   <PageTabs section="home" />
│   │   │   ├── page.tsx             #   redirect → ./sections
│   │   │   ├── sections/page.tsx    #   ← ย้ายจาก admin/home-builder
│   │   │   ├── hero/page.tsx        #   ← ย้ายจาก admin/hero-banner
│   │   │   ├── gallery/page.tsx     #   ← ย้ายจาก admin/home-gallery
│   │   │   └── cta/page.tsx         #   ← ย้ายจาก admin/cta
│   │   ├── about/
│   │   │   ├── layout.tsx           #   <PageTabs section="about" />
│   │   │   ├── page.tsx             #   redirect → ./corporate
│   │   │   ├── corporate/page.tsx   #   ← ย้ายจาก admin/corporate
│   │   │   ├── why-us/page.tsx      #   ← ย้ายจาก admin/why-us
│   │   │   ├── mission/page.tsx     #   ← ย้ายจาก admin/mission
│   │   │   ├── awards/page.tsx      #   ← ย้ายจาก admin/awards
│   │   │   └── milestones/page.tsx  #   ← ย้ายจาก admin/milestones
│   │   ├── contact/page.tsx         #   ★ ใหม่ — ดึงส่วน "เนื้อหา" ออกจาก settings/contact
│   │   └── faq/page.tsx             #   ← ย้ายจาก admin/faqs
│   ├── news/[id]/edit/
│   ├── events/
│   │   ├── layout.tsx               #   tabs: All events | Registrations
│   │   └── [id]/registrations/
│   ├── media/
│   └── publishing/
│
├── (growth)/                        # ── SEO & Growth ─────────────────
│   ├── layout.tsx                   # requireAdmin(locale, Role.ADMIN)
│   ├── seo/
│   │   ├── layout.tsx               # tabs: Overview | URLs & Redirects | Translations | Structured Data
│   │   ├── page.tsx                 # ← เดิม
│   │   ├── urls/page.tsx            # ← เดิม (+ รายงาน 404 จาก api/not-found)
│   │   ├── translations/page.tsx    # ★ ใหม่ — ใช้ lib/locale-completeness.ts
│   │   └── schema/page.tsx          # ★ ใหม่ — Organization / LocalBusiness / RealEstateListing
│   └── analytics/
│       ├── layout.tsx               # tabs: Traffic | Content | Leads
│       └── page.tsx                 # ★ ใหม่ — ใช้ lib/analytics.ts + lib/reports.ts
│
└── (system)/                        # ── System ───────────────────────
    ├── layout.tsx
    ├── users/[id]/edit/
    ├── settings/                    # โครงสร้าง 7 tab เดิม ✅ ไม่ต้องแตะ
    └── activity/
```

### 3.1 ตาราง Redirect (กัน bookmark พัง)

เพิ่มใน `next.config.js` → `redirects()` (permanent: true)

| จาก | ไป |
|---|---|
| `/:locale/admin/home-builder` | `/:locale/admin/pages/home/sections` |
| `/:locale/admin/hero-banner` | `/:locale/admin/pages/home/hero` |
| `/:locale/admin/home-gallery` | `/:locale/admin/pages/home/gallery` |
| `/:locale/admin/cta` | `/:locale/admin/pages/home/cta` |
| `/:locale/admin/corporate` | `/:locale/admin/pages/about/corporate` |
| `/:locale/admin/why-us` | `/:locale/admin/pages/about/why-us` |
| `/:locale/admin/mission` | `/:locale/admin/pages/about/mission` |
| `/:locale/admin/awards` | `/:locale/admin/pages/about/awards` |
| `/:locale/admin/milestones` | `/:locale/admin/pages/about/milestones` |
| `/:locale/admin/faqs` | `/:locale/admin/pages/faq` |

> URL สาธารณะไม่กระทบเลย — ทั้งหมดนี้อยู่ใต้ `/admin` ซึ่ง `next.config.js` ตั้ง
> `X-Robots-Tag: noindex, nofollow` ไว้อยู่แล้ว ⇒ **ไม่มีผลต่อ SEO**


---

## 4. Navigation Config (TypeScript)

### 4.1 ทำไมเปลี่ยนจาก `minRole` เป็น `roles: readonly Role[]`

`minRole` คือ **บันไดขั้นเดียว** — ให้สิทธิ์ทุกอย่างที่ต่ำกว่าเสมอ
ซึ่งพังทันทีที่ระบบมี role ที่ *ไม่ได้เรียงกันจริง* อย่าง `EDITOR` กับ `SALES`
(EDITOR แก้เนื้อหาได้แต่ห้ามดู PDPA data / SALES ดู lead ได้แต่ห้ามแก้เนื้อหา — ไม่มีใครสูงกว่าใคร)

`roles: [...]` เป็น **allow-list ชัดเจน** อ่านแล้วรู้ทันทีว่าใครเห็น และดักบั๊กแบบ P2 ตั้งแต่ตอนเขียน

> `capability` ยังอยู่ และถูก **AND** กับ `roles` เสมอ — `roles` ตอบว่า *"เมนูนี้เป็นของใคร"*,
> `capability` ตอบว่า *"เขาทำสิ่งนั้นได้จริงไหม"* (ซึ่ง `lib/permissions.ts` เป็นคนตัดสิน)

### 4.2 `lib/admin/nav.ts` (ไฟล์ใหม่ — แทน `NAV_GROUPS` ใน `AdminSidebar.tsx`)

```ts
/**
 * lib/admin/nav.ts
 * ─────────────────────────────────────────────────────────────────────────
 * แหล่งความจริงเดียวของโครงสร้างเมนูหลังบ้าน
 *
 * ใช้ 3 ที่:
 *   1. components/admin/AdminSidebar.tsx   — วาด rail
 *   2. components/admin/PageTabs.tsx       — วาด tab ในหน้า (จาก `tabs`)
 *   3. components/admin/CommandK.tsx       — ป้อนรายการค้นหา
 *
 * ห้าม import อะไรที่เป็น server-only ที่นี่ — ไฟล์นี้ถูก client component ใช้
 * (เหตุผลเดียวกับที่ lib/role-rank.ts แยกออกจาก lib/auth.ts)
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { LucideIcon } from "lucide-react";
import {
  BarChart3, BookOpen, Building2, CalendarClock, CalendarDays, Contact,
  FileCheck2, Files, HardHat, History, LayoutDashboard, LibraryBig,
  Newspaper, Search, Settings, ShieldCheck, Smartphone, Users,
} from "lucide-react";
import { Role } from "@prisma/client";
import { can, type Capability } from "@/lib/permissions";
import type { AdminNavCounts } from "@/lib/admin-nav-counts";

/* ── ชุด role สำเร็จรูป ─────────────────────────────────────────────── */

export const ROLE_SETS = {
  /** ทุกคนที่ล็อกอินได้ */
  EVERYONE: [Role.SUPER_ADMIN, Role.ADMIN, Role.EDITOR, Role.SALES, Role.VIEWER],
  /** งานเนื้อหา — VIEWER อยู่ด้วยแบบอ่านอย่างเดียว (แก้ P3/P4) */
  CONTENT: [Role.SUPER_ADMIN, Role.ADMIN, Role.EDITOR, Role.VIEWER],
  /** งาน CRM — EDITOR ไม่อยู่โดยเจตนา (PDPA) */
  CRM: [Role.SUPER_ADMIN, Role.ADMIN, Role.SALES],
  /** ทีมขาย + คนทำเนื้อหา (roster ทีมขายขึ้นเว็บด้วย) */
  CONTENT_AND_CRM: [Role.SUPER_ADMIN, Role.ADMIN, Role.EDITOR, Role.SALES, Role.VIEWER],
  ADMIN_UP: [Role.SUPER_ADMIN, Role.ADMIN],
  OWNER_ONLY: [Role.SUPER_ADMIN],
} as const satisfies Record<string, readonly Role[]>;

/* ── รูปร่างข้อมูล ─────────────────────────────────────────────────── */

/** โหนดที่ตรวจสิทธิ์ได้ — ใช้ร่วมกันทั้ง sidebar item และ tab */
type Gated = {
  /** allow-list ตรง ๆ ไม่ใช่บันได — ดู 4.1 */
  roles: readonly Role[];
  /** AND กับ roles ด้านบน ตัดสินโดย lib/permissions.ts */
  capability?: Capability;
};

/** Tab ในหน้า — **ไม่เคย** ถูกวาดเป็นแถวใน sidebar */
export type NavTab = Gated & {
  key: string;
  /** ต่อท้าย href ของ item แม่ ("" = tab แรก/หน้า index) */
  segment: string;
};

export type NavItem = Gated & {
  key: string;
  /** ต่อจาก `/${locale}/admin` */
  href: string;
  icon: LucideIcon;
  /** badge ตัวเลขสด — lib/admin-nav-counts.ts */
  countKey?: keyof AdminNavCounts;
  /** ถ้ามี → หน้านี้เป็น workspace แบบ tab */
  tabs?: readonly NavTab[];
  /** prefix เพิ่มเติมที่ยังนับว่า item นี้ active (ใช้กับ path เก่าช่วง migrate) */
  alias?: readonly string[];
};

export type NavGroupKey =
  | "overview" | "sales" | "properties" | "content" | "growth" | "system";

export type NavGroup = {
  key: NavGroupKey;
  /** null = ไม่วาดหัวข้อ; ที่เหลือคีย์ใต้ admin.navGroups.* */
  labelKey: NavGroupKey | null;
  items: readonly NavItem[];
};

/* ── โครงสร้างเมนู ─────────────────────────────────────────────────── */

export const ADMIN_NAV: readonly NavGroup[] = [
  {
    key: "overview",
    labelKey: null,
    items: [
      {
        key: "dashboard",
        href: "",
        icon: LayoutDashboard,
        roles: ROLE_SETS.EVERYONE,
      },
    ],
  },

  {
    key: "sales",
    labelKey: "sales",
    items: [
      {
        key: "leads",
        href: "/leads",
        icon: Users,
        roles: ROLE_SETS.CRM,
        capability: "viewAllLeads",
        countKey: "newLeads",
      },
      {
        key: "appointments",
        href: "/appointments",
        icon: CalendarClock,
        roles: ROLE_SETS.CRM,
        capability: "viewAllLeads",
        countKey: "appointmentsToday",
      },
      {
        // roster ทีมขายขึ้นหน้าเว็บด้วย → คนทำเนื้อหาแก้ได้, พนักงานขายดูได้
        // (เดิม gate ที่ EDITOR ทำให้ SALES มองไม่เห็นทีมตัวเอง — P5)
        key: "salesTeam",
        href: "/sales-team",
        icon: Contact,
        roles: ROLE_SETS.CONTENT_AND_CRM,
      },
      {
        // เดิมเป็น minRole: SALES ซึ่ง EDITOR ผ่านบันไดแต่ถูก
        // requireCapability("viewAllLeads") ปฏิเสธที่หน้า — P2
        key: "mobile",
        href: "/m",
        icon: Smartphone,
        roles: ROLE_SETS.CRM,
        capability: "viewAllLeads",
      },
    ],
  },

  {
    key: "properties",
    labelKey: "properties",
    items: [
      { key: "projects",   href: "/projects",    icon: Building2, roles: ROLE_SETS.CONTENT },
      { key: "progress",   href: "/progress",    icon: HardHat,   roles: ROLE_SETS.CONTENT },
      { key: "eBrochures", href: "/e-brochures", icon: BookOpen,  roles: ROLE_SETS.CONTENT },
    ],
  },

  {
    key: "content",
    labelKey: "content",
    items: [
      {
        // ★ ยุบ 8 ลิงก์ระดับ section มาอยู่ใต้ hub เดียว
        key: "pages",
        href: "/pages",
        icon: Files,
        roles: ROLE_SETS.CONTENT,
        alias: [
          "/home-builder", "/hero-banner", "/home-gallery", "/cta",
          "/corporate", "/why-us", "/mission", "/awards", "/milestones", "/faqs",
        ],
        tabs: [
          { key: "home",    segment: "/home",    roles: ROLE_SETS.CONTENT },
          { key: "about",   segment: "/about",   roles: ROLE_SETS.CONTENT },
          { key: "contact", segment: "/contact", roles: ROLE_SETS.CONTENT },
          { key: "faq",     segment: "/faq",     roles: ROLE_SETS.CONTENT },
        ],
      },
      { key: "news",  href: "/news",  icon: Newspaper, roles: ROLE_SETS.CONTENT },
      {
        key: "events",
        href: "/events",
        icon: CalendarDays,
        roles: ROLE_SETS.CONTENT_AND_CRM,
        tabs: [
          { key: "all", segment: "", roles: ROLE_SETS.CONTENT },
          {
            // ข้อมูลผู้ลงทะเบียน = ข้อมูลส่วนบุคคล → ไม่ผูกกับ role
            // แต่ผูกกับ capability ตรง ๆ ตามที่หน้าจริงทำอยู่แล้ว
            key: "registrations",
            segment: "/registrations",
            roles: ROLE_SETS.CONTENT_AND_CRM,
            capability: "viewCustomerContact",
          },
        ],
      },
      { key: "media",      href: "/media",      icon: LibraryBig, roles: ROLE_SETS.CONTENT },
      {
        key: "publishing",
        href: "/publishing",
        icon: FileCheck2,
        roles: ROLE_SETS.CONTENT,
        countKey: "reviewQueue",
      },
    ],
  },

  {
    key: "growth",
    labelKey: "growth",
    items: [
      {
        key: "seo",
        href: "/seo",
        icon: Search,
        roles: ROLE_SETS.ADMIN_UP,
        tabs: [
          { key: "overview",     segment: "",              roles: ROLE_SETS.ADMIN_UP },
          { key: "urls",         segment: "/urls",         roles: ROLE_SETS.ADMIN_UP },
          { key: "translations", segment: "/translations", roles: ROLE_SETS.CONTENT },
          { key: "schema",       segment: "/schema",       roles: ROLE_SETS.ADMIN_UP },
        ],
      },
      {
        key: "analytics",
        href: "/analytics",
        icon: BarChart3,
        roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.EDITOR, Role.VIEWER],
        tabs: [
          { key: "traffic", segment: "",         roles: ROLE_SETS.CONTENT },
          { key: "content", segment: "/content", roles: ROLE_SETS.CONTENT },
          {
            key: "leads",
            segment: "/leads",
            roles: ROLE_SETS.ADMIN_UP,
            capability: "viewAllLeads",
          },
        ],
      },
    ],
  },

  {
    key: "system",
    labelKey: "system",
    items: [
      {
        key: "users",
        href: "/users",
        icon: ShieldCheck,
        roles: ROLE_SETS.OWNER_ONLY,
        capability: "manageUsers",
      },
      {
        key: "settings",
        href: "/settings",
        icon: Settings,
        roles: ROLE_SETS.ADMIN_UP,
        tabs: [
          { key: "company",       segment: "/company",       roles: ROLE_SETS.ADMIN_UP },
          { key: "contact",       segment: "/contact",       roles: ROLE_SETS.ADMIN_UP },
          { key: "seo",           segment: "/seo",           roles: ROLE_SETS.ADMIN_UP },
          { key: "notifications", segment: "/notifications", roles: ROLE_SETS.ADMIN_UP },
          { key: "integrations",  segment: "/integrations",  roles: ROLE_SETS.ADMIN_UP },
          { key: "privacy",       segment: "/privacy",       roles: ROLE_SETS.ADMIN_UP },
          { key: "system",        segment: "/system",        roles: ROLE_SETS.ADMIN_UP },
        ],
      },
      {
        key: "activity",
        href: "/activity",
        icon: History,
        roles: ROLE_SETS.OWNER_ONLY,
        capability: "viewAuditLog",
      },
    ],
  },
] as const;

/* ── Helper ────────────────────────────────────────────────────────── */

/** role นี้เห็นโหนดนี้ไหม — roles AND capability */
export function canSee(role: Role | null | undefined, node: Gated): boolean {
  if (!role) return false;
  if (!node.roles.includes(role)) return false;
  if (node.capability && !can(role, node.capability)) return false;
  return true;
}

/** กลุ่ม+ไอเท็มที่เหลือหลังกรอง (กลุ่มที่ว่างถูกตัดทิ้งพร้อมหัวข้อ) */
export function visibleNav(role: Role | null | undefined): NavGroup[] {
  return ADMIN_NAV
    .map((group) => ({ ...group, items: group.items.filter((i) => canSee(role, i)) }))
    .filter((group) => group.items.length > 0);
}

/** tab ที่ role นี้เห็นในหน้าหนึ่ง — ใช้ใน <PageTabs /> */
export function visibleTabs(role: Role | null | undefined, itemKey: string): NavTab[] {
  const item = ADMIN_NAV.flatMap((g) => g.items).find((i) => i.key === itemKey);
  return item?.tabs?.filter((t) => canSee(role, t)) ?? [];
}

/**
 * ไอเท็มที่ควร highlight สำหรับ pathname ปัจจุบัน
 * เทียบแบบ "ยาวที่สุดชนะ" เพื่อกันเคส /media vs /m ที่ startsWith พังมาแล้ว
 */
export function activeItemKey(pathname: string, base: string): string | null {
  let best: { key: string; len: number } | null = null;

  for (const item of ADMIN_NAV.flatMap((g) => g.items)) {
    for (const href of [item.href, ...(item.alias ?? [])]) {
      const full = `${base}${href}`;
      const hit = href === "" ? pathname === full
                              : pathname === full || pathname.startsWith(`${full}/`);
      if (hit && (!best || full.length > best.len)) best = { key: item.key, len: full.length };
    }
  }
  return best?.key ?? null;
}
```

### 4.3 `AdminSidebar.tsx` เหลืออะไร

หลังย้าย config ออก `AdminSidebar.tsx` จะเหลือแค่ **การวาด** —
`NAV_GROUPS`, `ADMIN_NAV_GROUP`, `type NavItem`, `type NavGroup` และ import lucide 30 ตัว **ลบทิ้งได้ทั้งหมด**

```tsx
// เดิม  (~40 บรรทัดของ config ปนอยู่ในไฟล์ UI)
const groups = allGroups.map(...).filter(...)

// ใหม่
import { visibleNav, activeItemKey } from "@/lib/admin/nav";

const groups = visibleNav(user.role);
const activeKey = activeItemKey(pathname, base);
```

### 4.4 `components/admin/PageTabs.tsx` (ไฟล์ใหม่ ~40 บรรทัด)

ใช้ pattern เดียวกับ `SettingsNav.tsx` ที่มีอยู่แล้ว แต่วางแนวนอนและอ่าน tab จาก config:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Role } from "@prisma/client";
import { visibleTabs } from "@/lib/admin/nav";

export default function PageTabs({
  locale, role, itemKey, baseHref,
}: { locale: string; role: Role; itemKey: string; baseHref: string }) {
  const t = useTranslations("admin.tabs");
  const pathname = usePathname();
  const tabs = visibleTabs(role, itemKey);
  if (tabs.length < 2) return null;   // tab เดียวไม่ต้องวาด

  return (
    <nav className="flex gap-1 border-b border-ink/10" aria-label={t(itemKey as never)}>
      {tabs.map(({ key, segment }) => {
        const href = `/${locale}/admin${baseHref}${segment}`;
        const active = segment === ""
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={[
              "-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors",
              active
                ? "border-primary font-semibold text-primary"
                : "border-transparent text-ink-muted hover:text-primary",
            ].join(" ")}
          >
            {t(`${itemKey}.${key}` as never)}
          </Link>
        );
      })}
    </nav>
  );
}
```

### 4.5 i18n keys ที่ต้องเพิ่ม (ทั้ง 4 ภาษา: `th, en, zh, ru`)

```jsonc
"admin": {
  "navGroups": {
    "sales": "Sales & CRM",
    "properties": "Properties",       // ← เดิมชื่อ "projects"
    "content": "Website Content",
    "growth": "SEO & Growth",         // ← ใหม่
    "system": "System"                // ← เดิมชื่อ "administration"
  },
  "nav": {
    "pages": "Pages",                 // ← ใหม่
    "analytics": "Analytics",         // ← ใหม่
    "mobile": "Mobile"                // ← เดิมชื่อ "mobileView"
    // ลบได้: homeBuilder, heroBanner, homeGallery, cta,
    //        corporate, whyUs, mission, awards, milestones, faqs
    //        (ย้ายไปอยู่ใต้ admin.tabs.* แทน)
  },
  "tabs": {
    "pages":     { "home": "Home", "about": "About", "contact": "Contact", "faq": "FAQ" },
    "pagesHome": { "sections": "Sections", "hero": "Hero Banner",
                   "gallery": "Gallery", "cta": "Closing CTA" },
    "pagesAbout":{ "corporate": "Corporate Services", "whyUs": "Why Us",
                   "mission": "Mission & Principles", "awards": "Awards",
                   "milestones": "Milestones" },
    "events":    { "all": "All events", "registrations": "Registrations" },
    "seo":       { "overview": "Overview", "urls": "URLs & Redirects",
                   "translations": "Translations", "schema": "Structured Data" },
    "analytics": { "traffic": "Traffic", "content": "Content", "leads": "Leads" }
  }
}
```


---

## 5. Gap Analysis — สิ่งที่หลังบ้านยังขาด

จัดลำดับตามผลกระทบต่อ **SEO + PDPA + งานประจำวัน** ซึ่งเป็นสามเสาของเว็บนี้

### 🔴 P0 — ควรทำก่อน (มี logic อยู่แล้ว แค่ขาดหน้า)

| # | โมดูล | ทำไมสำคัญ | ของที่มีอยู่แล้ว |
|---|---|---|---|
| G1 | **Translation Status** `/admin/seo/translations` | เว็บ 4 ภาษา + `sitemap.ts` ประกาศ `alternates.languages` + `x-default` ครบ **แต่ถ้าเนื้อหาภาษาไหนว่าง Google จะเจอ hreflang ชี้ไปหน้ากลวง** → ตอนนี้ไม่มีใครรู้ว่า `zh`/`ru` ขาดอะไรบ้างจนกว่าจะเปิดดูทีละหน้า | `lib/locale-completeness.ts`, `i18n.ts:LOCALE_DISPLAY_ORDER` |
| G2 | **404 → Redirect Report** (แท็บใน `/admin/seo/urls`) | `app/api/not-found/route.ts` เก็บ 404 อยู่แล้ว แต่ไม่มีหน้าดู → link rot สะสมเงียบ ๆ ทั้งที่ `UrlRedirectManager` พร้อมรับ redirect อยู่แล้ว | `app/api/not-found`, `lib/redirects.ts`, `lib/redirect-on-rename.ts` |
| G3 | **Analytics / Reports** `/admin/analytics` | ผู้บริหารต้องเปิด GA4 แยกทุกครั้ง ทั้งที่ในระบบมี page-view tracking ของตัวเองแล้ว | `lib/analytics.ts`, `lib/reports.ts`, `lib/company-stats.ts`, `app/api/page-view` |
| G4 | **Media Health** (แท็บใน `/admin/media`) | รูปที่ไม่มี `alt` = เสีย SEO + เสีย a11y; รูปที่ไม่มีใครใช้ = เปลืองค่า Spaces | `lib/media-usage.ts` |

### 🟠 P1 — คุ้มค่าสูง ต้องเขียนใหม่บ้าง

| # | โมดูล | เหตุผล |
|---|---|---|
| G5 | **Structured Data Manager** `/admin/seo/schema` | JSON-LD ตอนนี้ hardcode กระจายใน 14 หน้า — Organization / LocalBusiness / RealEstateListing / BreadcrumbList ควรแก้จากหลังบ้านได้ และมีปุ่ม "ทดสอบกับ Rich Results" |
| G6 | **Scheduled Publishing** | มี `draft → review → published` แล้ว แต่ยังไม่มี "เผยแพร่วันที่/เวลา" — ข่าวและ event ต้องใช้แน่นอน (เพิ่ม `publishAt` + cron ผ่าน `app/api/revalidate` ที่มีอยู่) |
| G7 | **Trash / Restore** | มี `lib/content-revisions.ts` (เก็บย้อนหลัง) แล้ว แต่ลบแล้วหายถาวร — soft delete + ถังขยะ 30 วัน |
| G8 | **Bulk actions + Saved views** ใน Leads / Projects / News | งานจริงคือ "เลือก 20 lead แล้ว assign ทีเดียว" — ตอนนี้ต้องคลิกทีละอัน |
| G9 | **OG Image อัตโนมัติ** (`opengraph-image.tsx`) | ตอนนี้ **ไม่มี** `opengraph-image` / `twitter-image` route เลยสักไฟล์ → แชร์ลิงก์โครงการใน LINE/Facebook ได้การ์ดเปล่า **นี่คือช่องโหว่ SEO/Social ที่ชัดที่สุดที่เจอ** |
| G10 | **Notification Center** `/admin/notifications` | `lib/notifications.ts` ถูกใช้ 8 ที่ แต่โผล่แค่ใน topbar — ไม่มีหน้ารวม/ประวัติ |

### 🟡 P2 — ทำเมื่อพร้อม

| # | โมดูล | เหตุผล |
|---|---|---|
| G11 | Core Web Vitals dashboard | มี `instrumentation-client.ts` + Sentry อยู่แล้ว ต่อยอดง่าย |
| G12 | IndexNow / Sitemap ping | แจ้ง Google/Bing ทันทีที่ publish (ต่อกับ `app/api/revalidate`) |
| G13 | Search Console API integration | ดึง impression/position เข้ามาแสดงคู่กับ SEO audit |
| G14 | Backup / Export ทั้งไซต์ | `settings/system` มีที่ว่างให้แล้ว |
| G15 | Global search page `/admin/search` | มี `CommandK` แต่มือถือไม่มีคีย์บอร์ด ⌘K |
| G16 | Onboarding / help ในหลังบ้าน | `docs/ADMIN_GUIDE.md` มีแล้ว — ดึงมาแสดงในแอปเป็น side panel |

### 🔒 หนี้ทางเทคนิคด้านความปลอดภัย

| # | เรื่อง | สถานะ |
|---|---|---|
| S1 | `lib/rate-limit.ts` เป็น **in-memory ต่อ process** | comment ในไฟล์เขียนไว้เองว่า *"a multi-instance deploy gets N× the limit"* — `output: "standalone"` + Docker หมายความว่าถ้าสเกลเป็น 2 replica ปุ๊บ limit เพี้ยนทันที → ย้ายไป Redis/Upstash |
| S2 | `viewContent` เป็น capability ตาย (P3) | หน้า Users วาดตารางที่แอปไม่ได้บังคับใช้ |
| S3 | ปุ่ม new ที่ gate ไม่ตรงกับ list (P6) | ซ่อนปุ่มด้วย capability เดียวกับ guard |

---

## 6. Tech Stack Review

ตรวจกับ npm registry จริงเมื่อ **2026-09-10**

### 6.1 สิ่งที่ทำได้ดีอยู่แล้ว ✅

- **App Router + RSC + Server Actions** — ใช้ถูกทาง, `params` เป็น `Promise` และ `await` ครบแล้ว ⇒ **พร้อมขึ้น Next 16 ทันที**
- **SEO foundation แน่น** — `app/sitemap.ts` (256 บรรทัด, มี `alternates.languages` + `x-default`), `app/robots.ts`, `app/manifest.ts`, JSON-LD 14 หน้า, `X-Robots-Tag: noindex` ครอบ `/admin`
- **Defence in depth** — middleware + `requireAdmin()` ต่อหน้า + `requireAdminAction()` ต่อ server action + 2FA gate 3 ชั้น
- **Audit trail** — `lib/audit/` + `beginAuditScope`/`setAuditActor` ผูกกับ guard
- **Testing ครบชั้น** — Vitest + Testing Library + Playwright + `@axe-core/playwright` (a11y!) + coverage
- **next-intl 4.14.1** ห่างจาก latest แค่ patch ✅
- **@sentry/nextjs 10.73** ห่างแค่ patch ✅
- **Node 22** ✅

### 6.2 ตารางเวอร์ชัน

| Package | ที่ใช้ | latest (2026-09-10) | ห่าง | ความเห็น |
|---|---|---|---|---|
| `next` | 15.5.25 | **16.3.4** | 1 major | 🟠 ควรอัป — ดู 6.3 |
| `react` / `react-dom` | 19.2.8 | 19.3.0 | minor | 🟢 อัปได้สบาย |
| `typescript` | 5.6.2 | **7.0.2** | 2 major | 🟠 TS 7 คือ compiler ที่เขียนใหม่ด้วย Go — เร็วขึ้นมาก คุ้มกับโปรเจกต์ขนาดนี้ |
| `@prisma/client` / `prisma` | 5.20 | **7.10.0** | 2 major | 🔴 ห่างมากสุดในโปรเจกต์ Prisma 6+ ตัด Rust engine ออก (cold start ดีขึ้นชัดใน Docker/standalone) |
| `tailwindcss` | 3.4.12 | **4.3.3** | 1 major | 🟠 v4 = Oxide engine, config เป็น CSS-first (`@theme`) — build เร็วขึ้นหลายเท่า |
| `eslint` | 8.57.1 | **10.10.0** | 2 major | 🔴 **ESLint 8 หมดอายุซัพพอร์ตตั้งแต่ ต.ค. 2024** ไม่มี security patch แล้ว |
| `zod` | 3.23.8 | **4.6.1** | 1 major | 🟠 v4 เร็วกว่ามากและ tree-shake ดีกว่า (ใช้คู่ `@hookform/resolvers` 5.x) |
| `@hookform/resolvers` | 3.9 | 5.9.1 | 2 major | 🟠 ต้องอัปพร้อม zod 4 |
| `lucide-react` | 0.446.0 | **1.43.0** | ข้าม 1.0 | 🟠 ห่างเกือบ 100 releases — ไอคอนใหม่/ขนาด bundle |
| `recharts` | 2.12.7 | 3.10.1 | 1 major | 🟡 อัปตอนทำหน้า Analytics (G3) ทีเดียว |
| `framer-motion` | 11.5.4 | **13.2.0** (แพ็กเกจเปลี่ยนชื่อเป็น `motion`) | 2 major | 🟡 |
| `marked` | 14.1.2 | 18.0.12 | 4 major | 🟡 ใช้คู่ `isomorphic-dompurify` อยู่แล้ว ความเสี่ยง XSS ต่ำ |
| `nodemailer` | 9.1.0 | 10.0.2 | 1 major | 🟡 |
| `bcryptjs` | 2.4.3 | 3.0.3 | 1 major | 🟡 |
| `pdfjs-dist` | 5.4.624 | 6.3.289 | 1 major | 🟡 pin ไว้เพราะ `page-flip` — ตรวจก่อนอัป |
| `vitest` | 4.1.11 | 5.0.0 | 1 major | 🟢 |
| `@playwright/test` | 1.48 | 1.63 | minor | 🟢 |
| `@types/node` | 20.x | 22.20.2 | 2 major | 🟢 ให้ตรงกับ Node 22 ที่ใช้จริง |
| `next-auth` | 4.24.7 | 4.24.15 (v4) / **5.0.0-beta.32** | — | 🟠 ดู 6.4 |

### 6.3 Next.js 16 — สิ่งที่ต้องแก้จริงในโปรเจกต์นี้

โปรเจกต์นี้อยู่ในสถานะ **"พร้อมอัปผิดปกติ"** เพราะไม่มี custom webpack config ใน `next.config.js` เลย
(บรรทัด `webpack:` ที่เจอเป็น option ของ Sentry plugin ไม่ใช่ของ Next)

| Breaking change | ผลกับโปรเจกต์นี้ |
|---|---|
| **Turbopack เป็น bundler เดียว** | ✅ ไม่มี custom webpack → แทบไม่ต้องแก้ |
| **`middleware.ts` → `proxy.ts`** | 🟠 ต้องเปลี่ยนชื่อไฟล์ + ย้าย logic auth เข้า layout/route handler — `middleware.ts` ปัจจุบันทำ 3 เรื่องปนกัน (locale routing ของ next-intl, redirect anonymous, 2FA gate) เป็นโอกาสดีที่จะแยก |
| **`params`/`searchParams` เป็น Promise บังคับ** | ✅ ทำครบแล้วทุกหน้า |
| **Node ≥ 20** | ✅ ใช้ Node 22 |
| **React ≥ 19.2** | ✅ ใช้ 19.2.8 |
| **`next lint` ถูกถอด** | 🟠 `package.json` ใช้ `"lint": "next lint"` → ต้องเปลี่ยนเป็น `eslint .` (ไปพร้อมกับอัป ESLint 10 flat config พอดี) |
| **PPR เป็น default + `use cache` / `cacheComponents`** | 🟢 โอกาส — หน้า public (`(site)`) ได้ static shell ฟรี ส่วน `/admin` ประกาศ `dynamic = "force-dynamic"` ไว้แล้ว ไม่กระทบ |

### 6.4 next-auth v4 → Auth.js v5?

- v4 ยังได้ patch อยู่ (4.24.15) แต่ **หยุดพัฒนาฟีเจอร์** — `getServerSession()` เป็น pattern ยุค Pages Router
- v5 (`next-auth@5.0.0-beta.32`) ให้ `auth()` ตัวเดียวใช้ได้ทั้ง server component / route handler / middleware และเข้ากับ App Router ตรงกว่ามาก
- **แต่** v5 ยัง beta หลังผ่านมาหลายปี และ `lib/auth.ts` + `lib/admin/guard.ts` ของโปรเจกต์นี้ห่อ `getServerSession` ไว้ดีอยู่แล้ว

**คำแนะนำ:** ยังไม่ต้องรีบ — ให้อยู่ v4 ต่อ แต่ **อย่าให้โค้ดเรียก `getServerSession` ตรง ๆ นอก `lib/auth.ts` / `lib/admin/guard.ts`**
วันที่ย้ายจริงจะแก้แค่ 2 ไฟล์ ทางเลือกที่โตเร็วอีกตัวคือ `better-auth` (1.7.3, stable) ถ้ายอมเขียน adapter เอง

### 6.5 สิ่งที่ยังไม่มีและควรมี (infra)

| | สถานะ | คำแนะนำ |
|---|---|---|
| **Redis / Upstash** | ❌ ไม่มี | จำเป็นถ้าจะขึ้น 2 replica — rate limit + session + cache (S1) |
| **`opengraph-image.tsx`** | ❌ ไม่มีสักไฟล์ | สำคัญมากสำหรับ SEO/Social (G9) — ใช้ `ImageResponse` ของ Next |
| **React Compiler** | ❌ ไม่เปิด | หลังบ้านมี client component หนัก (LeadBoard, ProgressWorkspace, dnd-kit) → เปิดแล้วได้ memo ฟรี |
| **DB connection pooling** | ❌ | ถ้าย้ายไป serverless ต้องมี PgBouncer / Prisma Accelerate |
| **Bundle analyzer ใน CI** | ❌ | `.github/` มีอยู่แล้ว เพิ่ม step ได้เลย |

---

## 7. แผนการเปลี่ยน (Migration Plan)

> **แทนที่แล้วโดย `docs/ADMIN_IA_PROMPTS.md`** ซึ่งแบ่งเป็น 6 เฟส
> พร้อมคำสั่งสำเร็จรูปใน `.claude/commands/ia-phase-1..6.md`
> หัวข้อนี้เก็บไว้เป็นบันทึกเหตุผล — ลำดับที่ใช้จริงให้ยึดไฟล์นั้น

แต่ละเฟสจบในตัวเอง deploy ได้ ไม่มีเฟสไหนบังคับให้ทำเฟสถัดไป

### Phase 1 — แก้บั๊กสิทธิ์ก่อน (0.5 วัน, ไม่แตะ UI)
1. `mobileView` → `capability: "viewAllLeads"` แทน `minRole: SALES` *(P2)*
2. `sales-team` guard ลดเป็น `Role.SALES` *(P5)*
3. ซ่อนปุ่ม "New project" / "New event" เมื่อ role < ADMIN *(P6)*
4. บังคับใช้ `viewContent` จริง หรือไม่ก็ถอดออกจาก `PERMISSION_MATRIX` — **ห้ามปล่อยให้ตารางในหน้า Users โกหกต่อ** *(P3)*
5. เพิ่ม test: ทุก `NavItem` ต้องมี role ที่ผ่าน `canSee()` แล้วผ่าน guard ของหน้าปลายทางด้วย *(ดู 7.1)*

### Phase 2 — ย้าย config ออกจาก component (1 วัน, UI เหมือนเดิม)
1. สร้าง `lib/admin/nav.ts` ตาม §4.2
2. `AdminSidebar.tsx` เปลี่ยนไปอ่านจาก `visibleNav()` / `activeItemKey()`
3. `CommandK.tsx` อ่านรายการจาก config เดียวกัน (เลิก hardcode)

### Phase 3 — ยุบ Section เข้า Tab (2–3 วัน) ← **ตัวที่แก้ปัญหาหลัก**
1. สร้าง `components/admin/PageTabs.tsx` (§4.4)
2. `git mv` 10 โฟลเดอร์ตามตาราง §3.1 (โค้ดในหน้าไม่ต้องแก้ แค่ path)
3. เพิ่ม route group `(content)` `(crm)` `(catalog)` `(growth)` `(system)` + `layout.tsx` ต่อโซน
4. เพิ่ม `redirects()` ใน `next.config.js`
5. เพิ่ม i18n keys ครบ 4 ภาษา (§4.5)

### Phase 4 — เติมช่องว่าง P0 (3–5 วัน)
G1 Translations · G2 404 Report · G3 Analytics · G4 Media Health · G9 OG Image

### Phase 5 — อัป Stack (ทำแยกจาก IA ได้)
```
เรียงตามความเสี่ยงจากน้อยไปมาก
1. @types/node 22 · vitest 5 · playwright 1.63 · react 19.3     (แทบไม่มีความเสี่ยง)
2. eslint 8 → 10 + flat config + เปลี่ยน "lint" เป็น "eslint ."  (ค้างซัพพอร์ตอยู่ ต้องทำ)
3. zod 3 → 4 + @hookform/resolvers 5                            (typecheck จับให้หมด)
4. prisma 5 → 6 → 7                                             (ทีละ major, มี migration guide)
5. next 15 → 16 + middleware.ts → proxy.ts                      (ทำหลัง ESLint เพราะ next lint หายไป)
6. tailwind 3 → 4                                               (มี upgrade codemod)
7. lucide-react 1.x · recharts 3 · framer-motion → motion 13     (ทำตอนแตะไฟล์นั้นอยู่แล้ว)
```

### 7.1 Test ที่ควรมีคู่กับ nav config

```ts
// tests/admin/nav.test.ts
import { describe, it, expect } from "vitest";
import { Role } from "@prisma/client";
import { ADMIN_NAV, canSee } from "@/lib/admin/nav";

const ALL_ROLES = Object.values(Role);
const items = ADMIN_NAV.flatMap((g) => g.items);

describe("admin nav config", () => {
  it("ไม่มี key ซ้ำ", () => {
    const keys = items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("ทุกเมนูต้องมีอย่างน้อยหนึ่ง role ที่เห็น", () => {
    for (const item of items) {
      expect(ALL_ROLES.some((r) => canSee(r, item)), item.key).toBe(true);
    }
  });

  it("roles ต้องไม่ขัดกับ capability (กันบั๊กแบบ mobileView)", () => {
    for (const item of items) {
      if (!item.capability) continue;
      // ทุก role ที่อยู่ใน allow-list ต้องผ่าน capability ด้วย
      // ไม่งั้นคือประกาศไว้แล้วโดนปฏิเสธที่หน้า
      expect(item.roles.every((r) => canSee(r, item)), item.key).toBe(true);
    }
  });
});
```

> เทสข้อสุดท้ายคือข้อที่จับบั๊ก P2 ได้ ถ้ามีมาตั้งแต่แรก

---

*จัดทำโดยการ audit โค้ดใน repo — ทุกข้อสังเกตอ้างอิงไฟล์และบรรทัดจริง ไม่มีข้อไหนเดา*
