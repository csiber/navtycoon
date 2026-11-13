// src/lib/play/cosmetics.ts — az AikaHub-on szerzett kozmetikai jogosultságok hatása a /play felületen (2026-11-13).
//
//  - rack_skin_colo  → „colo” rack-bőr: meleg grafit keret, borostyán élfény és ketrec-rács a 3D racken, borostyán
//                      szegély a 2D rack-sorokon (vezérlő Flotta-panel + Szerverek lap).
//  - rack_led_theme  → „aurora” LED-téma: türkiz (ok) / ibolya (üresjárat) / rózsaszín (középső) LED-ek. A figyelmeztető
//                      (borostyán) és a hiba (piros) jelzés változatlan marad, hogy az állapot továbbra is olvasható legyen.
//  - company_banner  → cégzászló: díszcsík és „Hyperscaler” zászló a cégkártyán (oldalsáv, minden /play oldalon).
//
// Szabályok: a jogosultságot MINDIG a szerver dönti el (fetchHubEntitlements, 10 perces gyorsítótárral) — a kliens
// semmit nem kérhet magának, a lapba csak a kész osztálynevek kerülnek. Tisztán vizuális: a gazdaságra (pénz, ügyfél,
// ticket, kapacitás) nincs hatása. Kötés / kulcs / hatókör nélkül, vagy Hub-hibánál: nincs kozmetika (csendben).

import { fetchHubEntitlements, hubEntitlementId, type HubCtx } from '../aikahub-achi';

export interface Cosmetics {
  /** Rack-bőr (null = alap indigó). */
  rackSkin: 'colo' | null;
  /** LED-téma (null = alap menta/indigó). */
  ledTheme: 'aurora' | null;
  /** Cégzászló a cégkártyán. */
  banner: boolean;
}

export const NO_COSMETICS: Cosmetics = Object.freeze({ rackSkin: null, ledTheme: null, banner: false }) as Cosmetics;

/** A Hub-értékekből ('hyperscales:rack-skin-colo' …) a felület beállításai. Ismeretlen érték nem számít. */
export function cosmeticsFromEntitlements(values: readonly string[]): Cosmetics {
  const has = (n: 'rack_skin_colo' | 'rack_led_theme' | 'company_banner') => values.includes(hubEntitlementId(n));
  return {
    rackSkin: has('rack_skin_colo') ? 'colo' : null,
    ledTheme: has('rack_led_theme') ? 'aurora' : null,
    banner: has('company_banner'),
  };
}

type DbArg = Parameters<typeof fetchHubEntitlements>[0];

/** A tag kozmetikái (szerveroldalon). Hibát nem dob; hub nélkül nincs kérés. */
export async function loadCosmetics(db: DbArg, hub: HubCtx | null | undefined, userId: string): Promise<Cosmetics> {
  if (!hub || !(hub.key ?? '').trim()) return NO_COSMETICS;
  try {
    return cosmeticsFromEntitlements(await fetchHubEntitlements(db, hub, userId));
  } catch {
    return NO_COSMETICS;
  }
}

/** A 2D rack-tartó (.rack-body / .rack-vis) kiegészítő osztályai: '' vagy ' skin-colo led-aurora'. Csak fix szavak. */
export function rackCosmeticClass(c: Cosmetics | null | undefined): string {
  if (!c) return '';
  return (c.rackSkin === 'colo' ? ' skin-colo' : '') + (c.ledTheme === 'aurora' ? ' led-aurora' : '');
}

/** A 3D racknek átadott (JSON) beállítás — csak a két ismert érték mehet ki. */
export function rack3dCosmetics(c: Cosmetics | null | undefined): { skin: 'colo' | null; led: 'aurora' | null } {
  return { skin: c?.rackSkin === 'colo' ? 'colo' : null, led: c?.ledTheme === 'aurora' ? 'aurora' : null };
}
