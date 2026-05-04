import {
  createRouter,
  createRoute,
  createRootRoute,
} from "@tanstack/react-router";
import { HomePage } from "./pages/HomePage.jsx";
import { MatchPage } from "./pages/MatchPage.jsx";

const rootRoute = createRootRoute();

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

export const matchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/match/$id",
  component: MatchPage,
  validateSearch: (search) => ({
    market: typeof search.market === "string" ? search.market : "",
    outcome: typeof search.outcome === "string" ? search.outcome : "",
  }),
});

const routeTree = rootRoute.addChildren([indexRoute, matchRoute]);

export const router = createRouter({ routeTree });
