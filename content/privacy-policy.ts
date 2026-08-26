/**
 * content/privacy-policy.ts
 * ─────────────────────────────────────────────────────────────────────────
 * PDPA (พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 / Thailand Personal Data
 * Protection Act B.E. 2562) privacy notice, all 4 site locales (TH/EN/ZH/RU).
 * ZH and RU follow the EN version's structure and legal-section references
 * (s.19, s.24(3), etc.) verbatim, translated — not reworded — since all four
 * describe the same Thai law to non-Thai readers.
 *
 * IMPORTANT — consent versioning:
 * The version shown on this page is siteConfig.legal.consentVersion, the same
 * string written to LeadInquiry.consentVersion on every submission — so the
 * exact notice a person agreed to stays auditable. When the substance of this
 * notice changes, bump siteConfig.legal.consentVersion (e.g. "privacy-policy-v2")
 * rather than editing in place; previously collected consents keep pointing
 * at v1.
 *
 * This is a working draft, not legal advice. Have Thai counsel review the
 * retention periods, lawful bases, and DPO contact before launch.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { siteConfig } from "@/config/site";

export type PolicySection = {
  heading: string;
  /** Rendered as paragraphs. */
  body?: string[];
  /** Rendered as a bulleted list. */
  bullets?: string[];
};

export type PolicyContent = {
  version: string;
  effectiveDate: string;
  title: string;
  intro: string[];
  sections: PolicySection[];
  contactHeading: string;
  contactIntro: string;
  lastUpdatedLabel: string;
  versionLabel: string;
};

/** Single source of truth — same string persisted to LeadInquiry.consentVersion. */
export const PRIVACY_POLICY_VERSION = siteConfig.legal.consentVersion;
export const PRIVACY_POLICY_EFFECTIVE_DATE = "2026-01-01";

// ── ภาษาไทย ─────────────────────────────────────────────────────────────
const th: PolicyContent = {
  version: PRIVACY_POLICY_VERSION,
  effectiveDate: PRIVACY_POLICY_EFFECTIVE_DATE,
  title: "นโยบายความเป็นส่วนตัว",
  lastUpdatedLabel: "มีผลบังคับใช้",
  versionLabel: "เวอร์ชัน",
  intro: [
    "บริษัท อันดามัน แอสเซท โซลูชัน จำกัด (“บริษัท” “เรา”) ให้ความสำคัญกับการคุ้มครองข้อมูลส่วนบุคคลของท่าน นโยบายฉบับนี้อธิบายวิธีที่เราเก็บรวบรวม ใช้ เปิดเผย และเก็บรักษาข้อมูลส่วนบุคคลของท่าน ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)",
    "นโยบายนี้ใช้กับเว็บไซต์ของเรา แบบฟอร์มติดต่อและนัดชมโครงการ การลงทะเบียนร่วมกิจกรรม รวมถึงช่องทางการติดต่ออื่น ๆ ของบริษัท",
  ],
  sections: [
    {
      heading: "1. ผู้ควบคุมข้อมูลส่วนบุคคล",
      body: [
        "บริษัท อันดามัน แอสเซท โซลูชัน จำกัด เป็นผู้ควบคุมข้อมูลส่วนบุคคล (Data Controller) สำหรับข้อมูลที่เก็บรวบรวมผ่านเว็บไซต์และช่องทางการขายของบริษัท",
      ],
    },
    {
      heading: "2. ข้อมูลส่วนบุคคลที่เราเก็บรวบรวม",
      bullets: [
        "ข้อมูลระบุตัวตนและการติดต่อ: ชื่อ-นามสกุล อีเมล เบอร์โทรศัพท์ สัญชาติ",
        "ข้อมูลความสนใจ: โครงการที่ท่านสอบถาม ข้อความที่ท่านระบุในแบบฟอร์ม",
        "ข้อมูลทางเทคนิค: หมายเลข IP ประเภทเบราว์เซอร์ (User Agent) วันและเวลาที่ส่งแบบฟอร์ม",
        "ข้อมูลแหล่งที่มา: พารามิเตอร์ UTM (utm_source, utm_medium, utm_campaign) เพื่อทราบว่าท่านเข้าถึงเว็บไซต์จากช่องทางใด",
        "ข้อมูลความยินยอม: สถานะการให้ความยินยอม วันเวลาที่ให้ความยินยอม และเวอร์ชันของนโยบายฉบับที่ท่านยอมรับ",
      ],
      body: [
        "เราไม่เก็บรวบรวมข้อมูลส่วนบุคคลอ่อนไหว (Sensitive Personal Data) เช่น เชื้อชาติ ศาสนา ข้อมูลสุขภาพ หรือข้อมูลชีวมิติ ผ่านแบบฟอร์มบนเว็บไซต์นี้",
      ],
    },
    {
      heading: "3. วัตถุประสงค์และฐานทางกฎหมาย",
      bullets: [
        "ติดต่อกลับเพื่อให้ข้อมูลโครงการ นัดหมายเข้าชม และเสนอเงื่อนไขการซื้อขาย — ฐานความยินยอม (มาตรา 19) และฐานการดำเนินการตามสัญญา (มาตรา 24(3))",
        "ส่งข่าวสาร โปรโมชัน และเชิญร่วมกิจกรรมของบริษัท — ฐานความยินยอม ซึ่งท่านสามารถถอนได้ทุกเมื่อ",
        "ปรับปรุงคุณภาพเว็บไซต์ วิเคราะห์ประสิทธิภาพการตลาด และป้องกันการส่งข้อมูลอัตโนมัติที่ไม่พึงประสงค์ — ฐานประโยชน์อันชอบด้วยกฎหมาย (มาตรา 24(5))",
        "ปฏิบัติตามกฎหมายที่เกี่ยวข้อง เช่น กฎหมายภาษีอากรและกฎหมายป้องกันการฟอกเงิน — ฐานหน้าที่ตามกฎหมาย (มาตรา 24(6))",
      ],
    },
    {
      heading: "4. การเปิดเผยข้อมูลต่อบุคคลภายนอก",
      body: [
        "เราไม่ขายข้อมูลส่วนบุคคลของท่าน เราอาจเปิดเผยข้อมูลเท่าที่จำเป็นให้แก่:",
      ],
      bullets: [
        "ผู้ให้บริการที่ประมวลผลข้อมูลแทนเรา เช่น ผู้ให้บริการเซิร์ฟเวอร์ ระบบอีเมล และระบบ CRM ภายใต้ข้อตกลงการประมวลผลข้อมูล",
        "ตัวแทนขายและพันธมิตรทางธุรกิจที่ได้รับมอบหมายให้ติดต่อท่านเกี่ยวกับโครงการที่ท่านสอบถาม",
        "หน่วยงานราชการหรือผู้มีอำนาจตามกฎหมาย เมื่อมีคำสั่งหรือหน้าที่ตามกฎหมาย",
      ],
    },
    {
      heading: "5. การส่งข้อมูลไปต่างประเทศ",
      body: [
        "ผู้ให้บริการบางรายของเราอาจจัดเก็บข้อมูลบนเซิร์ฟเวอร์นอกราชอาณาจักรไทย ในกรณีดังกล่าว เราจะดำเนินการให้มีมาตรการคุ้มครองที่เหมาะสมตามมาตรา 28 และ 29 ของ PDPA",
      ],
    },
    {
      heading: "6. ระยะเวลาการเก็บรักษาข้อมูล",
      bullets: [
        "ข้อมูลผู้สนใจที่ยังไม่เป็นลูกค้า: เก็บไว้ไม่เกิน 2 ปี นับจากการติดต่อครั้งสุดท้าย",
        "ข้อมูลลูกค้าที่ทำสัญญาซื้อขาย: เก็บไว้ตามระยะเวลาที่กฎหมายกำหนด ซึ่งโดยทั่วไปไม่เกิน 10 ปี นับจากสิ้นสุดสัญญา",
        "บันทึกความยินยอม: เก็บไว้ตลอดระยะเวลาที่ความยินยอมมีผล และต่อไปอีก 1 ปีหลังการถอนความยินยอม เพื่อเป็นหลักฐานการปฏิบัติตามกฎหมาย",
      ],
    },
    {
      heading: "7. สิทธิของเจ้าของข้อมูลส่วนบุคคล",
      body: ["ภายใต้ PDPA ท่านมีสิทธิดังต่อไปนี้:"],
      bullets: [
        "สิทธิเพิกถอนความยินยอม (มาตรา 19)",
        "สิทธิขอเข้าถึงและขอรับสำเนาข้อมูลส่วนบุคคล (มาตรา 30)",
        "สิทธิขอให้โอนย้ายข้อมูลไปยังผู้ควบคุมข้อมูลรายอื่น (มาตรา 31)",
        "สิทธิคัดค้านการเก็บรวบรวม ใช้ หรือเปิดเผยข้อมูล (มาตรา 32)",
        "สิทธิขอให้ลบหรือทำลายข้อมูล (มาตรา 33)",
        "สิทธิขอให้ระงับการใช้ข้อมูล (มาตรา 34)",
        "สิทธิขอให้แก้ไขข้อมูลให้ถูกต้องและเป็นปัจจุบัน (มาตรา 35)",
        "สิทธิร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (มาตรา 73)",
      ],
    },
    {
      heading: "8. การใช้สิทธิและการถอนความยินยอม",
      body: [
        "ท่านสามารถใช้สิทธิข้างต้นได้โดยติดต่อเราตามช่องทางท้ายนโยบายนี้ เราจะดำเนินการภายใน 30 วันนับจากวันที่ได้รับคำขอ การถอนความยินยอมจะไม่กระทบต่อความชอบด้วยกฎหมายของการประมวลผลที่ได้ดำเนินการไปแล้วก่อนการถอน",
      ],
    },
    {
      heading: "9. คุกกี้",
      body: [
        "เว็บไซต์ของเราใช้คุกกี้ที่จำเป็นต่อการทำงานของระบบ และอาจใช้คุกกี้เพื่อการวิเคราะห์และการตลาดเมื่อได้รับความยินยอมจากท่าน ท่านสามารถตั้งค่าเบราว์เซอร์เพื่อปฏิเสธคุกกี้ได้ แต่อาจส่งผลต่อการใช้งานบางส่วนของเว็บไซต์",
        "ท่านสามารถให้หรือถอนความยินยอมสำหรับคุกกี้เพื่อการวิเคราะห์และการตลาดได้ทุกเมื่อ ผ่านลิงก์ \"ตั้งค่าคุกกี้\" ที่ท้ายเว็บไซต์",
      ],
    },
    {
      heading: "10. มาตรการรักษาความมั่นคงปลอดภัย",
      body: [
        "เราจัดให้มีมาตรการทางเทคนิคและการบริหารจัดการที่เหมาะสม เช่น การเข้ารหัสข้อมูลระหว่างการรับส่ง การจำกัดสิทธิ์การเข้าถึงเฉพาะพนักงานที่เกี่ยวข้อง และการบันทึกการเข้าถึงข้อมูล เพื่อป้องกันการเข้าถึง เปลี่ยนแปลง หรือเปิดเผยข้อมูลโดยมิชอบ",
      ],
    },
    {
      heading: "11. การเปลี่ยนแปลงนโยบาย",
      body: [
        "เราอาจปรับปรุงนโยบายฉบับนี้เป็นครั้งคราว ทุกครั้งที่มีการเปลี่ยนแปลงสาระสำคัญ เราจะเผยแพร่นโยบายเวอร์ชันใหม่พร้อมระบุหมายเลขเวอร์ชันและวันที่มีผลบังคับใช้ ความยินยอมที่ท่านเคยให้ไว้จะยังคงผูกกับเวอร์ชันที่ท่านยอมรับในขณะนั้น",
      ],
    },
  ],
  contactHeading: "ติดต่อเรา",
  contactIntro:
    "หากมีข้อสงสัยเกี่ยวกับนโยบายฉบับนี้ หรือต้องการใช้สิทธิของเจ้าของข้อมูลส่วนบุคคล กรุณาติดต่อ:",
};

// ── English ─────────────────────────────────────────────────────────────
const en: PolicyContent = {
  version: PRIVACY_POLICY_VERSION,
  effectiveDate: PRIVACY_POLICY_EFFECTIVE_DATE,
  title: "Privacy Policy",
  lastUpdatedLabel: "Effective",
  versionLabel: "Version",
  intro: [
    "Andaman Asset Solution Co., Ltd. (“we”, “us”) is committed to protecting your personal data. This notice explains how we collect, use, disclose and retain your personal data in accordance with Thailand's Personal Data Protection Act B.E. 2562 (2019) (“PDPA”).",
    "It applies to our website, our enquiry and private-viewing forms, event registrations, and our other sales channels.",
  ],
  sections: [
    {
      heading: "1. Data controller",
      body: [
        "Andaman Asset Solution Co., Ltd. acts as the Data Controller for personal data collected through our website and sales channels.",
      ],
    },
    {
      heading: "2. Personal data we collect",
      bullets: [
        "Identity and contact data: full name, email address, phone number, nationality.",
        "Interest data: the project you enquired about and any message you provide.",
        "Technical data: IP address, browser user agent, and the date and time of submission.",
        "Attribution data: UTM parameters (utm_source, utm_medium, utm_campaign) indicating how you reached our site.",
        "Consent records: whether consent was given, when it was given, and the version of this notice you accepted.",
      ],
      body: [
        "We do not collect sensitive personal data — such as race, religion, health information or biometric data — through the forms on this website.",
      ],
    },
    {
      heading: "3. Purposes and lawful bases",
      bullets: [
        "To contact you with project information, arrange viewings and present purchase terms — consent (s.19) and performance of a contract (s.24(3)).",
        "To send news, promotions and event invitations — consent, which you may withdraw at any time.",
        "To improve our website, measure marketing performance and prevent automated form abuse — legitimate interest (s.24(5)).",
        "To comply with applicable law, including tax and anti-money-laundering obligations — legal obligation (s.24(6)).",
      ],
    },
    {
      heading: "4. Disclosure to third parties",
      body: ["We do not sell your personal data. We may disclose it, only as necessary, to:"],
      bullets: [
        "Service providers processing data on our behalf — hosting, email and CRM providers — under data processing agreements.",
        "Sales agents and business partners appointed to contact you about the project you enquired about.",
        "Government agencies or other authorities where required by law or lawful order.",
      ],
    },
    {
      heading: "5. International transfers",
      body: [
        "Some of our service providers store data on servers outside Thailand. Where that occurs, we ensure appropriate safeguards are in place in accordance with sections 28 and 29 of the PDPA.",
      ],
    },
    {
      heading: "6. Retention periods",
      bullets: [
        "Prospect enquiries that do not become customers: retained for up to 2 years from the last contact.",
        "Customer records under a sale and purchase agreement: retained for the period required by law, generally up to 10 years after the contract ends.",
        "Consent records: retained for as long as the consent is active and for 1 further year after withdrawal, as evidence of compliance.",
      ],
    },
    {
      heading: "7. Your rights as a data subject",
      body: ["Under the PDPA you have the right to:"],
      bullets: [
        "Withdraw consent (s.19).",
        "Access your personal data and obtain a copy (s.30).",
        "Request data portability to another controller (s.31).",
        "Object to the collection, use or disclosure of your data (s.32).",
        "Request erasure or destruction of your data (s.33).",
        "Request restriction of processing (s.34).",
        "Request rectification so your data is accurate and up to date (s.35).",
        "Lodge a complaint with the Office of the Personal Data Protection Committee (s.73).",
      ],
    },
    {
      heading: "8. Exercising your rights and withdrawing consent",
      body: [
        "To exercise any of these rights, contact us using the details below. We will respond within 30 days of receiving your request. Withdrawing consent does not affect the lawfulness of processing carried out before the withdrawal.",
      ],
    },
    {
      heading: "9. Cookies",
      body: [
        "Our website uses cookies that are strictly necessary for it to function, and — with your consent — analytics and marketing cookies. You can configure your browser to refuse cookies, though some parts of the site may not work as intended.",
        "You can grant or withdraw consent for analytics and marketing cookies at any time via the \"Cookie Preferences\" link in the site footer.",
      ],
    },
    {
      heading: "10. Security measures",
      body: [
        "We maintain appropriate technical and organisational measures, including encryption of data in transit, access restricted to staff who need it, and access logging, to protect against unauthorised access, alteration or disclosure.",
      ],
    },
    {
      heading: "11. Changes to this notice",
      body: [
        "We may update this notice from time to time. Whenever the substance changes we publish a new version with its own version number and effective date. Consent you previously gave remains linked to the version you accepted at the time.",
      ],
    },
  ],
  contactHeading: "Contact us",
  contactIntro:
    "For questions about this notice, or to exercise your data subject rights, please contact:",
};

// ── 简体中文 ─────────────────────────────────────────────────────────────
const zh: PolicyContent = {
  version: PRIVACY_POLICY_VERSION,
  effectiveDate: PRIVACY_POLICY_EFFECTIVE_DATE,
  title: "隐私政策",
  lastUpdatedLabel: "生效日期",
  versionLabel: "版本",
  intro: [
    "安达曼资产解决方案有限公司（“本公司”“我们”）高度重视保护您的个人数据。本声明说明我们如何根据泰国《个人数据保护法》B.E. 2562（2019年，简称“PDPA”）收集、使用、披露和保留您的个人数据。",
    "本政策适用于我们的网站、咨询与预约看房表单、活动报名，以及本公司的其他销售渠道。",
  ],
  sections: [
    {
      heading: "1. 数据控制者",
      body: [
        "安达曼资产解决方案有限公司是通过本公司网站及销售渠道收集的个人数据的数据控制者（Data Controller）。",
      ],
    },
    {
      heading: "2. 我们收集的个人数据",
      bullets: [
        "身份与联系信息：姓名、电子邮箱、电话号码、国籍",
        "兴趣信息：您咨询的项目及您在表单中填写的留言",
        "技术信息：IP 地址、浏览器信息（User Agent）、提交表单的日期与时间",
        "来源信息：UTM 参数（utm_source、utm_medium、utm_campaign），用于了解您访问本网站的渠道",
        "同意记录：是否已同意、同意时间，以及您所接受的本声明版本",
      ],
      body: [
        "我们不会通过本网站的表单收集敏感个人数据（Sensitive Personal Data），例如种族、宗教、健康信息或生物识别信息。",
      ],
    },
    {
      heading: "3. 处理目的与法律依据",
      bullets: [
        "与您联系以提供项目信息、安排看房及提供购买条款——依据同意（第 19 条）及合同履行（第 24(3) 条）",
        "发送新闻、促销信息及活动邀请——依据同意，您可随时撤回",
        "改善网站体验、评估营销效果并防止自动化滥用表单——依据合法利益（第 24(5) 条）",
        "遵守适用法律，包括税务及反洗钱相关义务——依据法定义务（第 24(6) 条）",
      ],
    },
    {
      heading: "4. 向第三方披露",
      body: ["我们不会出售您的个人数据。在必要范围内，我们可能将其披露给："],
      bullets: [
        "代表我们处理数据的服务提供商——包括主机、电子邮件及 CRM 服务商——并签署数据处理协议",
        "受委托就您咨询的项目与您联系的销售代理及业务合作伙伴",
        "在法律要求或合法命令下的政府机关或其他有权机构",
      ],
    },
    {
      heading: "5. 跨境数据传输",
      body: [
        "我们的部分服务提供商可能将数据存储在泰国境外的服务器上。在此情况下，我们将确保按照 PDPA 第 28 条及第 29 条采取适当的保障措施。",
      ],
    },
    {
      heading: "6. 数据保留期限",
      bullets: [
        "尚未成为客户的潜在客户信息：自最后一次联系起最长保留 2 年",
        "已签署买卖合同的客户记录：按法律规定期限保留，通常为合同结束后最长 10 年",
        "同意记录：在同意有效期间持续保留，并在撤回同意后再保留 1 年，作为合规证明",
      ],
    },
    {
      heading: "7. 您作为数据主体的权利",
      body: ["根据 PDPA，您享有以下权利："],
      bullets: [
        "撤回同意的权利（第 19 条）",
        "查阅个人数据并获取副本的权利（第 30 条）",
        "要求数据可携带至其他数据控制者的权利（第 31 条）",
        "反对收集、使用或披露您数据的权利（第 32 条）",
        "要求删除或销毁数据的权利（第 33 条）",
        "要求限制处理的权利（第 34 条）",
        "要求更正数据以确保准确及最新的权利（第 35 条）",
        "向个人数据保护委员会办公室投诉的权利（第 73 条）",
      ],
    },
    {
      heading: "8. 行使权利与撤回同意",
      body: [
        "您可通过本政策末尾提供的联系方式行使上述权利。我们将在收到请求后 30 天内处理。撤回同意不影响撤回前已进行处理行为的合法性。",
      ],
    },
    {
      heading: "9. Cookie",
      body: [
        "本网站使用网站运行所必需的 Cookie，并在获得您同意后使用分析及营销类 Cookie。您可以设置浏览器拒绝 Cookie，但这可能影响网站部分功能的正常使用。",
        "您可以随时通过网站页脚的“Cookie 偏好设置”链接，授予或撤回对分析及营销类 Cookie 的同意。",
      ],
    },
    {
      heading: "10. 安全措施",
      body: [
        "我们采取适当的技术与管理措施，包括数据传输加密、仅限相关员工访问的权限限制，以及访问日志记录，以防止未经授权的访问、篡改或披露。",
      ],
    },
    {
      heading: "11. 政策变更",
      body: [
        "我们可能不时更新本政策。每当内容发生实质性变更时，我们将发布带有新版本号及生效日期的新版本。您此前给予的同意仍与您当时接受的版本相关联。",
      ],
    },
  ],
  contactHeading: "联系我们",
  contactIntro: "如对本政策有任何疑问，或希望行使您作为数据主体的权利，请通过以下方式联系我们：",
};

// ── Русский ─────────────────────────────────────────────────────────────
const ru: PolicyContent = {
  version: PRIVACY_POLICY_VERSION,
  effectiveDate: PRIVACY_POLICY_EFFECTIVE_DATE,
  title: "Политика конфиденциальности",
  lastUpdatedLabel: "Действует с",
  versionLabel: "Версия",
  intro: [
    "Andaman Asset Solution Co., Ltd. («Компания», «мы») стремится защищать ваши персональные данные. В настоящем уведомлении описано, как мы собираем, используем, раскрываем и храним ваши персональные данные в соответствии с Законом Таиланда о защите персональных данных B.E. 2562 (2019) («PDPA»).",
    "Уведомление распространяется на наш веб-сайт, формы запросов и записи на просмотр объектов, регистрацию на мероприятия, а также на другие каналы продаж Компании.",
  ],
  sections: [
    {
      heading: "1. Оператор данных",
      body: [
        "Andaman Asset Solution Co., Ltd. выступает оператором персональных данных (Data Controller) в отношении данных, собираемых через наш веб-сайт и каналы продаж.",
      ],
    },
    {
      heading: "2. Персональные данные, которые мы собираем",
      bullets: [
        "Идентификационные и контактные данные: имя и фамилия, адрес электронной почты, номер телефона, гражданство",
        "Данные об интересах: проект, по которому вы обратились, и сообщение, указанное в форме",
        "Технические данные: IP-адрес, данные браузера (User Agent), дата и время отправки формы",
        "Данные об источнике перехода: UTM-параметры (utm_source, utm_medium, utm_campaign), позволяющие понять, как вы попали на сайт",
        "Записи о согласии: факт предоставления согласия, дата и время, а также версия настоящего уведомления, которую вы приняли",
      ],
      body: [
        "Мы не собираем специальные категории персональных данных (Sensitive Personal Data) — например, сведения о расе, религии, состоянии здоровья или биометрические данные — через формы на этом сайте.",
      ],
    },
    {
      heading: "3. Цели обработки и правовые основания",
      bullets: [
        "Связь с вами для предоставления информации о проекте, организации просмотров и предложения условий покупки — согласие (ст. 19) и исполнение договора (ст. 24(3))",
        "Рассылка новостей, акций и приглашений на мероприятия — согласие, которое вы можете отозвать в любой момент",
        "Улучшение работы сайта, оценка эффективности маркетинга и предотвращение автоматизированных злоупотреблений формами — законный интерес (ст. 24(5))",
        "Соблюдение применимого законодательства, включая налоговые обязательства и требования законодательства о противодействии отмыванию денег — юридическая обязанность (ст. 24(6))",
      ],
    },
    {
      heading: "4. Раскрытие третьим лицам",
      body: ["Мы не продаём ваши персональные данные. При необходимости мы можем раскрывать их:"],
      bullets: [
        "Поставщикам услуг, обрабатывающим данные от нашего имени, — провайдерам хостинга, электронной почты и CRM-систем — на основании соглашений об обработке данных",
        "Агентам по продажам и деловым партнёрам, уполномоченным связаться с вами по интересующему вас проекту",
        "Государственным органам или иным уполномоченным инстанциям в случаях, предусмотренных законом",
      ],
    },
    {
      heading: "5. Международная передача данных",
      body: [
        "Некоторые из наших поставщиков услуг хранят данные на серверах за пределами Таиланда. В таких случаях мы обеспечиваем надлежащие меры защиты в соответствии со статьями 28 и 29 PDPA.",
      ],
    },
    {
      heading: "6. Сроки хранения данных",
      bullets: [
        "Данные потенциальных клиентов, не заключивших сделку: хранятся не более 2 лет с момента последнего обращения",
        "Данные клиентов по договору купли-продажи: хранятся в течение срока, предусмотренного законом, как правило, до 10 лет после завершения договора",
        "Записи о согласии: хранятся в течение всего срока действия согласия и ещё 1 год после его отзыва в качестве подтверждения соблюдения требований",
      ],
    },
    {
      heading: "7. Ваши права как субъекта данных",
      body: ["В соответствии с PDPA вы имеете право:"],
      bullets: [
        "Отозвать согласие (ст. 19)",
        "Получить доступ к своим персональным данным и их копию (ст. 30)",
        "Запросить перенос данных другому оператору (ст. 31)",
        "Возразить против сбора, использования или раскрытия ваших данных (ст. 32)",
        "Запросить удаление или уничтожение данных (ст. 33)",
        "Запросить ограничение обработки (ст. 34)",
        "Запросить исправление данных для обеспечения их точности и актуальности (ст. 35)",
        "Подать жалобу в Управление комитета по защите персональных данных (ст. 73)",
      ],
    },
    {
      heading: "8. Реализация прав и отзыв согласия",
      body: [
        "Вы можете реализовать перечисленные права, связавшись с нами по контактным данным, указанным в конце документа. Мы рассмотрим запрос в течение 30 дней с момента получения. Отзыв согласия не влияет на законность обработки, проведённой до отзыва.",
      ],
    },
    {
      heading: "9. Файлы cookie",
      body: [
        "Наш сайт использует файлы cookie, необходимые для его работы, а также — с вашего согласия — аналитические и маркетинговые файлы cookie. Вы можете настроить браузер так, чтобы отклонять cookie, однако это может повлиять на работу некоторых разделов сайта.",
        "Вы можете предоставить или отозвать согласие на аналитические и маркетинговые cookie в любое время через ссылку «Настройки cookie» в нижней части сайта.",
      ],
    },
    {
      heading: "10. Меры безопасности",
      body: [
        "Мы применяем соответствующие технические и организационные меры, включая шифрование данных при передаче, ограничение доступа только для сотрудников, которым это необходимо по работе, и ведение журнала доступа, чтобы предотвратить несанкционированный доступ, изменение или раскрытие данных.",
      ],
    },
    {
      heading: "11. Изменения в настоящем уведомлении",
      body: [
        "Мы можем периодически обновлять данное уведомление. При каждом существенном изменении мы публикуем новую версию с указанием номера версии и даты вступления в силу. Ранее данное вами согласие остаётся привязанным к той версии, которую вы приняли на тот момент.",
      ],
    },
  ],
  contactHeading: "Свяжитесь с нами",
  contactIntro:
    "По вопросам, связанным с настоящим уведомлением, или для реализации ваших прав субъекта данных, пожалуйста, свяжитесь с нами:",
};

export const privacyPolicy: Record<"th" | "en" | "zh" | "ru", PolicyContent> = { th, en, zh, ru };

export function getPrivacyPolicy(locale: string): PolicyContent {
  return privacyPolicy[locale as keyof typeof privacyPolicy] ?? privacyPolicy.en;
}
