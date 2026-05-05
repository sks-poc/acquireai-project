import {
  createRouter,
  createRoute,
  createRootRoute,
} from "@tanstack/react-router";
import { LandingPage } from "./pages/LandingPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { MatchPage } from "./pages/MatchPage.jsx";

const rootRoute = createRootRoute();

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingPage,
});

export const assistantRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/assistant",
  component: HomePage,
});

export const matchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/match/$id",
  component: MatchPage,
  validateSearch: (search) => ({
    market: typeof search.market === "string" ? search.market : "",
    outcome: typeof search.outcome === "string" ? search.outcome : "",
    recs: typeof search.recs === "string" ? search.recs : "",
  }),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  assistantRoute,
  matchRoute,
]);

export const router = createRouter({ routeTree });
