/**
 * San Jose Operations Apps Script Patch
 * Branch target: codex/professional-ui-refresh
 *
 * Purpose:
 * This review file contains the exact Apps Script backend section that should be
 * merged into apps-script/Code.gs so Send Product / outbound inventory can free
 * the warehouse location when a full lot or pallet is removed.
 *
 * Important:
 * Do not deploy this file beside Code.gs without removing or replacing the old
 * recordInventoryMovement function. Apps Script projects can share global scope,
 * so this file is intended as a safe review/copy source, not a second live backend.
 */

function refreshLocationAvailabilityAfterMovement_(movement) {
  const locationId = text_(movement.from_location_id || movement.to_location_id || "");
  if (!locationId) return;

  const hasStock = readTable_("LOTS").some(lot =>
    String(lot.current_location_id || "") === locationId
    && n_(lot.current_qty_script, lot.original_qty) > 0.0001
    && upper_(lot.status || "ACTIVE") !== "EMPTY"
  );

  updateRecord_("LOCATIONS", "location_id", locationId, {
    current_status: hasStock ? "UNAVAILABLE" : "AVAILABLE",
    updated_at: now_(),
    notes: hasStock
      ? "Inventory still occupies this location."
      : "Auto-released after full pallet/lot removal."
  });
}

/**
 * Replacement for the existing recordInventoryMovement(payload) function in Code.gs.
 * Change from the current branch version:
 *   - after appending INVENTORY_MOVEMENTS, it calls
 *     refreshLocationAvailabilityAfterMovement_(movement)
 *   - this checks LOTS at the movement source location and marks LOCATIONS as
 *     AVAILABLE only when no active lot with positive quantity remains there.
 */
function recordInventoryMovement(payload) {
  const user = (payload || {}).user || {};
  const input = (payload || {}).input || payload || {};
  require_(user, "inventory:adjust");

  const lot = findLotByScan_(input.internal_lot_id || input.lot_id || input.scan_code);
  const type = upper_(input.movement_type || "ADJUSTMENT");
  const qtyChange = movementQtyChange_(Object.assign({}, input, { movement_type: type }));

  const productId = input.product_id || (lot && lot.product_id) || "";
  const internalLotId = input.internal_lot_id || (lot && lot.internal_lot_id) || "";
  if (!productId || !internalLotId || qtyChange === 0) throw new Error("Product, lot, and quantity change are required.");

  if (lot) {
    applyLotQuantityChange_(lot, qtyChange, type);
  }

  const canonicalLot = lot || {
    internal_lot_id: internalLotId,
    product_id: productId,
    unit_type: input.unit_type || "LB",
    current_location_id: input.from_location_id || input.location_id || ""
  };

  const movement = {
    movement_id: nextId_("INVENTORY_MOVEMENTS", "movement_id", "MOV"),
    movement_type: type,
    timestamp: now_(),
    user_id: user.user_id || user.role || "",
    product_id: productId,
    internal_lot_id: canonicalLot.internal_lot_id,
    package_id: input.package_id || "",
    qty_change: qtyChange,
    unit_type: input.unit_type || canonicalLot.unit_type || "LB",
    from_location_id: input.from_location_id || (qtyChange < 0 ? canonicalLot.current_location_id || "" : ""),
    to_location_id: input.to_location_id || (qtyChange > 0 ? canonicalLot.current_location_id || "" : "OUTBOUND"),
    related_po_id: input.related_po_id || "",
    related_receiving_id: input.related_receiving_id || "",
    related_sales_order_id: input.related_sales_order_id || "",
    related_pick_task_id: input.related_pick_task_id || "",
    related_amazon_order_id: input.related_amazon_order_id || "",
    scan_code: input.scan_code || canonicalLot.qr_value || canonicalLot.internal_lot_id,
    device_id: input.device_id || "WEB_APP",
    approval_status: input.approval_status || "APPROVED",
    notes: input.notes || ""
  };

  appendRecord_("INVENTORY_MOVEMENTS", movement);
  refreshLocationAvailabilityAfterMovement_(movement);
  updateSalesProgressFromMovement_(movement, Math.abs(qtyChange));
  return movement;
}
