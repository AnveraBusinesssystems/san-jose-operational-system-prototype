export const ROLES = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  OPERATOR: "OPERATOR"
};

const permissions = {
  ADMIN: [
    "mobileHome:view",
    "dashboard:view",
    "products:view", "products:create", "products:edit",
    "suppliers:view", "suppliers:create", "suppliers:edit",
    "orders:view",
    "purchaseOrders:view", "purchaseOrders:create", "purchaseOrders:actions",
    "salesOrders:view", "salesOrders:create", "salesOrders:actions",
    "sendProduct:view",
    "receiving:view", "receiving:create",
    "openingInventory:view",
    "inventory:view", "inventory:adjust",
    "scanner:test",
    "amazon:view",
    "reports:view",
    "admin:view"
  ],
  MANAGER: [
    "mobileHome:view",
    "salesOrders:view",
    "sendProduct:view",
    "receiving:view", "receiving:create",
    "inventory:view",
    "scanner:test"
  ],
  OPERATOR: [
    "mobileHome:view",
    "salesOrders:view",
    "sendProduct:view",
    "receiving:view", "receiving:create",
    "inventory:view",
    "scanner:test"
  ]
};

export function normalizeRole(role) {
  const normalized = String(role || ROLES.OPERATOR).trim().toUpperCase();
  if (normalized === "OWNER") return ROLES.ADMIN;
  if (["WAREHOUSE", "WORKER", "WAREHOUSE WORKER", "STAFF"].includes(normalized)) {
    return ROLES.OPERATOR;
  }
  return Object.values(ROLES).includes(normalized) ? normalized : ROLES.OPERATOR;
}

export function can(user, permission) {
  if (!user) return false;
  const role = normalizeRole(user.role);
  return permissions[role]?.includes(permission) || false;
}

export function requirePermission(user, permission) {
  if (!can(user, permission)) {
    throw new Error(`Permission denied: ${permission}`);
  }
}

export function allowedPages(user) {
  const pages = [
    { id: "mobileHome", label: "Warehouse Home", permission: "mobileHome:view", hidden: true },
    { id: "dashboard", label: "Dashboard", permission: "dashboard:view" },
    { id: "products", label: "Products", permission: "products:view" },
    { id: "suppliers", label: "Customers & Vendors", permission: "suppliers:view" },
    { id: "orders", label: "Orders", permission: "orders:view" },
    { id: "purchaseOrders", label: "Purchase Orders", permission: "purchaseOrders:view", hidden: true },
    { id: "salesOrders", label: "Sales Orders", permission: "salesOrders:view", hidden: true },
    { id: "sendProduct", label: "Send Product", permission: "sendProduct:view" },
    { id: "receiving", label: "Receive Product", permission: "receiving:view" },
    { id: "openingInventory", label: "Opening Inventory", permission: "openingInventory:view" },
    { id: "inventory", label: "Inventory Lookup", permission: "inventory:view" },
    { id: "scanner", label: "Scanner Test", permission: "scanner:test" },
    { id: "amazon", label: "Amazon Outbound", permission: "amazon:view" },
    { id: "reports", label: "Reports", permission: "reports:view" },
    { id: "admin", label: "Admin", permission: "admin:view" }
  ];

  return pages.filter((page) => can(user, page.permission));
}
