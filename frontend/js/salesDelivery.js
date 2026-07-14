import { clearApiCache, getSalesOrderDetail, inventorySnapshot } from "./api-smooth1.js?v=delivery1";
import { GOOGLE_SCRIPT_WEB_APP_URL } from "./config.js?v=opening1";
import { escapeHtml, formatQuantity, notice, status } from "./utils.js?v=filters1";

const OPEN_STATUSES = new Set(["CONFIRMED", "PARTIALLY_PICKED", "PARTIAL", "PICKED", "SHIPPED"]);

export function isDeliverableStatus(value) {
  return OPEN_STATUSES.has(String(value || "").trim().toUpperCase());
}

export function deliveryButton(orderId) {
  return `<button class="btn" type="button" data-mark-delivered="${escapeHtml(orderId)}">Mark as Delivered</button>`;
}

export function installDeliveryActions(ctx, onComplete) {
  ctx.view.querySelectorAll("[data-mark-delivered]").forEach((button) => {
    button.addEventListener("click", () => openDeliveryReview(ctx, button.dataset.markDelivered, onComplete));
  });
}

export function replaceAdminDeliveryActions(root) {
  root.querySelectorAll("tbody tr").forEach((row) => {
    const rowStatus = text(row.querySelector('[data-label="Status"]'));
    const orderId = text(row.querySelector('[data-label="SO"]')) || text(row.cells[0]);
    const actions = row.querySelector('[data-label="Actions"]') || row.cells[row.cells.length - 1];
    if (!actions || !orderId) return;
    actions.querySelectorAll('[data-sales-action="SHIPPED"], [data-sales-action="PICKED"]').forEach((button) => button.remove());
    if (isDeliverableStatus(rowStatus) && !actions.querySelector("[data-mark-delivered]")) {
      actions.insertAdjacentHTML("beforeend", deliveryButton(orderId));
    }
    if (String(rowStatus).toUpperCase() === "DELIVERED") actions.innerHTML = '<span class="status ok">Delivered ✓</span>';
  });
}

async function openDeliveryReview(ctx, salesOrderId, onComplete) {
  try {
    const [detail, inventoryRows] = await Promise.all([getSalesOrderDetail(salesOrderId), inventorySnapshot()]);
    if (!detail) throw new Error("Sales Order was not found.");
    const overlay = document.createElement("div");
    overlay.className = "delivery-review-overlay";
    overlay.innerHTML = `
      <section class="delivery-review-dialog" role="dialog" aria-modal="true" aria-labelledby="deliveryReviewTitle">
        <div class="delivery-review-head">
          <div><span class="so-eyebrow">CUSTOMER SALES ORDER</span><h2 id="deliveryReviewTitle">Mark ${escapeHtml(salesOrderId)} as Delivered</h2><p>Confirm the product, lot, and warehouse space that actually left. Edit only what changed.</p></div>
          <button class="delivery-review-close" type="button" aria-label="Close">&times;</button>
        </div>
        <form id="deliveryReviewForm">
          <div class="delivery-review-lines">${detail.lines.map((line, index) => lineReview(line, index, inventoryRows)).join("")}</div>
          <div class="field"><label>Delivery Notes</label><textarea name="delivery_notes" placeholder="Optional delivery note"></textarea></div>
          <div class="delivery-review-actions"><button class="btn secondary" data-close-delivery type="button">Cancel</button><button class="btn" type="submit">Confirm Delivered & Deduct Inventory</button></div>
        </form>
      </section>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector(".delivery-review-close").addEventListener("click", close);
    overlay.querySelector("[data-close-delivery]").addEventListener("click", close);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    overlay.querySelector("#deliveryReviewForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = event.submitter;
      submit.disabled = true;
      submit.textContent = "Confirming...";
      try {
        const lines = [...overlay.querySelectorAll("[data-delivery-line]")].map((row) => {
          const select = row.querySelector("select");
          if (!select) return null;
          const option = select.selectedOptions[0];
          return { sales_order_line_id: row.dataset.deliveryLine, internal_lot_id: option.dataset.lotId, location_id: option.dataset.locationId };
        }).filter(Boolean);
        const delivered = await callDelivery(ctx.user, {
          sales_order_id: salesOrderId,
          delivery_notes: event.currentTarget.elements.delivery_notes.value.trim(),
          lines
        });
        const deliveredStatus = String(delivered?.order?.status || delivered?.status || "").trim().toUpperCase();
        if (deliveredStatus !== "DELIVERED") {
          throw new Error("The inventory was processed, but the Sales Order was not returned as DELIVERED. Refresh and review the order.");
        }

        clearApiCache();
        close();
        await onComplete?.();
        markOrderDeliveredInView(ctx.view, salesOrderId);
        notice(`${salesOrderId} is now DELIVERED. Remaining customer-order inventory was deducted.`);
      } catch (error) {
        notice(error.message);
        submit.disabled = false;
        submit.textContent = "Confirm Delivered & Deduct Inventory";
      }
    });
  } catch (error) {
    notice(error.message);
  }
}

function markOrderDeliveredInView(root, salesOrderId) {
  root.querySelectorAll("tbody tr").forEach((row) => {
    const orderId = text(row.querySelector('[data-label="SO"]')) || text(row.cells[0]);
    if (String(orderId) !== String(salesOrderId)) return;

    const statusCell = row.querySelector('[data-label="Status"]');
    const actionsCell = row.querySelector('[data-label="Actions"]') || row.cells[row.cells.length - 1];

    if (statusCell) {
      statusCell.innerHTML = status("DELIVERED");
      statusCell.dataset.sortValue = "DELIVERED";
    }
    if (actionsCell) actionsCell.innerHTML = '<span class="status ok">Delivered ✓</span>';
  });
}

function lineReview(line, index, inventoryRows) {
  const remainingSales = Number(line.qty_remaining ?? line.qty_ordered ?? 0);
  const orderedSales = Number(line.qty_ordered || 0);
  const requiredBase = Number(line.inventory_qty_required || orderedSales);
  const remainingBase = orderedSales > 0 ? requiredBase * remainingSales / orderedSales : requiredBase;
  const picked = remainingBase <= 0.0001;
  const candidates = inventoryRows.filter((row) => String(row.product_id) === String(line.product_id) && Number(row.current_qty ?? row.qty ?? 0) > 0);
  const options = candidates.map((row) => {
    const lotId = String(row.internal_lot_id || row.lot?.internal_lot_id || "");
    const locationId = String(row.location_id || row.lot?.current_location_id || "");
    const selected = lotId === String(line.preferred_internal_lot_id || "") && locationId === String(line.preferred_location_id || "");
    const available = Number(row.current_qty ?? row.qty ?? 0);
    return `<option data-lot-id="${escapeHtml(lotId)}" data-location-id="${escapeHtml(locationId)}" ${selected ? "selected" : ""}>${escapeHtml(lotId)} · ${escapeHtml(locationId)} · ${formatQuantity(available)} ${escapeHtml(row.unit_type || "LB")} available</option>`;
  }).join("");
  return `<article class="delivery-review-line" ${picked ? "" : `data-delivery-line="${escapeHtml(line.sales_order_line_id)}"`}>
    <div class="delivery-review-product"><span>${index + 1}</span><div><strong>${escapeHtml(line.product?.product_name || line.product_id)}</strong><small>${formatQuantity(line.qty_ordered)} ${escapeHtml(line.unit_type || "")} · ${formatQuantity(requiredBase)} ${escapeHtml(line.inventory_unit_type || "LB")}</small></div></div>
    ${picked ? `<div class="delivery-review-picked"><strong>Already deducted</strong><span>${escapeHtml(line.preferred_internal_lot_id || "")} · ${escapeHtml(line.preferred_location_id || "")}</span></div>` : `<div class="field"><label>Lot / Warehouse Space</label><select required>${options || '<option value="">No physical inventory available</option>'}</select><small>${formatQuantity(remainingBase)} ${escapeHtml(line.inventory_unit_type || "LB")} will be deducted.</small></div>`}
  </article>`;
}

function callDelivery(user, input) {
  if (!GOOGLE_SCRIPT_WEB_APP_URL?.includes("/exec")) throw new Error("The Google Apps Script deployment is not configured.");
  return new Promise((resolve, reject) => {
    const callback = `sjopsDelivery_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timer = window.setTimeout(() => { cleanup(); reject(new Error("Delivery confirmation timed out. Check the Apps Script deployment.")); }, 15000);
    const cleanup = () => { window.clearTimeout(timer); delete window[callback]; script.remove(); };
    window[callback] = (data) => { cleanup(); data?.ok ? resolve(data.result) : reject(new Error(data?.error || "Delivery confirmation failed.")); };
    script.onerror = () => { cleanup(); reject(new Error("Could not reach Apps Script.")); };
    const url = new URL(GOOGLE_SCRIPT_WEB_APP_URL);
    url.searchParams.set("action", "deliverSalesOrder");
    url.searchParams.set("payload", JSON.stringify({ user, input }));
    url.searchParams.set("callback", callback);
    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function text(element) { return String(element?.textContent || "").trim(); }
