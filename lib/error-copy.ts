/**
 * lib/error-copy.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Copy and locale detection for the three public error boundaries:
 * app/[locale]/error.tsx, app/[locale]/not-found.tsx and
 * app/global-error.tsx.
 *
 * Why they cannot use next-intl, and therefore why this file exists: each
 * of them may be rendering *because* message loading failed, and
 * useTranslations() would then throw inside the boundary itself — a crash
 * inside the crash handler. Each boundary's own header records this.
 *
 * It also deliberately does not import `locales` from @/i18n. That module
 * pulls in next-intl/server and next/navigation, which is precisely the
 * dependency the boundaries must not carry. The locale list is duplicated
 * here on purpose; tests/error-copy.test.ts asserts the two never drift, so
 * adding a fifth locale fails there rather than silently serving Thai to it.
 *
 * Three tables in one module rather than three inline objects, because the
 * bug this replaces was the boundaries disagreeing about which locale a
 * visitor gets: error.tsx served English to zh and ru, global-error.tsx
 * served Thai to the same visitors, and not-found.tsx had already crashed
 * once on `undefined.code` when the URL matched a locale the table did not
 * have.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type BoundaryLocale = "en" | "th" | "zh" | "ru";

const BOUNDARY_LOCALES: BoundaryLocale[] = ["en", "th", "zh", "ru"];

export const BOUNDARY_DEFAULT_LOCALE: BoundaryLocale = "th";

/**
 * The locale segment of a path, or the default.
 *
 * Matched as a whole segment, not as a prefix: `/thailand-guide` is not
 * Thai and `/english` is not English. Never returns a locale the tables
 * below lack, which is the specific failure not-found.tsx hit before.
 */
export function localeFromPathname(
  pathname: string | null | undefined,
): BoundaryLocale {
  const path = pathname ?? "";

  return (
    BOUNDARY_LOCALES.find(
      (locale) => path === `/${locale}` || path.startsWith(`/${locale}/`),
    ) ?? BOUNDARY_DEFAULT_LOCALE
  );
}

// ── app/[locale]/error.tsx ───────────────────────────────────────────────

type RouteErrorCopy = {
  title: string;
  body: string;
  dbTitle: string;
  dbBody: string;
  retry: string;
};

export const ROUTE_ERROR_COPY: Record<BoundaryLocale, RouteErrorCopy> = {
  th: {
    title: "ขออภัย เกิดข้อผิดพลาด",
    body: "เราไม่สามารถแสดงหน้านี้ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง หรือติดต่อเราโดยตรง",
    dbTitle: "เชื่อมต่อฐานข้อมูลไม่ได้",
    dbBody: "ข้อมูลโครงการยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกสักครู่",
    retry: "ลองใหม่อีกครั้ง",
  },
  en: {
    title: "Something went wrong",
    body: "We couldn't load this page right now. Please try again, or contact us directly.",
    dbTitle: "Database unavailable",
    dbBody: "Project data isn't reachable at the moment. Please try again shortly.",
    retry: "Try again",
  },
  zh: {
    title: "出现了一些问题",
    body: "我们暂时无法加载此页面。请重试，或直接与我们联系。",
    dbTitle: "数据库暂时无法访问",
    dbBody: "项目数据暂时无法读取，请稍后再试。",
    retry: "重试",
  },
  ru: {
    title: "Что-то пошло не так",
    body: "Сейчас мы не можем загрузить эту страницу. Пожалуйста, попробуйте ещё раз или свяжитесь с нами напрямую.",
    dbTitle: "База данных недоступна",
    dbBody: "Данные о проектах сейчас недоступны. Пожалуйста, попробуйте немного позже.",
    retry: "Попробовать снова",
  },
};

// ── app/global-error.tsx ─────────────────────────────────────────────────

type GlobalErrorCopy = {
  title: string;
  body: string;
  retry: string;
  home: string;
  reference: string;
};

export const GLOBAL_ERROR_COPY: Record<BoundaryLocale, GlobalErrorCopy> = {
  th: {
    title: "ระบบขัดข้อง",
    body: "ขออภัย เกิดข้อผิดพลาดที่เราไม่ได้คาดไว้ ทีมงานได้รับแจ้งแล้ว กรุณาลองใหม่อีกครั้ง",
    retry: "ลองใหม่อีกครั้ง",
    home: "กลับหน้าแรก",
    reference: "รหัสอ้างอิง",
  },
  en: {
    title: "Something went badly wrong",
    body: "An unexpected error stopped this page from loading. Our team has been notified. Please try again.",
    retry: "Try again",
    home: "Back to home",
    reference: "Reference",
  },
  zh: {
    title: "系统发生严重错误",
    body: "意外错误导致此页面无法加载。我们的团队已收到通知。请重试。",
    retry: "重试",
    home: "返回首页",
    reference: "参考编号",
  },
  ru: {
    title: "Произошла серьёзная ошибка",
    body: "Непредвиденная ошибка помешала загрузке страницы. Наша команда уже уведомлена. Пожалуйста, попробуйте ещё раз.",
    retry: "Попробовать снова",
    home: "На главную",
    reference: "Код обращения",
  },
};

// ── app/[locale]/not-found.tsx ───────────────────────────────────────────

type NotFoundCopy = {
  code: string;
  title: string;
  body: string;
  home: string;
  projects: string;
  news: string;
};

export const NOT_FOUND_COPY: Record<BoundaryLocale, NotFoundCopy> = {
  th: {
    code: "404",
    title: "ไม่พบหน้าที่ค้นหา",
    body: "หน้านี้อาจถูกย้าย เปลี่ยนชื่อ หรือไม่มีอยู่แล้ว ลองเริ่มจากลิงก์ด้านล่างดูครับ",
    home: "หน้าแรก",
    projects: "โครงการทั้งหมด",
    news: "ข่าวสาร",
  },
  en: {
    code: "404",
    title: "We couldn't find that page",
    body: "It may have moved, been renamed, or never existed. One of these should get you back on track.",
    home: "Home",
    projects: "All projects",
    news: "News",
  },
  zh: {
    code: "404",
    title: "找不到该页面",
    body: "该页面可能已被移动、更名，或从未存在。以下链接可以帮您回到正轨。",
    home: "首页",
    projects: "全部项目",
    news: "新闻资讯",
  },
  ru: {
    code: "404",
    title: "Страница не найдена",
    body: "Возможно, она была перемещена, переименована или никогда не существовала. Эти ссылки помогут вернуться.",
    home: "Главная",
    projects: "Все проекты",
    news: "Новости",
  },
};
