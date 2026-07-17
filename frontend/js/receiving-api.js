import { GOOGLE_SCRIPT_WEB_APP_URL } from "./config.js?v=rack-inventory2";
import { getPurchaseOrderDetail, listLocations } from "./api-smooth1.js?v=receiving-pallets1";

const USES_APPS_SCRIPT = Boolean(GOOGLE_SCRIPT_WEB_APP_URL && GOOGLE_SCRIPT_WEB_APP_URL.includes("/exec"));

export async function recommendPutawayLocations(user, input) {
  if (USES_APPS_SCRIPT) {
    return callAppsScriptUncached("recommendPutawayLocations", { user, input });
  }
  return recommendLocally(input);
}

function callAppsScriptUncached(action, payload = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const callback = `sjopsReceiving_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Apps Script request timed out. Check deployment access and version."));
    }, timeoutMs);
    const url = new URL(GOOGLE_SCRIPT_WEB_APP_URL);
    url.searchParams.set("action", action);
    url.searchParams.set("payload", JSON.stringify(payload));
    url.searchParams.set("callback", callback);
    url.searchParams.set("_", Date.now());

    function cleanup() {
      window.clearTimeout(timer);
      delete window[callback];
      script.remove();
    }

    window[callback] = (data) => {
      cleanup();
      if (!data?.ok) {
        reject(new Error(data?.error || "Apps Script request failed."));
        return;
      }
      resolve(data.result);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("Could not reach Apps Script. Check deployment access and version."));
    };
    script.src = url.toString();
    document.body.appendChild(script);
  });
}

async function recommendLocally(input = {}) {
  const count = Math.max(1, Math.floor(Number(input.pallet_count || 1)));
  const [locations, detail] = await Promise.all([
    listLocations(),
    input.po_id ? getPurchaseOrderDetail(input.po_id) : Promise.resolve(null)
  ]);
  const line = detail?.lines?.find((item) => String(item.po_line_id) === String(input.po_line_id)) || null;
  const product = line?.product || null;
  const excluded = new Set((input.exclude_location_ids || []).map(String));
  const candidates = locations
    .filter((location) => isReceivable(location, product, excluded))
    .sort(compareLocations);
  const recommendations = candidates.slice(0, count).map((location, index) => ({
    pallet_number: index + 1,
    location_id: location.location_id,
    recommended_location_id: location.location_id,
    reason: recommendationReason(location, product),
    priority_rank: Number(location.priority_rank || 999999),
    location
  }));
  return { requested_count: count, recommended_count: recommendations.length, recommendations };
}

function isReceivable(location, product, excluded) {
  const id = String(location.location_id || "");
  if (!id || excluded.has(id)) return false;
  const active = location.is_active === undefined || location.is_active === true || String(location.is_active).toUpperCase() === "TRUE";
  if (!active) return false;
  if (location.is_receivable !== undefined && !(location.is_receivable === true || String(location.is_receivable).toUpperCase() === "TRUE")) return false;
  const type = String(location.location_type || "").toUpperCase();
  if (type && type !== "PALLET_RACK") return false;
  const status = String(location.current_status || "AVAILABLE").toUpperCase();
  if (["BLOCKED", "UNAVAILABLE", "OCCUPIED", "FULL", "MAINTENANCE", "INACTIVE"].includes(status)) return false;
  const allowed = String(location.allowed_categories || "").trim().toUpperCase();
  const category = String(product?.product_category || "").trim().toUpperCase();
  if (allowed && allowed !== "GENERAL" && category) {
    const tokens = allowed.split(/[,|;/]+/).map((value) => value.trim()).filter(Boolean);
    if (!tokens.includes(category) && !tokens.includes("ALL")) return false;
  }
  return true;
}

function compareLocations(a, b) {
  const priority = Number(a.priority_rank || 999999) - Number(b.priority_rank || 999999);
  if (priority) return priority;
  const rank = (value) => ({ F: 0, M: 1, B: 2 }[String(value || "").toUpperCase()] ?? 3);
  const bin = rank(a.bin) - rank(b.bin);
  if (bin) return bin;
  const level = Number(a.level || 99) - Number(b.level || 99);
  if (level) return level;
  return String(a.location_id || "").localeCompare(String(b.location_id || ""));
}

function recommendationReason(location, product) {
  const parts = [];
  if (product?.storage_zone_preference) parts.push(`${product.storage_zone_preference} preference`);
  if (location.bin) parts.push(`${location.bin} position`);
  if (location.priority_rank !== "" && location.priority_rank !== undefined) parts.push(`priority ${location.priority_rank}`);
  return parts.join(", ") || "Best available pallet location";
}
