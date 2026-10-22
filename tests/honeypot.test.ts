// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { honeypotValue } from "@/lib/validations";

/*
  The lead and RSVP forms' honeypot. It was a plain input outside
  react-hook-form, so its value never reached the request and the API's
  `if (data.company)` trap caught nothing. onSubmit now reads it off the
  submitted form with this.
*/
function form(company: string) {
  const element = document.createElement("form");
  element.innerHTML = `<input name="company" value="${company}"><input name="name" value="Somchai">`;
  return element;
}

describe("honeypotValue", () => {
  it("reads what a bot typed into the hidden field", () => {
    expect(honeypotValue({ target: form("Acme Ltd") })).toBe("Acme Ltd");
  });

  it("is empty for a person, who never sees the field", () => {
    expect(honeypotValue({ target: form("") })).toBe("");
  });

  it("is empty when there is no form to read", () => {
    expect(honeypotValue(undefined)).toBe("");
    expect(honeypotValue({ target: document.createElement("div") })).toBe("");
  });
});
