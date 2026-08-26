/**
 * config/team.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The people shown on /about.
 *
 * Deliberately a config file rather than a database model. This list
 * changes once or twice a year, it needs no workflow, and giving it a
 * Prisma table plus an admin CRUD would be more machinery than the problem
 * deserves. Promote it to the database when someone actually asks to edit
 * it without a deploy.
 *
 * ⚠ PLACEHOLDER DATA — replace with the real team before launch, including
 * the photographs. Portraits below are stock images.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type TeamMember = {
  /** Stable key, used for React list keys. */
  key: string;
  name: { en: string; th: string };
  role: { en: string; th: string };
  /** One line on what they are actually responsible for. */
  focus: { en: string; th: string };
  imageUrl: string;
};

export const team: TeamMember[] = [
  {
    key: "managing-director",
    name: { en: "Somchai Tanaphon", th: "สมชาย ธนพล" },
    role: { en: "Managing Director", th: "กรรมการผู้จัดการ" },
    focus: {
      en: "Land acquisition and every purchase decision above ten million baht.",
      th: "จัดหาที่ดิน และตัดสินใจการซื้อทุกรายการที่มูลค่าเกินสิบล้านบาท",
    },
    imageUrl:
      "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=600&q=80",
  },
  {
    key: "head-of-development",
    name: { en: "Naruemon Suksawat", th: "นฤมล สุขสวัสดิ์" },
    role: { en: "Head of Development", th: "หัวหน้าฝ่ายพัฒนาโครงการ" },
    focus: {
      en: "Design, permitting and the monthly construction reports you read here.",
      th: "งานออกแบบ ขออนุญาต และรายงานความคืบหน้ารายเดือนที่ท่านอ่านบนเว็บนี้",
    },
    imageUrl:
      "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&q=80",
  },
  {
    key: "head-of-sales",
    name: { en: "Kittipong Rattana", th: "กิตติพงศ์ รัตนา" },
    role: { en: "Head of Sales", th: "หัวหน้าฝ่ายขาย" },
    focus: {
      en: "Viewings, ownership structures and the introduction to your lawyer.",
      th: "นัดชมโครงการ รูปแบบการถือครอง และการแนะนำที่ปรึกษากฎหมาย",
    },
    imageUrl:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&q=80",
  },
  {
    key: "head-of-aftercare",
    name: { en: "Pornthip Chaiyo", th: "พรทิพย์ ไชโย" },
    role: { en: "Head of Aftercare", th: "หัวหน้าฝ่ายดูแลหลังการขาย" },
    focus: {
      en: "Maintenance, rental management and the number you call after handover.",
      th: "งานซ่อมบำรุง บริหารการปล่อยเช่า และเบอร์ที่ท่านโทรหลังรับมอบบ้าน",
    },
    imageUrl:
      "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=600&q=80",
  },
];
