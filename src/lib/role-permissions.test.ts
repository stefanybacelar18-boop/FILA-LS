import { describe, expect, it } from "vitest";
import {
  assertStatusAllowed,
  canAccessAdmin,
  getQueuePermissions,
  isStaffQueueRole,
  staffHomePath,
} from "./role-permissions";

describe("isStaffQueueRole", () => {
  it("aceita empilhador e administrador", () => {
    expect(isStaffQueueRole("empilhador")).toBe(true);
    expect(isStaffQueueRole("administrador")).toBe(true);
    expect(isStaffQueueRole("motorista")).toBe(false);
  });
});

describe("getQueuePermissions", () => {
  it("admin edita doca e prioridade", () => {
    const perms = getQueuePermissions("administrador");
    expect(perms.canEditDoca).toBe(true);
    expect(perms.canSetPrioridade).toBe(true);
  });

  it("empilhador não edita doca", () => {
    const perms = getQueuePermissions("empilhador");
    expect(perms.canEditDoca).toBe(false);
    expect(perms.canChamarWhatsApp).toBe(true);
  });
});

describe("assertStatusAllowed", () => {
  it("empilhador pode marcar ausente", () => {
    expect(assertStatusAllowed("empilhador", "ausente")).toBe(true);
  });

  it("empilhador não altera doca via status admin-only", () => {
    expect(assertStatusAllowed("empilhador", "em_descarga")).toBe(false);
  });

  it("empilhador pode reabrir ausente para aguardando", () => {
    expect(
      assertStatusAllowed("empilhador", "aguardando_descarregamento", "ausente")
    ).toBe(true);
  });
});

describe("canAccessAdmin", () => {
  it("só administrador", () => {
    expect(canAccessAdmin("administrador")).toBe(true);
    expect(canAccessAdmin("empilhador")).toBe(false);
  });
});

describe("staffHomePath", () => {
  it("redireciona por perfil", () => {
    expect(staffHomePath("administrador")).toBe("/admin/fila");
    expect(staffHomePath("empilhador")).toBe("/empilhador");
  });
});
