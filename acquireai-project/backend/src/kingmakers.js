const DEFAULT_BASE_URL = "https://bff-gateway-int.kingmakers-account.workers.dev/api/sportsbook";

const snapshotCache = new Map();

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function toBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function impliedProbability(decimalOdds) {
  if (!decimalOdds || Number(decimalOdds) <= 0) return null;
  return Number(((1 / Number(decimalOdds)) * 100).toFixed(2));
}

function resolveConfig(options = {}) {
  const normalizedSportIds = Array.isArray(options.sportIds)
    ? options.sportIds
        .map((id) => Number.parseInt(String(id), 10))
        .filter((id) => Number.isFinite(id) && id > 0)
    : [];

  return {
    baseUrl: String(options.baseUrl || process.env.KINGMAKERS_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
    locale: options.locale || process.env.KINGMAKERS_LOCALE || "en",
    contentLanguage: options.contentLanguage || process.env.KINGMAKERS_CONTENT_LANGUAGE || "en",
    discriminationId: options.discriminationId || process.env.KINGMAKERS_DISCRIMINATION_ID || "19010101",
    scheduleTimeFrame: toPositiveInt(
      options.scheduleTimeFrame ?? process.env.KINGMAKERS_SCHEDULE_TIME_FRAME,
      4
    ),
    areaId: toPositiveInt(options.areaId ?? process.env.KINGMAKERS_AREA_ID, 1572),
    dateFilterType: toPositiveInt(
      options.dateFilterType ?? process.env.KINGMAKERS_DATE_FILTER_TYPE,
      1
    ),
    dateFilterRange: toPositiveInt(
      options.dateFilterRange ?? process.env.KINGMAKERS_DATE_FILTER_RANGE,
      24
    ),
    pageSize: toPositiveInt(options.pageSize ?? process.env.KINGMAKERS_PAGE_SIZE, 50),
    maxPagesPerMarketType: toPositiveInt(
      options.maxPagesPerMarketType ?? process.env.KINGMAKERS_MAX_PAGES_PER_MARKET_TYPE,
      20
    ),
    includeOdds: toBoolean(options.includeOdds ?? process.env.KINGMAKERS_INCLUDE_ODDS, true),
    sportsConcurrency: toPositiveInt(
      options.sportsConcurrency ?? process.env.KINGMAKERS_SPORTS_CONCURRENCY,
      4
    ),
    marketTypesConcurrency: toPositiveInt(
      options.marketTypesConcurrency ?? process.env.KINGMAKERS_MARKET_TYPES_CONCURRENCY,
      4
    ),
    cacheTtlMs: toPositiveInt(options.cacheTtlMs ?? process.env.KINGMAKERS_CACHE_TTL_MS, 60000),
    maxSports: toPositiveInt(options.maxSports ?? process.env.KINGMAKERS_MAX_SPORTS, 0),
    sportIds: normalizedSportIds
  };
}

function buildHeaders(config) {
  return {
    "Discrimination-Id": config.discriminationId,
    "content-language": config.contentLanguage,
    Accept: "application/json"
  };
}

async function fetchJson(url, headers) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Kingmakers request failed (${response.status}) at ${url}: ${body}`);
  }
  return response.json();
}

async function mapWithConcurrency(items, concurrency, mapper) {
  if (!items.length) return [];

  const result = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      result[current] = await mapper(items[current], current);
    }
  });

  await Promise.all(workers);
  return result;
}

export async function fetchPrematchNavigationRaw(options = {}) {
  const config = resolveConfig(options);
  const headers = buildHeaders(config);
  const url = new URL(`${config.baseUrl}/v1/prematch/navigation`);
  url.searchParams.set("locale", config.locale);
  url.searchParams.set("scheduleTimeFrame", String(config.scheduleTimeFrame));

  const payload = await fetchJson(url.toString(), headers);
  return {
    config,
    payload,
    sports: payload?.data?.sports || []
  };
}

async function fetchMarketTypesForSport(sportId, config, headers) {
  const url = new URL(`${config.baseUrl}/v2/prematch/market-types`);
  url.searchParams.set("sportId", String(sportId));
  url.searchParams.set("dateFilterType", String(config.dateFilterType));
  url.searchParams.set("dateFilterRange", String(config.dateFilterRange));
  url.searchParams.set("areaId", String(config.areaId));

  const payload = await fetchJson(url.toString(), headers);
  return payload?.data?.marketTypes || [];
}

function collectEventsFromAreaMatches(areaMatches) {
  const events = [];
  for (const areaMatch of areaMatches || []) {
    for (const event of areaMatch?.events || []) {
      events.push(event);
    }
  }
  return events;
}

function extractOddsFromEvents(events, marketTypeId) {
  const odds = [];

  for (const event of events || []) {
    for (const eventMarket of event?.markets || []) {
      if (eventMarket?.typeId !== marketTypeId) continue;

      for (const selection of eventMarket?.selections || []) {
        if (!selection?.odd || selection.odd.value === null || selection.odd.value === undefined) {
          continue;
        }

        odds.push({
          eventId: event.id,
          eventName: event.name,
          eventDate: event.date,
          tournamentId: event.tournamentId,
          tournamentName: event.tournamentName,
          categoryId: event.categoryId,
          categoryName: event.categoryName,
          marketId: eventMarket.id,
          marketTypeId: eventMarket.typeId,
          marketName: eventMarket.name,
          marketTranslationKey: eventMarket.translationKey,
          line: eventMarket.specialValue,
          selectionId: selection.id,
          selectionTypeId: selection.typeId,
          selectionName: selection.name,
          selectionTranslationKey: selection.translationKey,
          odd: selection.odd.value,
          oddChannelId: selection.odd.channelId,
          selectionStatus: selection.status
        });
      }
    }
  }

  return odds;
}

async function fetchOddsForMarketType({ sportId, marketType, config, headers }) {
  const marketTypeId = marketType.typeId;
  const allOdds = [];

  for (let pageNumber = 1; pageNumber <= config.maxPagesPerMarketType; pageNumber += 1) {
    const url = new URL(`${config.baseUrl}/v2/prematch/events`);
    url.searchParams.set("sportId", String(sportId));
    url.searchParams.set("dateFilterType", String(config.dateFilterType));
    url.searchParams.set("dateFilterRange", String(config.dateFilterRange));
    url.searchParams.set("areaId", String(config.areaId));
    url.searchParams.set("pageSize", String(config.pageSize));
    url.searchParams.set("pageNumber", String(pageNumber));
    url.searchParams.set("marketTypeId", String(marketTypeId));

    const payload = await fetchJson(url.toString(), headers);
    const areaMatches = payload?.data?.areaMatches || [];

    if (!areaMatches.length) break;

    const eventsOnPage = collectEventsFromAreaMatches(areaMatches);
    if (!eventsOnPage.length) break;

    allOdds.push(...extractOddsFromEvents(eventsOnPage, marketTypeId));

    if (eventsOnPage.length < config.pageSize) break;
  }

  return {
    typeId: marketTypeId,
    translationKey: marketType.translationKey,
    oddsCount: allOdds.length,
    odds: allOdds
  };
}

function makeCacheKey(config) {
  return JSON.stringify({
    baseUrl: config.baseUrl,
    locale: config.locale,
    contentLanguage: config.contentLanguage,
    discriminationId: config.discriminationId,
    scheduleTimeFrame: config.scheduleTimeFrame,
    areaId: config.areaId,
    dateFilterType: config.dateFilterType,
    dateFilterRange: config.dateFilterRange,
    pageSize: config.pageSize,
    maxPagesPerMarketType: config.maxPagesPerMarketType,
    includeOdds: config.includeOdds,
    maxSports: config.maxSports,
    sportIds: config.sportIds
  });
}

export async function fetchAllSportsMarketTypesAndOdds(options = {}) {
  const config = resolveConfig(options);
  const cacheKey = makeCacheKey(config);
  const now = Date.now();

  const cached = snapshotCache.get(cacheKey);
  if (cached && now - cached.createdAt < config.cacheTtlMs) {
    return cached.value;
  }

  const headers = buildHeaders(config);
  const { sports: allSports } = await fetchPrematchNavigationRaw(config);
  const sportsById = new Map(allSports.map((sport) => [sport.id, sport]));
  const selectedById = config.sportIds
    .map((sportId) => sportsById.get(sportId))
    .filter(Boolean);

  const sports = selectedById.length
    ? selectedById
    : config.maxSports > 0
      ? allSports.slice(0, config.maxSports)
      : allSports;

  const sportResults = await mapWithConcurrency(
    sports,
    config.sportsConcurrency,
    async (sport) => {
      const sportId = sport.id;
      const sportName = sport.name;

      let marketTypes = [];
      try {
        marketTypes = await fetchMarketTypesForSport(sportId, config, headers);
      } catch (error) {
        return {
          sportId,
          sportName,
          marketTypesCount: 0,
          marketTypes: [],
          oddsByMarketTypeCount: 0,
          oddsByMarketType: [],
          error: error.message
        };
      }

      let oddsByMarketType = [];
      if (config.includeOdds && marketTypes.length > 0) {
        oddsByMarketType = await mapWithConcurrency(
          marketTypes,
          config.marketTypesConcurrency,
          async (marketType) => {
            try {
              return await fetchOddsForMarketType({ sportId, marketType, config, headers });
            } catch (error) {
              return {
                typeId: marketType.typeId,
                translationKey: marketType.translationKey,
                oddsCount: 0,
                odds: [],
                error: error.message
              };
            }
          }
        );
      }

      return {
        sportId,
        sportName,
        marketTypesCount: marketTypes.length,
        marketTypes,
        oddsByMarketTypeCount: oddsByMarketType.length,
        oddsByMarketType
      };
    }
  );

  const response = {
    generatedAt: new Date().toISOString(),
    baseUrl: config.baseUrl,
    areaId: config.areaId,
    dateFilterType: config.dateFilterType,
    dateFilterRange: config.dateFilterRange,
    pageSize: config.pageSize,
    maxPagesPerMarketType: config.maxPagesPerMarketType,
    includeOdds: config.includeOdds,
    sportsCount: sportResults.length,
    sports: sportResults
  };

  let totalOddsCount = 0;
  for (const sport of response.sports) {
    for (const marketType of sport.oddsByMarketType || []) {
      totalOddsCount += Number(marketType.oddsCount || 0);
    }
  }

  // Avoid caching empty snapshots: they are often transient upstream failures.
  if (totalOddsCount > 0 || !config.includeOdds) {
    snapshotCache.set(cacheKey, { createdAt: now, value: response });
  }

  return response;
}

function compactTokens(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function scoreSportByQuery(sport, queryTokens, queryText) {
  const sportName = String(sport?.name || "").toLowerCase();
  let score = 0;

  if (sportName && queryText.includes(sportName)) {
    score += 12;
  }

  for (const token of queryTokens) {
    if (sportName.includes(token)) {
      score += 4;
    }
  }

  for (const category of sport?.categories || []) {
    const categoryName = String(category?.name || "").toLowerCase();
    if (categoryName && queryText.includes(categoryName)) {
      score += 6;
    }

    for (const tournament of category?.tournaments || []) {
      const tournamentName = String(tournament?.name || "").toLowerCase();
      if (tournamentName && queryText.includes(tournamentName)) {
        score += 8;
      }
    }
  }

  return score;
}

function selectRelevantSportIds(query, sports, maxSports) {
  const queryText = String(query || "").toLowerCase();
  const queryTokens = compactTokens(queryText);

  const scored = (sports || [])
    .map((sport) => ({
      sport,
      score: scoreSportByQuery(sport, queryTokens, queryText)
    }))
    .sort((a, b) => b.score - a.score);

  const matched = scored.filter((item) => item.score > 0).slice(0, maxSports).map((item) => item.sport.id);
  if (matched.length) {
    return matched;
  }

  // No keyword matched: return all sports that have odds so the LLM gets real data
  return (sports || [])
    .filter((sport) => !("noOfOdds" in sport) || (sport.noOfOdds || 0) > 0)
    .slice(0, maxSports)
    .map((sport) => sport.id);
}

function splitParticipants(eventName) {
  const separators = [" vs ", " v ", " - "];
  const name = String(eventName || "").trim();
  for (const separator of separators) {
    if (name.toLowerCase().includes(separator)) {
      const [left, right] = name.split(new RegExp(separator, "i"));
      return {
        homeTeam: (left || name).trim(),
        awayTeam: (right || "").trim()
      };
    }
  }
  return { homeTeam: name, awayTeam: "" };
}

function normalizeSportsSnapshotToEvents(snapshot) {
  const eventsById = new Map();

  for (const sport of snapshot.sports || []) {
    for (const marketType of sport.oddsByMarketType || []) {
      for (const oddRecord of marketType.odds || []) {
        const eventId = oddRecord.eventId;
        if (!eventId) continue;

        if (!eventsById.has(eventId)) {
          const teams = splitParticipants(oddRecord.eventName);
          eventsById.set(eventId, {
            id: eventId,
            sport: sport.sportName,
            league: oddRecord.tournamentName || oddRecord.categoryName || "unknown",
            commenceTime: oddRecord.eventDate,
            homeTeam: teams.homeTeam,
            awayTeam: teams.awayTeam,
            markets: [],
            source: "kingmakers"
          });
        }

        const event = eventsById.get(eventId);
        let market = event.markets.find((item) => item.key === String(oddRecord.marketTypeId));

        if (!market) {
          market = {
            key: String(oddRecord.marketTypeId),
            name: oddRecord.marketName || oddRecord.marketTranslationKey || "Market",
            bookmaker: "Kingmakers",
            line: oddRecord.line,
            outcomes: []
          };
          event.markets.push(market);
        }

        market.outcomes.push({
          name: oddRecord.selectionName || oddRecord.selectionTranslationKey || "Selection",
          price: oddRecord.odd,
          impliedProbability: impliedProbability(oddRecord.odd)
        });
      }
    }
  }

  return Array.from(eventsById.values());
}

function takeDiverseBySport(events, limit) {
  if (limit <= 0) return [];

  const buckets = new Map();
  for (const event of events || []) {
    const sport = event?.sport || "unknown";
    if (!buckets.has(sport)) {
      buckets.set(sport, []);
    }
    buckets.get(sport).push(event);
  }

  const sports = Array.from(buckets.keys());
  const selected = [];

  while (selected.length < limit) {
    let addedInRound = false;
    for (const sport of sports) {
      const queue = buckets.get(sport);
      if (queue && queue.length > 0) {
        selected.push(queue.shift());
        addedInRound = true;
        if (selected.length >= limit) break;
      }
    }
    if (!addedInRound) break;
  }

  return selected;
}

export async function buildKingmakersOddsContext(userQuery, limit = 5, options = {}) {
  const queryMaxSports = Number.parseInt(
    String(options.maxSports ?? process.env.KINGMAKERS_QUERY_MAX_SPORTS ?? 5),
    10
  );
  const normalizedQueryMaxSports = Number.isFinite(queryMaxSports) && queryMaxSports > 0 ? queryMaxSports : 5;

  const navigation = await fetchPrematchNavigationRaw(options);
  const relevantSportIds = selectRelevantSportIds(
    userQuery,
    navigation.sports,
    normalizedQueryMaxSports
  );

  const snapshot = await fetchAllSportsMarketTypesAndOdds({
    includeOdds: true,
    maxSports: normalizedQueryMaxSports,
    sportIds: relevantSportIds,
    maxPagesPerMarketType:
      options.maxPagesPerMarketType ?? process.env.KINGMAKERS_QUERY_MAX_PAGES_PER_MARKET_TYPE ?? 3,
    pageSize: options.pageSize ?? process.env.KINGMAKERS_QUERY_PAGE_SIZE ?? 30,
    sportsConcurrency:
      options.sportsConcurrency ?? process.env.KINGMAKERS_QUERY_SPORTS_CONCURRENCY ?? 2,
    marketTypesConcurrency:
      options.marketTypesConcurrency ?? process.env.KINGMAKERS_QUERY_MARKET_TYPES_CONCURRENCY ?? 2,
    cacheTtlMs: options.cacheTtlMs ?? process.env.KINGMAKERS_QUERY_CACHE_TTL_MS ?? 60000
  });

  const events = normalizeSportsSnapshotToEvents(snapshot);
  const q = String(userQuery || "").toLowerCase();

  const matched = events.filter((event) => {
    const searchable = [event.sport, event.league, event.homeTeam, event.awayTeam, event.commenceTime]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchable
      .split(/\s+/)
      .filter((term) => term.length > 2)
      .some((term) => q.includes(term));
  });

  const primary = matched.length > 0 ? matched : events;
  const selected = takeDiverseBySport(primary, limit);

  if (selected.length < limit) {
    const usedIds = new Set(selected.map((event) => event.id));
    const remaining = events.filter((event) => !usedIds.has(event.id));
    selected.push(...takeDiverseBySport(remaining, limit - selected.length));
  }

  return {
    source: "kingmakers",
    events: selected
  };
}
