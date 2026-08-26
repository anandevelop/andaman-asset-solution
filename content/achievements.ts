/**
 * content/achievements.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Narrative copy for the "Our Achievements" page, transcribed from the real
 * (non-template) paragraphs on the old site's /our-achievements/ page and
 * translated into all 4 site locales.
 *
 * The old page was built on a generic WordPress theme ("Consultio") with a
 * lot of unrelated demo filler mixed in — placeholder team bios ("Fran
 * Bostick", "Natalia Duke (Chairman and founder)"), generic accounting/tax
 * service blurbs, and Latin filler text ("Praesent feugiat sem"). None of
 * that is this company's real content and none of it is reproduced here.
 * Only the two genuine paragraphs (the "Grow Together" intro and the
 * "proof of our company's evolution and progress" body) are kept, lightly
 * cleaned up for grammar and translated — not reworded in substance — into
 * th/en/zh/ru.
 *
 * The structured award lists ("Corporate Awards" / "Property Awards") on
 * the old page are NOT duplicated as static data here — they are already
 * modeled in the database (the Award model, seeded in prisma/seed.ts) and
 * the achievements page (app/[locale]/(site)/achievements/page.tsx) derives
 * the same two groupings live from getAwards(locale): an award with
 * projectName === null is a "Corporate" award, otherwise it is a "Property"
 * award grouped under that project's name. This keeps the achievements page
 * and the homepage Awards section reading from one source of truth.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type AchievementsContent = {
  /** "Grow Together" section. */
  intro: { heading: string; body: string };
  /** "Our achievements are proof of our company's evolution..." section. */
  evolution: { heading: string; body: string };
};

const en: AchievementsContent = {
  intro: {
    heading: "Grow Together",
    body: "Our team are the heart of our business. We share ambitions as a collective, but we also respect each person's individual ambitions — the same is true of everyone else our work touches.\n\nWe are proud that Andaman Asset Solution was named Best Breakthrough Developer Phuket 2021 by the Dot Property Thailand Awards. Recognition like this reflects a broader commitment: to keep developing distinctive projects that add real value for our investors and the communities we build in.",
  },
  evolution: {
    heading: "Our achievements are proof of our company's evolution and progress",
    body: "Andaman Asset Solution has been recognised with a number of awards for design, architectural conservation and business development. In 2021, guided by a concept of development, sustainability and cultural identity, we won Best Breakthrough Developer at both the Dot Property Thailand Awards and the PropertyGuru Thailand Property Awards.\n\nThe Residence, our urban lifestyle villa community, won Best Development – Urban Lifestyle Development and Best Development – Luxury Townhome at the Dot Property Thailand Awards 2021, recognising the design and delivery of a luxury townhome within an exclusive, high-end residential complex.\n\nThe Victory, our luxury pool villa community, won Best Development – New Launch Villa at the Dot Property Thailand Awards 2021, and was Highly Commended for Best Club Facilities Design at the PropertyGuru Thailand Property Awards 2021 — recognition of a design commitment that meets the needs of every resident.",
  },
};

const th: AchievementsContent = {
  intro: {
    heading: "เติบโตไปด้วยกัน",
    body: "ทีมงานของเราคือหัวใจสำคัญของธุรกิจ เรามีเป้าหมายร่วมกันในฐานะองค์กร ขณะเดียวกันก็เคารพเป้าหมายส่วนตัวของแต่ละคน เช่นเดียวกับทุกคนที่งานของเราส่งผลถึง\n\nเราภูมิใจที่อันดามัน แอสเซท โซลูชัน ได้รับรางวัล Best Breakthrough Developer Phuket ประจำปี 2021 จาก Dot Property Thailand Awards การยอมรับเช่นนี้สะท้อนความตั้งใจที่กว้างขึ้นของเรา นั่นคือการพัฒนาโครงการที่มีเอกลักษณ์อย่างต่อเนื่อง เพื่อสร้างคุณค่าที่แท้จริงให้กับนักลงทุนและชุมชนที่เราเข้าไปพัฒนา",
  },
  evolution: {
    heading: "รางวัลที่ได้รับคือเครื่องพิสูจน์การเติบโตและพัฒนาการของบริษัท",
    body: "อันดามัน แอสเซท โซลูชัน ได้รับรางวัลมากมายจากความโดดเด่นด้านการออกแบบ การอนุรักษ์สถาปัตยกรรม และการพัฒนาธุรกิจ ในปี 2021 ด้วยแนวคิดด้านการพัฒนา ความยั่งยืน และอัตลักษณ์ทางวัฒนธรรม เราได้รับรางวัล Best Breakthrough Developer ทั้งจาก Dot Property Thailand Awards และ PropertyGuru Thailand Property Awards\n\nโครงการ The Residence ได้รับรางวัล Best Development – Urban Lifestyle Development และ Best Development – Luxury Townhome จาก Dot Property Thailand Awards 2021 ซึ่งสะท้อนการออกแบบและพัฒนาทาวน์โฮมหรูภายในโครงการที่พักอาศัยระดับไฮเอนด์\n\nโครงการ The Victory ได้รับรางวัล Best Development – New Launch Villa จาก Dot Property Thailand Awards 2021 และได้รับรางวัล Highly Commended สาขา Best Club Facilities Design จาก PropertyGuru Thailand Property Awards 2021 อันเป็นเครื่องยืนยันความมุ่งมั่นในการออกแบบที่ตอบโจทย์ผู้อยู่อาศัยทุกคน",
  },
};

const zh: AchievementsContent = {
  intro: {
    heading: "携手成长",
    body: "我们的团队是公司的核心。我们既有共同的目标,也尊重每个人的个人追求——这一点同样适用于所有受我们工作影响的人。\n\n我们很自豪地宣布,安达曼资产解决方案荣获 Dot Property Thailand Awards 颁发的「2021 年普吉最佳新锐开发商」称号。这份荣誉体现了我们更长远的承诺:持续打造独具特色的项目,为投资者和所在社区创造真实价值。",
  },
  evolution: {
    heading: "所获荣誉印证了公司的成长与进步",
    body: "安达曼资产解决方案凭借在设计、建筑保育与业务发展方面的卓越表现屡获殊荣。2021 年,凭借开发理念、可持续性与文化特质,我们同时荣获 Dot Property Thailand Awards 与 PropertyGuru Thailand Property Awards 颁发的「最佳新锐开发商」奖项。\n\nThe Residence 项目荣获 Dot Property Thailand Awards 2021「最佳都市生活开发项目」及「最佳豪华联排别墅开发项目」,表彰其在高端住宅社区中打造豪华联排别墅的设计与开发成果。\n\nThe Victory 项目荣获 Dot Property Thailand Awards 2021「最佳新推别墅开发项目」,并在 PropertyGuru Thailand Property Awards 2021 中荣获「最佳会所设施设计」优异奖(Highly Commended)——印证了我们始终致力于满足每一位业主需求的设计理念。",
  },
};

const ru: AchievementsContent = {
  intro: {
    heading: "Растём вместе",
    body: "Наша команда — сердце компании. У нас есть общие цели как у коллектива, но мы также уважаем личные устремления каждого — то же самое можно сказать обо всех, кого касается наша работа.\n\nМы гордимся тем, что Andaman Asset Solution была признана «Лучшим прорывным застройщиком Пхукета 2021 года» по версии Dot Property Thailand Awards. Такое признание отражает наше более широкое стремление — и дальше развивать уникальные проекты, создавая реальную ценность для инвесторов и местных сообществ.",
  },
  evolution: {
    heading: "Наши награды — свидетельство роста и развития компании",
    body: "Andaman Asset Solution была отмечена рядом наград за дизайн, сохранение архитектурного наследия и развитие бизнеса. В 2021 году, руководствуясь идеями развития, устойчивости и культурной идентичности, мы получили награду «Лучший прорывной застройщик» сразу на Dot Property Thailand Awards и PropertyGuru Thailand Property Awards.\n\nПроект The Residence получил награды «Лучший проект городского образа жизни» и «Лучший проект — роскошный таунхаус» на Dot Property Thailand Awards 2021 — за дизайн и реализацию элитного таунхауса в составе закрытого жилого комплекса высокого класса.\n\nПроект The Victory получил награду «Лучший новый проект — вилла» на Dot Property Thailand Awards 2021, а также был отмечен наградой Highly Commended в номинации «Лучший дизайн клубных удобств» на PropertyGuru Thailand Property Awards 2021 — подтверждение неизменной приверженности дизайну, отвечающему потребностям каждого жильца.",
  },
};

const ACHIEVEMENTS_CONTENT: Record<string, AchievementsContent> = { th, en, zh, ru };

export function getAchievementsContent(locale: string): AchievementsContent {
  return ACHIEVEMENTS_CONTENT[locale] ?? ACHIEVEMENTS_CONTENT.en;
}
