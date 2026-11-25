import { describe, expect, it } from "vitest";
import { applicationSchema, fieldErrors, phoneDigits, purgeDate, MAX_FILES } from "@/lib/careers/fields";

const valid = {
  positionId: "pos_1",
  firstName: "สมชาย",
  lastName: "ใจดี",
  email: "somchai@example.com",
  phone: "081-234-5678",
  education: "bachelor",
  expectedSalary: "35000",
  locale: "th",
  consent: true,
  files: [],
};

describe("the job application schema", () => {
  it("accepts the seven fields and consent", () => {
    const parsed = applicationSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.expectedSalary).toBe(35000);
  });

  it("refuses an application without consent", () => {
    for (const consent of [false, undefined, "true"]) {
      const parsed = applicationSchema.safeParse({ ...valid, consent });
      expect(parsed.success, String(consent)).toBe(false);
    }
  });

  it("names the field that is wrong", () => {
    const parsed = applicationSchema.safeParse({ ...valid, email: "somchai@", firstName: " ", expectedSalary: "abc" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const errors = fieldErrors(parsed.error);
      expect(Object.keys(errors).sort()).toEqual(["email", "expectedSalary", "firstName"]);
    }
  });

  it("asks for a salary rather than reading an empty box as zero", () => {
    const parsed = applicationSchema.safeParse({ ...valid, expectedSalary: "" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(fieldErrors(parsed.error)).toEqual({ expectedSalary: "REQUIRED" });
  });

  it("refuses more attachments than the form allows", () => {
    const files = Array.from({ length: MAX_FILES + 1 }, (_, index) => `token-${index}`);
    expect(applicationSchema.safeParse({ ...valid, files }).success).toBe(false);
  });

  it("refuses a phone number that is not one", () => {
    expect(applicationSchema.safeParse({ ...valid, phone: "12" }).success).toBe(false);
    expect(phoneDigits("+66 81-234 5678")).toBe("66812345678");
  });
});

describe("purgeDate", () => {
  it("is the retention period after the application arrived", () => {
    const received = new Date("2026-11-25T03:00:00Z");
    expect(purgeDate(received, 12).toISOString().slice(0, 10)).toBe("2027-11-25");
    expect(purgeDate(received, 3).toISOString().slice(0, 10)).toBe("2027-02-25");
  });
});
