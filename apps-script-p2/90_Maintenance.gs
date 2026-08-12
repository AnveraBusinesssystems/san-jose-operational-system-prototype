/** Manual setup and diagnostics. These functions are not web API actions. */

function setupOperationalBackend() {
  var properties = sjScriptProperties_();
  if (!properties.getProperty(SJ_SCRIPT_PROPERTIES.SESSION_SECRET)) sjSessionSecret_();
  if (!properties.getProperty(SJ_SCRIPT_PROPERTIES.WRITES_ENABLED)) properties.setProperty(SJ_SCRIPT_PROPERTIES.WRITES_ENABLED, 'FALSE');
  return {ok: true, writes_enabled: sjWritesEnabled_(), schema: sjSchemaHealth_(), inventory: sjInventoryHealth()};
}

function validateOperationalBackend() {
  return {api: sjApiInfo(), schema: sjSchemaHealth_(), inventory: sjInventoryHealth(), demand_sample: sjGetDemandMetrics({limit: 5})};
}

function enableOperationalWrites() {
  sjScriptProperties_().setProperty(SJ_SCRIPT_PROPERTIES.WRITES_ENABLED, 'TRUE');
  return {writes_enabled: true};
}

function disableOperationalWrites() {
  sjScriptProperties_().setProperty(SJ_SCRIPT_PROPERTIES.WRITES_ENABLED, 'FALSE');
  return {writes_enabled: false};
}
