/**
 * Regressão real dos handlers GET/POST /api/ops vs comportamento 0ee8656.
 * Deve falhar no commit 05dafed (401 global) e passar após a correção.
 */
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

process.env.CORTELY_SESSION_SECRET ??=
  "ci-session-secret-at-least-16-chars";
process.env.NEXT_PUBLIC_DEMO_MODE ??= "true";
process.env.CORTELY_OWNER_PASSWORD ??= "ownerpass123";

const DEMO_SHOP = "11111111-1111-4111-8111-111111111111";
const OTHER_SHOP = "99999999-9999-4999-8999-999999999999";

async function main() {
  let passed = 0;
  const ok = (name: string) => {
    passed += 1;
    console.log(`✓ ${name}`);
  };

  const { GET, POST } = await import("../src/app/api/ops/route");
  const auth = await import("../src/lib/auth");
  const { demoStore } = await import("../src/lib/demo-store");
  const {
    clearRegistryBootCache,
    loadRegistry,
    bundledRegistrySeedText,
  } = await import("../src/lib/ops-registry");

  // Registry all-json em cache (como boot saudável)
  clearRegistryBootCache();
  const snap = loadRegistry({
    tableExists: false,
    fileContents: bundledRegistrySeedText(),
  });
  const { resolveRegistryAtBoot } = await import("../src/lib/ops-registry");
  await resolveRegistryAtBoot({
    env: { NEXT_PUBLIC_DEMO_MODE: "true" } as unknown as NodeJS.ProcessEnv,
    readSeedFile: () => bundledRegistrySeedText(),
    log: () => {},
  });
  assert.equal(snap.loadedFrom, "file");

  const ownerList = demoStore.listStaff(DEMO_SHOP).find((s) => s.role === "owner");
  assert.ok(ownerList);
  const owner = demoStore.getStaffById(ownerList.id);
  assert.ok(owner);
  const ownerTok = auth.encodeSession({
    id: owner.id,
    email: owner.email,
    full_name: owner.full_name,
    role: owner.role,
    barbershop_id: owner.barbershop_id,
    barber_id: owner.barber_id,
    session_generation: owner.session_generation ?? 1,
  });

  function makeReq(
    method: string,
    path: string,
    opts?: { cookie?: string; body?: unknown },
  ) {
    const headers = new Headers();
    if (opts?.cookie) headers.set("cookie", opts.cookie);
    if (opts?.body !== undefined) {
      headers.set("content-type", "application/json");
    }
    return new NextRequest(new URL(path, "http://localhost"), {
      method,
      headers,
      body:
        opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  }

  // GET snapshot staff
  const getSnap = await GET(
    makeReq("GET", "/api/ops", {
      cookie: `${auth.SESSION_COOKIE}=${ownerTok}`,
    }),
  );
  assert.equal(getSnap.status, 200);
  const snapBody = await getSnap.json();
  assert.ok(Array.isArray(snapBody.products));
  assert.ok(snapBody.session?.email === owner.email);
  ok("GET snapshot staff → 200 + corpo com products/session");

  // GET sem login
  const getAnon = await GET(makeReq("GET", "/api/ops"));
  assert.equal(getAnon.status, 401);
  const anonBody = await getAnon.json();
  assert.ok(anonBody.error);
  ok("GET sem login → 401");

  // POST estoque staff
  const productsBefore = snapBody.products as Array<{ id: string; stock_qty: number }>;
  const product = productsBefore[0];
  assert.ok(product);
  const adj = await POST(
    makeReq("POST", "/api/ops", {
      cookie: `${auth.SESSION_COOKIE}=${ownerTok}`,
      body: {
        action: "adjust_stock",
        product_id: product.id,
        delta: 1,
        reason: "regressao-estoque",
      },
    }),
  );
  assert.equal(adj.status, 200);
  const adjBody = await adj.json();
  assert.equal(adjBody.product?.stock_qty, product.stock_qty + 1);
  assert.equal(adjBody.movement?.delta, 1);
  // reverte
  await POST(
    makeReq("POST", "/api/ops", {
      cookie: `${auth.SESSION_COOKIE}=${ownerTok}`,
      body: {
        action: "adjust_stock",
        product_id: product.id,
        delta: -1,
        reason: "regressao-estoque-revert",
      },
    }),
  );
  ok("POST adjust_stock staff → 200");

  // add_review com prova válida SEM sessão
  const catalog = demoStore.getCatalog("navalha-negra");
  assert.ok(catalog, "catalog demo ausente");
  const barber = catalog.barbers[0];
  const service = catalog.services[0];
  assert.ok(barber && service);
  const phone = "11977776666";
  const appt = demoStore.createAppointment({
    barbershop_id: DEMO_SHOP,
    barber_id: barber.id,
    service_id: service.id,
    client_name: "Cliente Review",
    client_phone: phone,
    appointment_date: "2030-01-15",
    start_time: "10:00",
  });
  const clientTok = auth.encodeClientProof(phone, DEMO_SHOP);
  const reviewOk = await POST(
    makeReq("POST", "/api/ops", {
      body: {
        action: "add_review",
        client_name: "Cliente Review",
        client_phone: phone,
        client_token: clientTok,
        appointment_id: appt.id,
        rating: 5,
        comment: "ótimo",
      },
    }),
  );
  assert.equal(reviewOk.status, 200, await reviewOk.clone().text());
  const reviewBody = await reviewOk.json();
  assert.ok(reviewBody.review?.id);
  ok("add_review com prova válida SEM sessão → 2xx");

  // add_review sem prova e sem sessão
  const reviewNo = await POST(
    makeReq("POST", "/api/ops", {
      body: {
        action: "add_review",
        client_name: "Sem Prova",
        client_phone: "11966665555",
        rating: 4,
      },
    }),
  );
  assert.equal(reviewNo.status, 401);
  ok("add_review sem prova e sem sessão → 401");

  // staff de outra barbearia → 403
  const other = demoStore.upsertStaff({
    barbershop_id: OTHER_SHOP,
    email: `other-shop-${Date.now()}@cortely.demo`,
    full_name: "Outra Loja",
    role: "owner",
  });
  const otherTok = auth.encodeSession({
    id: other.id,
    email: other.email,
    full_name: other.full_name,
    role: other.role,
    barbershop_id: other.barbershop_id,
    barber_id: other.barber_id ?? null,
    session_generation: 1,
  });
  const otherGet = await GET(
    makeReq("GET", "/api/ops", {
      cookie: `${auth.SESSION_COOKIE}=${otherTok}`,
    }),
  );
  assert.equal(otherGet.status, 403);
  const otherPost = await POST(
    makeReq("POST", "/api/ops", {
      cookie: `${auth.SESSION_COOKIE}=${otherTok}`,
      body: {
        action: "adjust_stock",
        product_id: product.id,
        delta: 1,
        reason: "cross-shop",
      },
    }),
  );
  assert.equal(otherPost.status, 403);
  ok("staff outra barbearia GET/POST → 403");

  console.log(
    `Security fase 1.B.1 ops route regression: PASSED (${passed} asserts)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
