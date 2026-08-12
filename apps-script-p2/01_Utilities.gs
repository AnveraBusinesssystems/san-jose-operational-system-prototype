/** Shared validation, conversion, dates, IDs, and locking. */

function sjString_(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

function sjUpper_(value) {
  return sjString_(value).toUpperCase();
}

function sjLower_(value) {
  return sjString_(value).toLowerCase();
}

function sjNumber_(value, fallback) {
  if (typeof value === 'number') return isFinite(value) ? value : (fallback || 0);
  var normalized = sjString_(value).replace(/[$,%\s,]/g, '');
  var parsed = Number(normalized);
  return isFinite(parsed) ? parsed : (fallback || 0);
}

function sjBoolean_(value) {
  return value === true || sjUpper_(value) === 'TRUE' || String(value) === '1';
}

function sjNow_() {
  return new Date();
}

function sjDate_(value, required) {
  if (value === '' || value === null || value === undefined) {
    if (required) throw new Error('A date is required.');
    return '';
  }
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  var text = sjString_(value);
  var parsed = new Date(text.length <= 10 ? text + 'T12:00:00' : text);
  if (isNaN(parsed.getTime())) throw new Error('Invalid date: ' + text);
  return parsed;
}

function sjDateMs_(value) {
  if (!value) return 0;
  var parsed = value instanceof Date ? value : new Date(value);
  return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function sjRequired_(value, label) {
  var result = sjString_(value);
  if (!result) throw new Error((label || 'Value') + ' is required.');
  return result;
}

function sjOneOf_(value, allowed, label) {
  var normalized = sjUpper_(value);
  if (allowed.indexOf(normalized) < 0) {
    throw new Error((label || 'Value') + ' must be one of: ' + allowed.join(', ') + '.');
  }
  return normalized;
}

function sjPositive_(value, label, allowZero) {
  var number = Number(value);
  if (!isFinite(number) || (allowZero ? number < 0 : number <= 0)) {
    throw new Error((label || 'Quantity') + (allowZero ? ' must be zero or greater.' : ' must be greater than zero.'));
  }
  return number;
}

function sjClamp_(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sjJson_(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function sjParseJson_(value, label) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch (_error) {
    throw new Error((label || 'payload') + ' must be valid JSON.');
  }
}

function sjErrorMessage_(error) {
  return error && error.message ? String(error.message) : String(error || 'Unknown error');
}

function sjNormalizeText_(value) {
  return sjLower_(value).replace(/\s+/g, ' ');
}

function sjBalanceKey_(productId, lotId, locationId) {
  return sjString_(productId) + '|' + sjString_(lotId) + '|' + sjUpper_(locationId);
}

function sjOperationId_(payload) {
  var value = sjRequired_(payload && payload.operation_id, 'operation_id');
  if (value.length > 120) throw new Error('operation_id is too long.');
  return value;
}

function sjNextIdFromRows_(rows, column, prefix) {
  var max = 0;
  rows.forEach(function (row) {
    var match = sjString_(row[column]).match(/(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]) || 0);
  });
  return prefix + '-' + (max + 1);
}

function sjPaginate_(rows, payload) {
  payload = payload || {};
  var offset = Math.max(0, Math.floor(sjNumber_(payload.offset, 0)));
  var limit = sjClamp_(Math.floor(sjNumber_(payload.limit, 100)), 1, SJ_CONFIG.MAX_PAGE_SIZE);
  return {
    rows: rows.slice(offset, offset + limit),
    total: rows.length,
    offset: offset,
    limit: limit,
    has_more: offset + limit < rows.length
  };
}

function sjWithLock_(callback) {
  var lock = LockService.getScriptLock();
  lock.waitLock(SJ_CONFIG.LOCK_TIMEOUT_MS);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function sjHex_(bytes) {
  return bytes.map(function (byte) {
    var value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function sjBase64UrlEncode_(text) {
  return Utilities.base64EncodeWebSafe(String(text), Utilities.Charset.UTF_8).replace(/=+$/, '');
}

function sjBase64UrlDecode_(text) {
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(String(text))).getDataAsString('UTF-8');
}

function sjConstantTimeEquals_(left, right) {
  left = String(left || '');
  right = String(right || '');
  var mismatch = left.length ^ right.length;
  var length = Math.max(left.length, right.length);
  for (var index = 0; index < length; index++) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function sjPublicRecord_(record) {
  var result = {};
  Object.keys(record || {}).forEach(function (key) {
    if (key.charAt(0) === '_' || key === 'credential_hash') return;
    result[key] = record[key];
  });
  return result;
}
