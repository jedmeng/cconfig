import { createRouter, createWebHashHistory } from "vue-router";

const RouteStateView = { template: "<div />" };

const routes = [
  { path: "/login", name: "login", component: RouteStateView },
  { path: "/", redirect: "/sources" },
  { path: "/sources", name: "sources-list", component: RouteStateView },
  { path: "/sources/new", name: "sources-create", component: RouteStateView },
  { path: "/sources/:sourceId", name: "sources-edit", component: RouteStateView },
  { path: "/modifiers", name: "modifiers-list", component: RouteStateView },
  { path: "/modifiers/:modifierId", name: "modifiers-edit", component: RouteStateView },
  { path: "/schemes", name: "schemes-list", component: RouteStateView },
  { path: "/schemes/new", name: "schemes-create", component: RouteStateView },
  { path: "/schemes/:schemeId", name: "schemes-edit", component: RouteStateView },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});
