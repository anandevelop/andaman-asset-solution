/**
 * Tells the team on LINE that an AI client asked to delete something only a
 * person may approve. Passed to requestDeletion() as `onHumanRequest` by the
 * tools that need it. Never throws.
 */

import "server-only";
import { pushLineAlert } from "@/lib/line";

export async function announceDeletionRequest(request: { id: string; summary: string }): Promise<void> {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://andamanassetsolution.com").replace(/\/+$/, "");
  await pushLineAlert({
    kind: "approval",
    title: "🤖 AI ขออนุมัติลบข้อมูล",
    rows: [
      ["รายการ", request.summary.slice(0, 280)],
      ["สถานะ", "ยังไม่ถูกลบ รอผู้ดูแลอนุมัติ"],
    ],
    url: `${site}/th/admin/settings/integrations`,
    urlLabel: "เปิดหน้าอนุมัติ",
  });
}
