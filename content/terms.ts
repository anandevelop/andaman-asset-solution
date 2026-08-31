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
 * before publishing. Bump TERMS_OF_SERVICE_VERSION (e.g. "terms-v2") if the
 * substance changes after launch, following the same versioning convention
 * as PRIVACY_POLICY_VERSION.
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
};

export const TERMS_OF_SERVICE_VERSION = "terms-v1";
export const TERMS_OF_SERVICE_EFFECTIVE_DATE = "2026-01-01";

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
        "การเข้าถึงหรือใช้งานเว็บไซต์นี้ไม่ว่าในลักษณะใด ถือว่าท่านตกลงผูกพันตามข้อกำหนดฉบับนี้ รวมถึงนโยบายความเป็นส่วนตัวของเราซึ่งถือเป็นส่วนหนึ่งของข้อกำหนดนี้โดยการอ้างอิง",
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
        "เนื้อหาบนเว็บไซต์นี้ รวมถึงราคา แบบแปลน ขนาดพื้นที่ ภาพถ่าย ภาพจำลอง (Rendering) และวันที่คาดว่าจะก่อสร้างแล้วเสร็จ จัดทำขึ้นเพื่อวัตถุประสงค์ในการให้ข้อมูลเบื้องต้นเท่านั้น และอาจเปลี่ยนแปลงได้โดยไม่ต้องแจ้งให้ทราบล่วงหน้า",
        "ข้อมูลบนเว็บไซต์นี้ไม่ถือเป็นคำเสนอขาย คำมั่น หรือสัญญาที่มีผลผูกพันทางกฎหมายแต่อย่างใด ธุรกรรมการซื้อขายที่แท้จริงจะเกิดขึ้นได้ก็ต่อเมื่อมีการลงนามในสัญญาจะซื้อจะขายหรือสัญญาซื้อขายฉบับแยกต่างหากระหว่างท่านกับบริษัทเท่านั้น และให้ถือข้อความในสัญญาฉบับดังกล่าวเป็นสำคัญกรณีมีความขัดแย้งกับเนื้อหาบนเว็บไซต์นี้",
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
      ],
    },
    {
      heading: "7. ข้อจำกัดความรับผิดชอบ",
      body: [
        "เว็บไซต์นี้และเนื้อหาให้บริการ “ตามสภาพที่เป็นอยู่” โดยไม่มีการรับประกันไม่ว่าโดยชัดแจ้งหรือโดยปริยาย บริษัทไม่รับประกันว่าเว็บไซต์จะทำงานโดยปราศจากข้อผิดพลาดหรือการหยุดชะงัก และไม่รับผิดต่อความเสียหายใด ๆ ที่เกิดจากการใช้หรือไม่สามารถใช้งานเว็บไซต์นี้ เท่าที่กฎหมายอนุญาต",
      ],
    },
    {
      heading: "8. การชดใช้ค่าเสียหาย",
      body: [
        "ท่านตกลงชดใช้ค่าเสียหายให้แก่บริษัท กรรมการ พนักงาน และตัวแทน จากข้อเรียกร้อง ความสูญเสีย หรือค่าใช้จ่ายใด ๆ ที่เกิดจากการที่ท่านใช้งานเว็บไซต์นี้โดยฝ่าฝืนข้อกำหนดฉบับนี้",
      ],
    },
    {
      heading: "9. ความเป็นส่วนตัว",
      body: [
        `เราประมวลผลข้อมูลส่วนบุคคลที่เก็บรวบรวมผ่านเว็บไซต์นี้ตามที่ระบุไว้ใน${"นโยบายความเป็นส่วนตัว"} (${siteConfig.legal.privacyPolicyPath}) ของเรา ซึ่งถือเป็นส่วนหนึ่งของข้อกำหนดฉบับนี้`,
      ],
    },
    {
      heading: "10. กฎหมายที่ใช้บังคับและเขตอำนาจศาล",
      body: [
        "ข้อกำหนดฉบับนี้อยู่ภายใต้บังคับและตีความตามกฎหมายไทย ข้อพิพาทใด ๆ ที่เกิดขึ้นให้อยู่ในเขตอำนาจของศาลไทยที่มีเขตอำนาจเหนือคดีดังกล่าว",
      ],
    },
    {
      heading: "11. การเปลี่ยนแปลงข้อกำหนด",
      body: [
        "เราอาจปรับปรุงข้อกำหนดฉบับนี้เป็นครั้งคราว โดยจะเผยแพร่เวอร์ชันใหม่พร้อมระบุหมายเลขเวอร์ชันและวันที่มีผลบังคับใช้บนหน้านี้ การใช้งานเว็บไซต์ต่อไปภายหลังการเปลี่ยนแปลงถือว่าท่านยอมรับข้อกำหนดฉบับที่ปรับปรุงแล้ว",
      ],
    },
  ],
  contactHeading: "ติดต่อเรา",
  contactIntro: "หากมีข้อสงสัยเกี่ยวกับข้อกำหนดฉบับนี้ กรุณาติดต่อ:",
};

// ── English ─────────────────────────────────────────────────────────────
const en: TermsContent = {
  version: TERMS_OF_SERVICE_VERSION,
  effectiveDate: TERMS_OF_SERVICE_EFFECTIVE_DATE,
  title: "Terms of Service",
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
        "Accessing or using this website in any way constitutes your agreement to be bound by these Terms, together with our Privacy Policy, which is incorporated into these Terms by reference.",
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
        "Content on this website — including prices, floor plans, unit sizes, photographs, renderings and estimated completion dates — is provided for general informational purposes only and is subject to change without notice.",
        "Nothing on this website constitutes an offer, promise or legally binding contract of any kind. An actual sale can only arise from a separate reservation agreement or sale and purchase agreement signed by you and the Company, and the terms of that signed agreement will govern in the event of any conflict with the content of this website.",
      ],
    },
    {
      heading: "4. Intellectual property",
      body: [
        "All content on this website — including text, photographs, logos, graphics and video — is the property of the Company or its licensors and is protected by applicable intellectual property laws. You may not copy, reproduce, modify or use it for commercial purposes without our prior written consent.",
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
      ],
    },
    {
      heading: "7. Disclaimer of warranties",
      body: [
        "This website and its content are provided “as is”, without warranties of any kind, express or implied. We do not warrant that the website will be error-free or uninterrupted, and to the extent permitted by law we are not liable for any loss arising from your use of, or inability to use, this website.",
      ],
    },
    {
      heading: "8. Indemnification",
      body: [
        "You agree to indemnify the Company, its directors, employees and agents against any claims, losses or expenses arising from your use of this website in breach of these Terms.",
      ],
    },
    {
      heading: "9. Privacy",
      body: [
        `We process personal data collected through this website as described in our Privacy Policy (${siteConfig.legal.privacyPolicyPath}), which forms part of these Terms.`,
      ],
    },
    {
      heading: "10. Governing law and jurisdiction",
      body: [
        "These Terms are governed by and construed in accordance with the laws of Thailand. Any dispute arising from these Terms shall be subject to the exclusive jurisdiction of the competent Thai courts.",
      ],
    },
    {
      heading: "11. Changes to these Terms",
      body: [
        "We may update these Terms from time to time. Whenever we do, we will publish a new version on this page with its own version number and effective date. Continued use of the website after such changes constitutes your acceptance of the updated Terms.",
      ],
    },
  ],
  contactHeading: "Contact us",
  contactIntro: "If you have questions about these Terms, please contact:",
};

// ── 简体中文 ─────────────────────────────────────────────────────────────
const zh: TermsContent = {
  version: TERMS_OF_SERVICE_VERSION,
  effectiveDate: TERMS_OF_SERVICE_EFFECTIVE_DATE,
  title: "服务条款",
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
        "以任何方式访问或使用本网站，均视为您同意受本条款以及我们的隐私政策约束，隐私政策通过引用并入本条款。",
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
        "本网站上的内容，包括价格、平面图、单位面积、照片、效果图及预计竣工日期，仅供一般参考之用，可能随时变更，恕不另行通知。",
        "本网站上的任何内容均不构成要约、承诺或任何具有法律约束力的合同。实际的买卖交易仅在您与本公司签署单独的预订协议或买卖合同后方能成立，如该签署合同与本网站内容存在冲突，以该合同条款为准。",
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
      ],
    },
    {
      heading: "7. 免责声明",
      body: [
        "本网站及其内容按“现状”提供，不附带任何明示或暗示的保证。我们不保证网站不会出现错误或不会中断，在法律允许的范围内，我们对因使用或无法使用本网站而产生的任何损失不承担责任。",
      ],
    },
    {
      heading: "8. 赔偿",
      body: [
        "您同意就因您违反本条款使用本网站而引起的任何索赔、损失或费用，向本公司及其董事、员工和代理人作出赔偿。",
      ],
    },
    {
      heading: "9. 隐私",
      body: [
        `我们按照本公司隐私政策（${siteConfig.legal.privacyPolicyPath}）中所述方式处理通过本网站收集的个人数据，该隐私政策构成本条款的一部分。`,
      ],
    },
    {
      heading: "10. 适用法律与管辖权",
      body: [
        "本条款受泰国法律管辖并据其解释。因本条款引起的任何争议，应由具有管辖权的泰国法院专属管辖。",
      ],
    },
    {
      heading: "11. 条款变更",
      body: [
        "我们可能不时更新本条款。每次更新时，我们将在本页面发布带有新版本号及生效日期的新版本。变更后继续使用本网站即视为您接受更新后的条款。",
      ],
    },
  ],
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
        "Доступ к веб-сайту или его использование в любой форме означает ваше согласие соблюдать настоящие Условия, а также нашу Политику конфиденциальности, которая включена в настоящие Условия посредством ссылки.",
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
        "Информация на этом сайте, включая цены, планировки, площади помещений, фотографии, визуализации и предполагаемые сроки завершения строительства, предоставляется исключительно в справочных целях и может быть изменена без предварительного уведомления.",
        "Ничто на этом веб-сайте не является офертой, обещанием или юридически обязывающим договором какого-либо рода. Фактическая сделка купли-продажи может возникнуть только на основании отдельного договора резервирования или договора купли-продажи, подписанного вами и Компанией; в случае противоречия между условиями такого подписанного договора и содержанием настоящего сайта преимущественную силу имеют условия договора.",
      ],
    },
    {
      heading: "4. Интеллектуальная собственность",
      body: [
        "Всё содержимое настоящего веб-сайта — тексты, фотографии, логотипы, графика и видео — является собственностью Компании или её лицензиаров и охраняется применимым законодательством об интеллектуальной собственности. Копирование, воспроизведение, изменение или использование в коммерческих целях без предварительного письменного согласия Компании запрещено.",
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
      ],
    },
    {
      heading: "7. Отказ от гарантий",
      body: [
        "Настоящий веб-сайт и его содержимое предоставляются «как есть», без каких-либо гарантий, явных или подразумеваемых. Мы не гарантируем безошибочную и бесперебойную работу сайта и, в пределах, допускаемых законом, не несём ответственности за какие-либо убытки, возникшие в результате использования или невозможности использования данного сайта.",
      ],
    },
    {
      heading: "8. Возмещение убытков",
      body: [
        "Вы соглашаетесь возместить Компании, её директорам, сотрудникам и представителям любые претензии, убытки или расходы, возникшие в результате использования вами данного веб-сайта в нарушение настоящих Условий.",
      ],
    },
    {
      heading: "9. Конфиденциальность",
      body: [
        `Мы обрабатываем персональные данные, собираемые через настоящий веб-сайт, в соответствии с нашей Политикой конфиденциальности (${siteConfig.legal.privacyPolicyPath}), которая является частью настоящих Условий.`,
      ],
    },
    {
      heading: "10. Применимое право и юрисдикция",
      body: [
        "Настоящие Условия регулируются и толкуются в соответствии с законодательством Таиланда. Любой спор, возникающий из настоящих Условий, подлежит рассмотрению исключительно в компетентных судах Таиланда.",
      ],
    },
    {
      heading: "11. Изменения настоящих Условий",
      body: [
        "Мы можем время от времени обновлять настоящие Условия. При каждом обновлении мы публикуем на этой странице новую версию с указанием номера версии и даты вступления в силу. Дальнейшее использование сайта после таких изменений означает ваше согласие с обновлёнными Условиями.",
      ],
    },
  ],
  contactHeading: "Свяжитесь с нами",
  contactIntro: "По вопросам, связанным с настоящими Условиями, пожалуйста, свяжитесь с нами:",
};

export const termsOfService: Record<"th" | "en" | "zh" | "ru", TermsContent> = { th, en, zh, ru };

export function getTermsOfService(locale: string): TermsContent {
  return termsOfService[locale as keyof typeof termsOfService] ?? termsOfService.en;
}
