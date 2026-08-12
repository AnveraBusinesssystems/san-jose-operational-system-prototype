/** Authentication, signed sessions, roles, and permissions. */

function sjScriptProperties_() {
  return PropertiesService.getScriptProperties();
}

function sjWritesEnabled_() {
  return sjUpper_(sjScriptProperties_().getProperty(SJ_SCRIPT_PROPERTIES.WRITES_ENABLED)) === 'TRUE';
}

function sjRequireWritesEnabled_() {
  if (!sjWritesEnabled_()) {
    throw new Error('Operational writes are disabled. Set OPERATIONS_WRITES_ENABLED=TRUE after read-only validation.');
  }
}

function sjRole_(value) {
  var role = sjUpper_(value);
  if (role === 'MANAGER' || role === 'OPERATOR') role = 'WAREHOUSE';
  if (SJ_CONFIG.ROLES.indexOf(role) < 0) throw new Error('Unsupported role: ' + role + '.');
  return role;
}

function sjActiveUser_(userId) {
  var id = sjRequired_(userId, 'user_id');
  var user = sjFind_(sjTable_('USERS'), id);
  if (!user || !sjBoolean_(user.is_active)) throw new Error('Active user not found: ' + id + '.');
  return user;
}

function sjSessionSecret_() {
  var properties = sjScriptProperties_();
  var secret = sjString_(properties.getProperty(SJ_SCRIPT_PROPERTIES.SESSION_SECRET));
  if (secret) return secret;
  secret = sjHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid()));
  properties.setProperty(SJ_SCRIPT_PROPERTIES.SESSION_SECRET, secret);
  return secret;
}

function sjSign_(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(text), sjSessionSecret_())).replace(/=+$/, '');
}

function sjIssueSession_(user) {
  var now = Math.floor(Date.now() / 1000);
  var claims = {
    v: 1,
    uid: sjString_(user.user_id),
    role: sjRole_(user.role),
    iat: now,
    exp: now + SJ_CONFIG.SESSION_TTL_SECONDS,
    nonce: Utilities.getUuid()
  };
  var body = sjBase64UrlEncode_(JSON.stringify(claims));
  return body + '.' + sjSign_(body);
}

function sjVerifySession_(token) {
  var value = sjRequired_(token, 'session_token');
  var parts = value.split('.');
  if (parts.length !== 2 || !sjConstantTimeEquals_(sjSign_(parts[0]), parts[1])) {
    throw new Error('Session is invalid.');
  }
  var claims;
  try {
    claims = JSON.parse(sjBase64UrlDecode_(parts[0]));
  } catch (_error) {
    throw new Error('Session is invalid.');
  }
  if (!claims.exp || claims.exp <= Math.floor(Date.now() / 1000)) throw new Error('Session expired. Sign in again.');
  var user = sjActiveUser_(claims.uid);
  if (sjRole_(user.role) !== claims.role) throw new Error('User role changed. Sign in again.');
  return user;
}

function sjLegacyTokenUser_(payload) {
  var properties = sjScriptProperties_();
  if (sjUpper_(properties.getProperty(SJ_SCRIPT_PROPERTIES.ALLOW_LEGACY_WRITE_TOKEN)) !== 'TRUE') return null;
  var expected = sjString_(properties.getProperty(SJ_SCRIPT_PROPERTIES.LEGACY_WRITE_TOKEN));
  var supplied = sjString_(payload && payload.write_token);
  if (!expected || !supplied || !sjConstantTimeEquals_(expected, supplied)) return null;
  return sjActiveUser_(payload.user_id);
}

function sjRequestUser_(payload) {
  payload = payload || {};
  if (payload.session_token) return sjVerifySession_(payload.session_token);
  var legacy = sjLegacyTokenUser_(payload);
  if (legacy) return legacy;
  throw new Error('A valid session_token is required.');
}

function sjRequirePermission_(payload, permission) {
  sjRequireWritesEnabled_();
  var user = sjRequestUser_(payload);
  var role = sjRole_(user.role);
  if ((SJ_PERMISSIONS[role] || []).indexOf(permission) < 0) {
    throw new Error(role + ' is not allowed to perform ' + permission + '.');
  }
  return {user_id: sjString_(user.user_id), full_name: sjString_(user.full_name), role: role};
}

function sjVerifyCredential_(password, storedHash) {
  var value = sjString_(password);
  var stored = sjString_(storedHash);
  var parts = stored.split('$');
  if (!value || parts.length !== 3 || parts[0] !== 'sha256') return false;
  var actual = sjHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, parts[1] + value));
  return sjConstantTimeEquals_(actual, parts[2]);
}

function sjCreateCredentialHash_(password) {
  var value = sjRequired_(password, 'password');
  if (value.length < 8) throw new Error('Password must contain at least 8 characters.');
  var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 24);
  var digest = sjHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + value));
  return 'sha256$' + salt + '$' + digest;
}

function sjLogin(payload) {
  payload = payload || {};
  var userId = sjUpper_(payload.user_id || payload.username);
  var users = sjTable_('USERS');
  var user = users.records.find(function (record) {
    return sjUpper_(record.user_id) === userId && sjBoolean_(record.is_active);
  });
  if (!user || !sjVerifyCredential_(payload.password, user.credential_hash)) throw new Error('Invalid user or password.');
  var now = sjNow_();
  sjUpdate_(users, user._sheet_row, {last_login_at: now, updated_at: now});
  return {session_token: sjIssueSession_(user), expires_in_seconds: SJ_CONFIG.SESSION_TTL_SECONDS, user: sjPublicRecord_(user)};
}

function sjSessionInfo(payload) {
  return {user: sjPublicRecord_(sjRequestUser_(payload)), writes_enabled: sjWritesEnabled_()};
}

function sjCreateUser(payload) {
  var actor = sjRequirePermission_(payload, 'admin.users');
  var users = sjTable_('USERS');
  var userId = sjUpper_(sjRequired_(payload.user_id, 'user_id'));
  if (sjFind_(users, userId)) throw new Error('User already exists: ' + userId + '.');
  var now = sjNow_();
  var record = {
    user_id: userId,
    full_name: sjRequired_(payload.full_name, 'full_name'),
    role: sjRole_(payload.role),
    credential_hash: sjCreateCredentialHash_(payload.password),
    is_active: true,
    last_login_at: '',
    created_at: now,
    updated_at: now
  };
  sjAppend_(users, record);
  sjAudit_(actor, 'CREATE_USER', 'USERS', userId, null, sjPublicRecord_(record), 'User created.');
  return sjPublicRecord_(record);
}

function sjSetUserStatus(payload) {
  var actor = sjRequirePermission_(payload, 'admin.users');
  var users = sjTable_('USERS');
  var user = sjFind_(users, sjRequired_(payload.target_user_id, 'target_user_id'));
  if (!user) throw new Error('User was not found.');
  if (sjString_(user.user_id) === actor.user_id && !sjBoolean_(payload.is_active)) throw new Error('You cannot deactivate your own account.');
  var oldValue = sjPublicRecord_(user);
  var updated = sjUpdate_(users, user._sheet_row, {is_active: sjBoolean_(payload.is_active), updated_at: sjNow_()});
  sjAudit_(actor, 'SET_USER_STATUS', 'USERS', user.user_id, oldValue, sjPublicRecord_(updated), 'User status changed.');
  return sjPublicRecord_(updated);
}
