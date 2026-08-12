/** Secondary audit trail. Inventory's primary audit remains INVENTORY_MOVEMENTS. */

function sjAudit_(actor, action, tableName, recordId, oldValue, newValue, notes) {
  try {
    var table = sjTable_('AUDIT_LOG');
    var record = {
      audit_id: sjNextId_(table, 'AUD'),
      occurred_at: sjNow_(),
      user_id: actor && actor.user_id ? actor.user_id : 'SYSTEM',
      action_type: sjUpper_(action),
      table_name: sjUpper_(tableName),
      record_id: sjString_(recordId),
      old_value: sjJson_(oldValue),
      new_value: sjJson_(newValue),
      notes: sjString_(notes)
    };
    sjAppend_(table, record);
    return record;
  } catch (error) {
    console.error('AUDIT_LOG write failed: ' + sjErrorMessage_(error));
    return null;
  }
}
