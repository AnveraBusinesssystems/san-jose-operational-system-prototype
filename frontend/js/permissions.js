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
    "purchaseOrders:view", "purchaseOrders:create", "purchase