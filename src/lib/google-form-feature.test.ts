import { describe, expect, it, afterEach } from "vitest";
import {
  GOOGLE_FORM_SYNC_DISABLED_MESSAGE,
  isGoogleFormSyncEnabled,
} from "./google-form-feature";

describe("isGoogleFormSyncEnabled", () => {
  const prev = process.env.GOOGLE_FORM_SYNC_ENABLED;

  afterEach(() => {
    if (prev === undefined) delete process.env.GOOGLE_FORM_SYNC_ENABLED;
    else process.env.GOOGLE_FORM_SYNC_ENABLED = prev;
  });

  it("desligado por padrão", () => {
    delete process.env.GOOGLE_FORM_SYNC_ENABLED;
    expect(isGoogleFormSyncEnabled()).toBe(false);
  });

  it("liga só com GOOGLE_FORM_SYNC_ENABLED=true", () => {
    process.env.GOOGLE_FORM_SYNC_ENABLED = "true";
    expect(isGoogleFormSyncEnabled()).toBe(true);
  });

  it("mensagem de desativado definida", () => {
    expect(GOOGLE_FORM_SYNC_DISABLED_MESSAGE.length).toBeGreaterThan(10);
  });
});
