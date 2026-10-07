/**
 * content/terms.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Website Terms of Service, all 4 site locales (TH/EN/ZH/RU). Mirrors the
 * type shape and accessor pattern of content/privacy-policy.ts.
 *
 * Scope: this covers use of the WEBSITE only — browsing project pages,
 * submitting enquiry/RSVP forms, and general conduct. It deliberately does
 * NOT attempt to cover the terms of an actual property purchase; that is
 * governed by a separate, individually signed reservation/sale-and-purchase
 * agreement, which is why section 3 below exists ("not an offer").
 *
 * IMPORTANT — this is a working draft, not legal advice. Have Thai counsel
 * review the governing-law clause, the liability/indemnity language, and
 * the "not an offer" disclaimer against actual sales-process documents
 * before publishing. Bump TERMS_OF_SERVICE_VERSION (e.g. "terms-v3") if the
 * substance changes after launch, following the same versioning convention
 * as PRIVACY_POLICY_VERSION.
 *
 * terms-v2 (2026-10-07) is the client's legal review, applied as marked up:
 * sections 1, 3, 7, 8, 9 and 11 rewritten, a carve-out added to 6 and 10,
 * the English title made "Terms & Conditions" to match the footer link,
 * and the contact phone changed. The review was in English; the Thai,
 * Chinese and Russian are translations of it, and the English governs.
 * Section 11 now promises a new version number and date on every change,
 * so the bump below is not optional.
 *
 * The phone is siteConfig.legal.contactPhone rather than the company line:
 * the reviews of this page and the privacy policy both asked for a
 * different number in their contact blocks only. The footer and contact
 * page are unchanged.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { siteConfig } from "@/config/site";

export type TermsSection = {
  heading: string;
  /** Rendered as paragraphs. */
  body?: string[];
  /** Rendered as a bulleted list. */
  bullets?: string[];
};

export type TermsContent = {
  version: string;
  effectiveDate: string;
  title: string;
  intro: string[];
  sections: TermsSection[];
  contactHeading: string;
  contactIntro: string;
  lastUpdatedLabel: string;
  versionLabel: string;
  contactPhone: { tel: string; display: string };
};

export const TERMS_OF_SERVICE_VERSION = "terms-v2";
export const TERMS_OF_SERVICE_EFFECTIVE_DATE = "2026-10-07";

// ── ภาษาไทย ─────────────────────────────────────────────────────────────
const th: TermsContent = {
  version: TERMS_OF_SERVICE_VERSION,
  effectiveDate: TERMS_OF_SERVICE_EFFECTIVE_DATE,
  title: "ข้อกำหนดและเงื่อนไขการใช้งาน",
  lastUpdatedLabel: "มีผลบังคับใช้",
  versionLabel: "เวอร์ชัน",
  intro: [
    "ข้อกำหนดและเงื่อนไขฉบับนี้ (“ข้อกำหนด”) ควบคุมการเข้าใช้งานเว็บไซต์นี้ซึ่งดำเนินการโดยบริษัท อันดามัน แอสเซท โซลูชัน จำกัด (“บริษัท” “เรา”) การเข้าใช้งานเว็บไซต์ถือว่าท่านยอมรับข้อกำหนดฉบับนี้",
    "หากท่านไม่เห็นด้วยกับข้อกำหนดข้อใดข้อหนึ่ง กรุณางดใช้งานเว็บไซต์นี้",
  ],
  sections: [
    {
      heading: "1. การยอมรับข้อกำหนด",
      body: [
        "การใช้งานเว็บไซต์นี้อยู่ภายใต้ข้อกำหนดฉบับนี้ นโยบายความเป็นส่วนตัวของเราอธิบายวิธีที่เราประมวลผลข้อมูลส่วนบุคคล การยอมรับข้อกำหนดฉบับนี้ไม่ถือเป็นการให้ความยินยอมในการรับข้อมูลทางการตลาด หรือในการใช้เทคโนโลยีติดตามที่ไม่จำเป็น ในกรณีที่ต้องได้รับความยินยอม เราจะขอความยินยอมจากท่านแยกต่างหาก",
      ],
    },
    {
      heading: "2. ลักษณะการให้บริการของเว็บไซต์",
      body: [
        "เว็บไซต์นี้ให้ข้อมูลทั่วไปเกี่ยวกับโครงการอสังหาริมทรัพย์ของบริษัท ความคืบหน้าการก่อสร้าง ข่าวสาร และช่องทางติดต่อเพื่อสอบถามข้อมูลหรือขอนัดเข้าชมโครงการ",
      ],
    },
    {
      heading: "3. ไม่ถือเป็นข้อเสนอหรือสัญญาซื้อขาย",
      body: [
        "เนื้อหาบนเว็บไซต์นี้ รวมถึงราคา แบบแปลน ขนาดพื้นที่ ภาพถ่าย ภาพจำลอง (Rendering) และวันที่คาดว่าจะก่อสร้างแล้วเสร็จ จัดทำขึ้นเพื่อวัตถุประสงค์ในการให้ข้อมูลเบื้องต้นเท่านั้น และอาจมีการปรับปรุงสำหรับธุรกรรมในอนาคต การปรับปรุงดังกล่าวไม่กระทบต่อสิทธิตามสัญญาที่มีอยู่แล้ว และไม่ตัดผลทางกฎหมายใด ๆ ของการโฆษณาหรือคำรับรองตามกฎหมายที่ใช้บังคับ",
        "การเข้าชมเว็บไซต์นี้หรือการส่งคำสอบถาม ไม่ก่อให้เกิดสัญญาจองหรือสัญญาจะซื้อจะขายในตัวเอง ธุรกรรมจะอยู่ภายใต้สัญญาฉบับแยกต่างหาก ทั้งนี้ภายใต้บังคับของกฎหมายที่ใช้บังคับ ไม่มีข้อความใดในข้อกำหนดฉบับนี้ที่ตัดผลทางกฎหมายของการโฆษณาหรือคำรับรอง หรือสิทธิใด ๆ ของผู้บริโภคตามกฎหมายที่ใช้บังคับ",
      ],
    },
    {
      heading: "4. ทรัพย์สินทางปัญญา",
      body: [
        "เนื้อหาทั้งหมดบนเว็บไซต์นี้ ได้แก่ ข้อความ ภาพถ่าย โลโก้ กราฟิก และวิดีโอ เป็นทรัพย์สินของบริษัทหรือผู้อนุญาตให้ใช้สิทธิ และได้รับความคุ้มครองตามกฎหมายทรัพย์สินทางปัญญา ห้ามคัดลอก ทำซ้ำ ดัดแปลง หรือนำไปใช้ในเชิงพาณิชย์โดยไม่ได้รับอนุญาตเป็นลายลักษณ์อักษรจากบริษัท",
      ],
    },
    {
      heading: "5. การใช้งานที่ยอมรับได้",
      bullets: [
        "ห้ามใช้เว็บไซต์นี้ในลักษณะที่ผิดกฎหมาย หลอกลวง หรือละเมิดสิทธิของผู้อื่น",
        "ห้ามส่งข้อมูลอันเป็นเท็จผ่านแบบฟอร์มติดต่อหรือแบบฟอร์มลงทะเบียนกิจกรรม",
        "ห้ามพยายามเข้าถึงระบบ เซิร์ฟเวอร์ หรือฐานข้อมูลของเว็บไซต์โดยไม่ได้รับอนุญาต หรือรบกวนการทำงานปกติของเว็บไซต์ด้วยวิธีการทางเทคนิคใด ๆ เช่น การใช้โปรแกรมอัตโนมัติเก็บข้อมูล (scraping) หรือการโจมตีระบบ",
      ],
    },
    {
      heading: "6. ลิงก์และบริการของบุคคลภายนอก",
      body: [
        "เว็บไซต์นี้อาจมีลิงก์เชื่อมโยงไปยังเว็บไซต์ของบุคคลภายนอก เช่น แผนที่ โซเชียลมีเดีย หรือช่องทางแชท ซึ่งอยู่นอกเหนือการควบคุมของบริษัท เราไม่รับผิดชอบต่อเนื้อหาหรือแนวปฏิบัติด้านความเป็นส่วนตัวของเว็บไซต์บุคคลภายนอกดังกล่าว",
        "ข้อนี้ไม่ตัดความรับผิดใด ๆ ของบริษัทที่ไม่อาจยกเว้นได้ตามกฎหมาย",
      ],
    },
    {
      heading: "7. ข้อจำกัดความรับผิดชอบ",
      body: [
        "เราใช้ความระมัดระวังตามสมควรในการดูแลเว็บไซต์นี้ แต่ไม่รับประกันว่าเว็บไซต์จะทำงานได้โดยไม่หยุดชะงักหรือปราศจากข้อผิดพลาด การยกเว้นหรือจำกัดความรับผิดใด ๆ มีผลเพียงเท่าที่กฎหมายที่ใช้บังคับอนุญาต และเท่าที่เป็นธรรมและสมเหตุสมผล ไม่มีข้อความใดในข้อกำหนดฉบับนี้ที่ยกเว้นความรับผิดจากการฉ้อฉล การกระทำโดยจงใจ ความประมาทเลินเล่ออย่างร้ายแรง หรือความรับผิดใด ๆ ที่ไม่อาจยกเว้นได้ตามกฎหมาย หรือจำกัดสิทธิของผู้บริโภคหรือสิทธิในการคุ้มครองข้อมูลส่วนบุคคลที่กฎหมายกำหนด",
      ],
    },
    {
      heading: "8. การชดใช้ค่าเสียหาย",
      body: [
        "เท่าที่กฎหมายที่ใช้บังคับอนุญาต และเท่าที่เป็นธรรมและสมเหตุสมผลตามพฤติการณ์ ท่านต้องรับผิดชอบต่อความเสียหายโดยตรงที่พิสูจน์ได้และค่าใช้จ่ายตามสมควร ซึ่งเกิดจากการที่ท่านฝ่าฝืนข้อกำหนดฉบับนี้โดยจงใจหรือประมาทเลินเล่อ ทั้งนี้ ท่านไม่ต้องรับผิดตามข้อนี้สำหรับความเสียหายในส่วนที่เกิดจากบริษัทหรือตัวแทนของบริษัท",
      ],
    },
    {
      heading: "9. ความเป็นส่วนตัว",
      body: [
        `เราประมวลผลข้อมูลส่วนบุคคลที่เก็บรวบรวมผ่านเว็บไซต์นี้ตามที่ระบุไว้ในนโยบายความเป็นส่วนตัวของเรา การรับทราบนโยบายความเป็นส่วนตัวไม่ถือเป็นการให้ความยินยอมสำหรับการประมวลผลที่ต้องได้รับความยินยอมแยกต่างหาก`,
      ],
    },
    {
      heading: "10. กฎหมายที่ใช้บังคับและเขตอำนาจศาล",
      body: [
        "ข้อกำหนดฉบับนี้อยู่ภายใต้บังคับและตีความตามกฎหมายไทย ข้อพิพาทใด ๆ ที่เกิดขึ้นให้อยู่ในเขตอำนาจของศาลไทยที่มีเขตอำนาจเหนือคดีดังกล่าว",
        "ข้อนี้ไม่จำกัดสิทธิใด ๆ ในการฟ้องคดีหรือยื่นข้อร้องเรียนต่อศาลหรือหน่วยงานใด ซึ่งไม่อาจจำกัดได้ตามกฎหมาย",
      ],
    },
    {
      heading: "11. การเปลี่ยนแปลงข้อกำหนด",
      body: [
        "เราอาจปรับปรุงข้อกำหนดฉบับนี้เป็นครั้งคราว โดยจะเผยแพร่เวอร์ชันใหม่พร้อมระบุหมายเลขเวอร์ชันและวันที่มีผลบังคับใช้บนหน้านี้ การเปลี่ยนแปลงที่เป็นสาระสำคัญจะแจ้งให้ทราบอย่างชัดเจน การปรับปรุงมีผลเฉพาะต่อไปในอนาคต ไม่แก้ไขสัญญาจองหรือสัญญาจะซื้อจะขายที่มีอยู่แล้ว และไม่ตัดสิทธิที่เกิดขึ้นแล้ว ในกรณีที่กฎหมายกำหนด เราจะขอให้ท่านยอมรับโดยชัดแจ้ง",
      ],
    },
  ],
  contactPhone: siteConfig.legal.contactPhone,
  contactHeading: "ติดต่อเรา",
  contactIntro: "หากมีข้อสงสัยเกี่ยวกับข้อกำหนดฉบับนี้ กรุณาติดต่อ:",
};

// ── English ─────────────────────────────────────────────────────────────
const en: TermsContent = {
  version: TERMS_OF_SERVICE_VERSION,
  effectiveDate: TERMS_OF_SERVICE_EFFECTIVE_DATE,
  title: "Terms & Conditions",
  lastUpdatedLabel: "Effective",
  versionLabel: "Version",
  intro: [
    "These Terms of Service (“Terms”) govern your access to and use of this website, operated by Andaman Asset Solution Co., Ltd. (“we”, “us”). By accessing or using this website, you agree to be bound by these Terms.",
    "If you do not agree with any part of these Terms, please do not use this website.",
  ],
  sections: [
    {
      heading: "1. Acceptance of terms",
      body: [
        "Your use of this website is subject to these Terms. Our Privacy Policy explains how we process personal data. Acceptance of these Terms does not constitute consent to marketing communications or non-essential tracking technologies. Where consent is required, we request it separately.",
      ],
    },
    {
      heading: "2. Nature of the service",
      body: [
        "This website provides general information about our property developments, construction progress, news, and channels to enquire about, or request a viewing of, our projects.",
      ],
    },
    {
      heading: "3. Not an offer or a binding sale contract",
      body: [
        "Content on this website, including prices, floor plans, unit sizes, photographs, renderings and estimated completion dates, is provided for general informational purposes only and may be updated for future transactions. Updates do not alter existing contractual rights or exclude any legal effect of advertising or representations under applicable law.",
        "Viewing this website or submitting an enquiry does not, by itself, create a reservation or sale and purchase agreement. A separate agreement governs the transaction, subject to applicable law. Nothing in these Terms excludes any legal effect of advertising or representations, or any consumer rights, under applicable law.",
      ],
    },
    {
      heading: "4. Intellectual property",
      body: [
        "All content on this website, including text, photographs, logos, graphics and video, is the property of the Company or its licensors and is protected by applicable intellectual property laws. You may not copy, reproduce, modify or use it for commercial purposes without our prior written consent.",
      ],
    },
    {
      heading: "5. Acceptable use",
      bullets: [
        "You must not use this website for any unlawful, fraudulent purpose or in a way that infringes the rights of others.",
        "You must not submit false information through our enquiry or event registration forms.",
        "You must not attempt to gain unauthorized access to our systems, servers or databases, or interfere with the normal operation of the website by technical means such as automated scraping or attacks on our infrastructure.",
      ],
    },
    {
      heading: "6. Third-party links and services",
      body: [
        "This website may link to third-party websites, such as maps, social media or chat services, which are outside our control. We are not responsible for the content or privacy practices of those third-party websites.",
        "This clause does not exclude any liability of the Company that cannot lawfully be excluded.",
      ],
    },
    {
      heading: "7. Disclaimer of warranties",
      body: [
        "We take reasonable care to maintain this website, but do not guarantee uninterrupted or error-free operation. Any exclusion or limitation of liability applies only to the extent permitted by applicable law and to the extent fair and reasonable. Nothing in these Terms excludes liability for fraud, wilful misconduct, gross negligence, or any liability that cannot lawfully be excluded, or limits mandatory consumer or personal data protection rights.",
      ],
    },
    {
      heading: "8. Indemnification",
      body: [
        "To the extent permitted by applicable law and fair and reasonable in the circumstances, you are responsible for proven direct losses and reasonable expenses caused by your intentional or negligent breach of these Terms. You are not responsible under this clause for losses to the extent caused by the Company or its representatives.",
      ],
    },
    {
      heading: "9. Privacy",
      body: [
        `We process personal data collected through this website as described in our Privacy Policy. Acknowledging the Privacy Policy does not constitute consent to processing that requires separate consent.`,
      ],
    },
    {
      heading: "10. Governing law and jurisdiction",
      body: [
        "These Terms are governed by and construed in accordance with the laws of Thailand. Any dispute arising from these Terms shall be subject to the exclusive jurisdiction of the competent Thai courts.",
        "Nothing in this clause restricts any right to bring proceedings or lodge a complaint before a court or authority that cannot lawfully be restricted.",
      ],
    },
    {
      heading: "11. Changes to these Terms",
      body: [
        "We may update these Terms from time to time. Whenever we do, we will publish a new version on this page with its own version number and effective date. Material changes will be prominently notified. Updates apply prospectively and do not amend existing reservation or sale and purchase agreements or remove accrued rights. Where required by law, we will obtain your express acceptance.",
      ],
    },
  ],
  contactPhone: siteConfig.legal.contactPhone,
  contactHeading: "Contact us",
  contactIntro: "If you have questions about these Terms, please contact:",
};

// ── 简体中文 ─────────────────────────────────────────────────────────────
const zh: TermsContent = {
  version: TERMS_OF_SERVICE_VERSION,
  effectiveDate: TERMS_OF_SERVICE_EFFECTIVE_DATE,
  title: "条款与条件",
  lastUpdatedLabel: "生效日期",
  versionLabel: "版本",
  intro: [
    "本服务条款（“条款”）规范您对本网站的访问与使用，本网站由安达曼资产解决方案有限公司（“本公司”“我们”）运营。访问或使用本网站即表示您同意受本条款约束。",
    "如果您不同意本条款的任何部分，请勿使用本网站。",
  ],
  sections: [
    {
      heading: "1. 条款的接受",
      body: [
        "您对本网站的使用受本条款约束。我们的隐私政策说明了我们如何处理个人数据。接受本条款并不构成对营销信息或非必要跟踪技术的同意。如需征得同意，我们将另行请求。",
      ],
    },
    {
      heading: "2. 服务性质",
      body: [
        "本网站提供有关本公司房地产项目、施工进度、新闻资讯的一般信息，以及用于咨询或预约看房的联系渠道。",
      ],
    },
    {
      heading: "3. 非要约或具有约束力的买卖合同",
      body: [
        "本网站上的内容，包括价格、平面图、单位面积、照片、效果图及预计竣工日期，仅供一般参考之用，并可能针对未来的交易进行更新。此类更新不会改变现有的合同权利，也不排除适用法律下广告或陈述所具有的任何法律效力。",
        "浏览本网站或提交咨询本身并不构成预订协议或买卖合同。交易受单独协议约束，并须遵守适用法律。本条款中的任何内容均不排除适用法律下广告或陈述的任何法律效力，亦不排除任何消费者权利。",
      ],
    },
    {
      heading: "4. 知识产权",
      body: [
        "本网站上的所有内容，包括文字、照片、标志、图形及视频，均为本公司或其许可方的财产，并受适用知识产权法律保护。未经本公司事先书面同意，不得复制、转载、修改或用于任何商业用途。",
      ],
    },
    {
      heading: "5. 可接受使用",
      bullets: [
        "不得以任何非法或欺诈目的使用本网站，或以侵犯他人权利的方式使用本网站",
        "不得通过我们的咨询表单或活动报名表单提交虚假信息",
        "不得试图未经授权访问我们的系统、服务器或数据库，或通过自动化抓取、攻击等技术手段干扰网站的正常运行",
      ],
    },
    {
      heading: "6. 第三方链接与服务",
      body: [
        "本网站可能包含指向第三方网站的链接，例如地图、社交媒体或聊天服务，这些网站不在本公司的控制范围内。我们不对该等第三方网站的内容或隐私做法负责。",
        "本条款不排除本公司依法不得排除的任何责任。",
      ],
    },
    {
      heading: "7. 免责声明",
      body: [
        "我们以合理的谨慎维护本网站，但不保证网站运行不中断或无错误。任何责任的排除或限制，仅在适用法律允许且公平合理的范围内适用。本条款中的任何内容均不排除对欺诈、故意不当行为、重大过失的责任或依法不得排除的任何责任，亦不限制强制性的消费者权利或个人数据保护权利。",
      ],
    },
    {
      heading: "8. 赔偿",
      body: [
        "在适用法律允许且根据具体情况公平合理的范围内，您须对因您故意或过失违反本条款而造成的、经证实的直接损失及合理费用承担责任。对于由本公司或其代表造成的损失，您在该范围内无须根据本条承担责任。",
      ],
    },
    {
      heading: "9. 隐私",
      body: [
        `我们按照本公司隐私政策中所述方式处理通过本网站收集的个人数据。知悉隐私政策并不构成对需另行取得同意之处理活动的同意。`,
      ],
    },
    {
      heading: "10. 适用法律与管辖权",
      body: [
        "本条款受泰国法律管辖并据其解释。因本条款引起的任何争议，应由具有管辖权的泰国法院专属管辖。",
        "本条款不限制任何依法不得限制的、向法院或主管机关提起诉讼或投诉的权利。",
      ],
    },
    {
      heading: "11. 条款变更",
      body: [
        "我们可能不时更新本条款。每次更新时，我们将在本页面发布带有新版本号及生效日期的新版本。重大变更将以显著方式通知。更新仅对未来生效，不修改现有的预订协议或买卖合同，也不取消已产生的权利。如法律要求，我们将取得您的明确同意。",
      ],
    },
  ],
  contactPhone: siteConfig.legal.contactPhone,
  contactHeading: "联系我们",
  contactIntro: "如对本条款有任何疑问，请通过以下方式联系我们：",
};

// ── Русский ─────────────────────────────────────────────────────────────
const ru: TermsContent = {
  version: TERMS_OF_SERVICE_VERSION,
  effectiveDate: TERMS_OF_SERVICE_EFFECTIVE_DATE,
  title: "Условия использования",
  lastUpdatedLabel: "Действует с",
  versionLabel: "Версия",
  intro: [
    "Настоящие Условия использования («Условия») регулируют доступ к настоящему веб-сайту и его использование; сайт управляется компанией Andaman Asset Solution Co., Ltd. («Компания», «мы»). Получая доступ к сайту или используя его, вы соглашаетесь соблюдать настоящие Условия.",
    "Если вы не согласны с какой-либо частью настоящих Условий, пожалуйста, не используйте данный веб-сайт.",
  ],
  sections: [
    {
      heading: "1. Принятие условий",
      body: [
        "Использование настоящего веб-сайта регулируется настоящими Условиями. Наша Политика конфиденциальности описывает, как мы обрабатываем персональные данные. Принятие настоящих Условий не означает согласия на получение маркетинговых сообщений или на использование необязательных технологий отслеживания. Если требуется согласие, мы запрашиваем его отдельно.",
      ],
    },
    {
      heading: "2. Характер сервиса",
      body: [
        "Настоящий веб-сайт предоставляет общую информацию о наших проектах недвижимости, ходе строительства, новостях, а также каналы для обращения с вопросами или запроса на просмотр объектов.",
      ],
    },
    {
      heading: "3. Не является офертой или обязывающим договором купли-продажи",
      body: [
        "Информация на этом сайте, включая цены, планировки, площади помещений, фотографии, визуализации и предполагаемые сроки завершения строительства, предоставляется исключительно в справочных целях и может обновляться применительно к будущим сделкам. Такие обновления не изменяют существующих договорных прав и не исключают юридических последствий рекламы или заверений в соответствии с применимым законодательством.",
        "Просмотр настоящего веб-сайта или направление запроса сами по себе не создают договора резервирования или договора купли-продажи. Сделка регулируется отдельным договором с учётом применимого законодательства. Ничто в настоящих Условиях не исключает юридических последствий рекламы или заверений, а также каких-либо прав потребителей в соответствии с применимым законодательством.",
      ],
    },
    {
      heading: "4. Интеллектуальная собственность",
      body: [
        "Всё содержимое настоящего веб-сайта, включая тексты, фотографии, логотипы, графику и видео, является собственностью Компании или её лицензиаров и охраняется применимым законодательством об интеллектуальной собственности. Копирование, воспроизведение, изменение или использование в коммерческих целях без предварительного письменного согласия Компании запрещено.",
      ],
    },
    {
      heading: "5. Допустимое использование",
      bullets: [
        "Запрещается использовать данный веб-сайт в незаконных или мошеннических целях либо способом, нарушающим права третьих лиц",
        "Запрещается предоставлять заведомо ложную информацию через формы запроса или регистрации на мероприятия",
        "Запрещается предпринимать попытки несанкционированного доступа к нашим системам, серверам или базам данных, а также нарушать нормальную работу сайта техническими средствами, включая автоматизированный сбор данных (скрапинг) или атаки на инфраструктуру",
      ],
    },
    {
      heading: "6. Ссылки на сторонние ресурсы и сервисы",
      body: [
        "Настоящий веб-сайт может содержать ссылки на сторонние сайты, например карты, социальные сети или сервисы обмена сообщениями, которые находятся вне нашего контроля. Мы не несём ответственности за содержание или практику конфиденциальности таких сторонних сайтов.",
        "Настоящий пункт не исключает ответственности Компании, которая не может быть исключена в соответствии с законом.",
      ],
    },
    {
      heading: "7. Отказ от гарантий",
      body: [
        "Мы проявляем разумную осмотрительность при поддержке настоящего веб-сайта, но не гарантируем его бесперебойную или безошибочную работу. Любое исключение или ограничение ответственности применяется лишь в той мере, в какой это допускается применимым законодательством и является справедливым и разумным. Ничто в настоящих Условиях не исключает ответственности за мошенничество, умышленные неправомерные действия, грубую неосторожность или иной ответственности, которая не может быть исключена по закону, и не ограничивает обязательных прав потребителей или прав на защиту персональных данных.",
      ],
    },
    {
      heading: "8. Возмещение убытков",
      body: [
        "В той мере, в какой это допускается применимым законодательством и является справедливым и разумным в данных обстоятельствах, вы несёте ответственность за доказанные прямые убытки и разумные расходы, причинённые вашим умышленным или неосторожным нарушением настоящих Условий. Вы не несёте ответственности по настоящему пункту за убытки в той мере, в какой они причинены Компанией или её представителями.",
      ],
    },
    {
      heading: "9. Конфиденциальность",
      body: [
        `Мы обрабатываем персональные данные, собираемые через настоящий веб-сайт, в соответствии с нашей Политикой конфиденциальности. Ознакомление с Политикой конфиденциальности не означает согласия на обработку, для которой требуется отдельное согласие.`,
      ],
    },
    {
      heading: "10. Применимое право и юрисдикция",
      body: [
        "Настоящие Условия регулируются и толкуются в соответствии с законодательством Таиланда. Любой спор, возникающий из настоящих Условий, подлежит рассмотрению исключительно в компетентных судах Таиланда.",
        "Настоящий пункт не ограничивает право на обращение в суд или подачу жалобы в орган, если такое право не может быть ограничено по закону.",
      ],
    },
    {
      heading: "11. Изменения настоящих Условий",
      body: [
        "Мы можем время от времени обновлять настоящие Условия. При каждом обновлении мы публикуем на этой странице новую версию с указанием номера версии и даты вступления в силу. О существенных изменениях мы уведомляем заметным образом. Обновления применяются только на будущее, не изменяют действующих договоров резервирования или купли-продажи и не отменяют уже возникших прав. Если этого требует закон, мы получим ваше явно выраженное согласие.",
      ],
    },
  ],
  contactPhone: siteConfig.legal.contactPhone,
  contactHeading: "Свяжитесь с нами",
  contactIntro: "По вопросам, связанным с настоящими Условиями, пожалуйста, свяжитесь с нами:",
};

export const termsOfService: Record<"th" | "en" | "zh" | "ru", TermsContent> = { th, en, zh, ru };

export function getTermsOfService(locale: string): TermsContent {
  return termsOfService[locale as keyof typeof termsOfService] ?? termsOfService.en;
}
