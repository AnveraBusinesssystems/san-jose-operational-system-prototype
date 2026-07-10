export const ROLES = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  OPERATOR: "OPERATOR"
};

const adminPermissions = [
  "dashboard:view",
  "products:view", "products:create", "products:edit",
  "suppliers:view", "suppliers:create", "suppliers:edit",
  "orders:view",
  "purchaseOrders:view", "purchaseOrders:create", "purchaseOrders:actions",
  "salesOrders:view", "salesOrders:create", "salesOrders:actions",
  "sendProduct:view