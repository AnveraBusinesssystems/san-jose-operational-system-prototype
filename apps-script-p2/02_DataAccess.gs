/** Header-driven access to the live Google Sheets tables. */

function sjBook_() {
  return SpreadsheetApp.openById(SJ_CONFIG.SPREADSHEET_ID);
}

function sjSheet_(name) {
  var sheet = sjBook_().getSheetByName(name);
  if (!sheet) throw new Error('Missing required sheet: ' + name + '.');
  return sheet;
}

function sjTable_(name) {
  var definition = SJ_SHEETS[name];
  if (!definition) throw new Error('Unknown table: ' + name + '.');
  var sheet = sjSheet_(name);
  var lastRow = Math.max(sheet.getLastRow(), 1);
  var lastColumn = Math.max(sheet.getLastColumn(), definition.headers.length);
  var values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  var headerIndex = -1;
  var headerMap = {};

  for (var rowIndex = 0; rowIndex < Math.min(values.length, 10); rowIndex++) {
    var candidate = values[rowIndex].map(sjString_);
    if (candidate.indexOf(definition.id) >= 0) {
      headerIndex = rowIndex;
      candidate.forEach(function (header, columnIndex) {
        if (header) headerMap[header] = columnIndex;
      });
      break;
    }
  }
  if (headerIndex < 0) throw new Error('Header ' + definition.id + ' was not found in ' + name + '.');

  var missing = definition.headers.filter(function (header) {
    return headerMap[header] === undefined;
  });
  if (missing.length) throw new Error(name + ' is missing columns: ' + missing.join(', ') + '.');

  var records = [];
  for (var dataIndex = headerIndex + 1; dataIndex < values.length; dataIndex++) {
    var source = values[dataIndex];
    var hasData = definition.headers.some(function (header) {
      var value = source[headerMap[header]];
      return value !== '' && value !== null;
    });
    if (!hasData) continue;
    var record = {_sheet_row: dataIndex + 1};
    definition.headers.forEach(function (header) {
      record[header] = source[headerMap[header]];
    });
    records.push(record);
  }

  return {
    name: name,
    definition: definition,
    sheet: sheet,
    headerRow: headerIndex + 1,
    headerMap: headerMap,
    records: records
  };
}

function sjFind_(table, idValue, idColumn) {
  var column = idColumn || table.definition.id;
  var wanted = sjString_(idValue);
  return table.records.find(function (record) {
    return sjString_(record[column]) === wanted;
  }) || null;
}

function sjRecordValues_(table, record) {
  var width = table.sheet.getLastColumn();
  var values = new Array(width).fill('');
  Object.keys(table.headerMap).forEach(function (header) {
    if (record[header] !== undefined) values[table.headerMap[header]] = record[header];
  });
  return values;
}

function sjAppend_(table, record) {
  var row = Math.max(table.sheet.getLastRow() + 1, table.headerRow + 1);
  var values = sjRecordValues_(table, record);
  table.sheet.getRange(row, 1, 1, values.length).setValues([values]);
  return row;
}

function sjAppendMany_(table, records) {
  if (!records.length) return [];
  if (records.length > SJ_CONFIG.MAX_BATCH_ROWS) throw new Error('Too many rows in one write.');
  var startRow = Math.max(table.sheet.getLastRow() + 1, table.headerRow + 1);
  var values = records.map(function (record) { return sjRecordValues_(table, record); });
  table.sheet.getRange(startRow, 1, values.length, values[0].length).setValues(values);
  return records.map(function (_record, index) { return startRow + index; });
}

function sjUpdate_(table, rowNumber, fields) {
  var record = table.records.find(function (item) { return item._sheet_row === rowNumber; });
  if (!record) throw new Error('Row ' + rowNumber + ' was not found in ' + table.name + '.');
  var changed = Object.assign({}, record, fields);
  var values = sjRecordValues_(table, changed);
  table.sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);
  return changed;
}

function sjClear_(table, rowNumber) {
  table.sheet.getRange(rowNumber, 1, 1, table.sheet.getLastColumn()).clearContent();
}

function sjNextId_(table, prefix, column) {
  return sjNextIdFromRows_(table.records, column || table.definition.id, prefix);
}

function sjSchemaHealth_() {
  var tables = {};
  Object.keys(SJ_SHEETS).forEach(function (name) {
    try {
      var table = sjTable_(name);
      var id = table.definition.id;
      var seen = {};
      var duplicateIds = [];
      table.records.forEach(function (record) {
        var value = sjString_(record[id]);
        if (!value) return;
        if (seen[value]) duplicateIds.push(value);
        seen[value] = true;
      });
      tables[name] = {
        ok: duplicateIds.length === 0,
        records: table.records.length,
        header_row: table.headerRow,
        duplicate_ids: duplicateIds.slice(0, 25)
      };
    } catch (error) {
      tables[name] = {ok: false, error: sjErrorMessage_(error)};
    }
  });
  return {
    ok: Object.keys(tables).every(function (name) { return tables[name].ok; }),
    schema_version: SJ_CONFIG.SCHEMA_VERSION,
    tables: tables
  };
}

function sjSchemaHealth() {
  return sjSchemaHealth_();
}
