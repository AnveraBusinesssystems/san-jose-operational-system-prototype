/** Warehouse work queue. Tasks coordinate work; movements remain inventory truth. */

function sjListWarehouseTasks(payload) {
  payload = payload || {};
  var status = sjUpper_(payload.status);
  var assignee = sjString_(payload.assigned_user_id);
  var type = sjUpper_(payload.task_type);
  var rows = sjTable_('WAREHOUSE_TASKS').records.filter(function (task) {
    if (status && sjUpper_(task.status) !== status) return false;
    if (assignee && sjString_(task.assigned_user_id) !== assignee) return false;
    if (type && sjUpper_(task.task_type) !== type) return false;
    return true;
  });
  rows.sort(function (left, right) {
    return sjNumber_(right.priority) - sjNumber_(left.priority) || sjDateMs_(left.created_at) - sjDateMs_(right.created_at);
  });
  return sjPaginate_(rows.map(sjPublicRecord_), payload);
}

function sjCreateWarehouseTask(payload) {
  var actor = sjRequirePermission_(payload, 'tasks.write');
  return sjWithLock_(function () {
    var tasks = sjTable_('WAREHOUSE_TASKS');
    var productId = sjRequired_(payload.product_id, 'product_id');
    var products = sjTable_('PRODUCTS');
    if (!sjFind_(products, productId)) throw new Error('Product was not found.');
    if (payload.assigned_user_id) sjActiveUser_(payload.assigned_user_id);
    var record = {
      task_id: sjNextId_(tasks, 'TASK'), task_type: sjOneOf_(payload.task_type, ['RECEIVE', 'PUTAWAY', 'PICK', 'PACK', 'COUNT', 'MOVE'], 'task_type'),
      source_order_id: sjString_(payload.source_order_id), source_order_line_id: sjString_(payload.source_order_line_id),
      product_id: productId, requested_base_qty: sjPositive_(payload.requested_base_qty, 'requested_base_qty'),
      from_location_id: sjUpper_(payload.from_location_id), to_location_id: sjUpper_(payload.to_location_id),
      assigned_user_id: sjString_(payload.assigned_user_id), status: 'OPEN', priority: sjClamp_(Math.floor(sjNumber_(payload.priority, 3)), 1, 5),
      created_at: sjNow_(), started_at: '', completed_at: '', notes: sjString_(payload.notes)
    };
    sjAppend_(tasks, record);
    sjAudit_(actor, 'CREATE_TASK', 'WAREHOUSE_TASKS', record.task_id, null, record, 'Warehouse task created.');
    return sjPublicRecord_(record);
  });
}

function sjUpdateWarehouseTask(payload) {
  var actor = sjRequirePermission_(payload, 'tasks.write');
  return sjWithLock_(function () {
    var tasks = sjTable_('WAREHOUSE_TASKS');
    var task = sjFind_(tasks, sjRequired_(payload.task_id, 'task_id'));
    if (!task) throw new Error('Warehouse task was not found.');
    var status = sjOneOf_(payload.status, ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETE', 'CANCELLED'], 'status');
    var fields = {status: status};
    if (payload.assigned_user_id !== undefined) {
      if (payload.assigned_user_id) sjActiveUser_(payload.assigned_user_id);
      fields.assigned_user_id = sjString_(payload.assigned_user_id);
    }
    if (payload.notes !== undefined) fields.notes = sjString_(payload.notes);
    if (status === 'IN_PROGRESS' && !task.started_at) fields.started_at = sjNow_();
    if (status === 'COMPLETE' || status === 'CANCELLED') fields.completed_at = sjNow_();
    var updated = sjUpdate_(tasks, task._sheet_row, fields);
    sjAudit_(actor, 'UPDATE_TASK', 'WAREHOUSE_TASKS', task.task_id, sjPublicRecord_(task), sjPublicRecord_(updated), sjString_(payload.reason));
    return sjPublicRecord_(updated);
  });
}
