import { warmOperationalCache } from "./api-smooth1.js?v=pin1";
import { getSession, signIn, signOut } from "./auth.js?v=pin1";
import { renderNavigation, renderRoute, configureRouter, navigate } from "./router.js?v=send2";
import { allowedPages } from "./permissions.js?v=send-ui1";
import { enableTableFilters } from "./utils.js?v=qa1";
import * as dashboard from "../pages/dashboard.js?v=refine1";
import * as products from "../pages/products.js?v=qa1";
import * as suppliers from "../pages/suppliers.js?v=parties1";
import * as orders from "../pages/orders.js?v=orders1";
import * as purchaseOrders from "../pages/purchaseOrders.js?v=qa1";
import * as salesOrders from "../pages/salesOrders.js?v=lotspace1";
import * as sendProduct from "../pages/sendProduct.js?v=send-ui1";
import * as receiving from "../pages/receiving.js?v=refine1";
import * as openingInventory from "../pages/openingInventory.js?v=qa1";
import * as inventory from "../pages/inventory.js?v=qa1";
import * as scanner from "../pages/scannerTest.js?v=parties1";
import * as reports from "../pages/reports.js?v=reports-ui7";
import * as admin from "../pages/admin.js?v=pin1";
import * as mobileHome from "../pages/mobileHome.js?v=send-ui1";

const routes = {
  dashboard,
  products,
  suppliers,
  orders,
  purchaseOrders,
  salesOrders,
  sendProduct,
  receiving,
  openingInventory,
  inventory,
  scanner,
  reports,
  admin,
  mobileHome
};

async function boot() {
  const session = getSession();
  await renderNavigation(session.user, allowedPages(session.user), navigate);
  configureRouter(routes, session.user);
  signIn(session.user);
  document.getElementById("signOut")?.addEventListener("click", signOut);
  renderRoute();
  warmOperationalCache();
}

boot();
