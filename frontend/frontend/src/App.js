
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './App.css';
import Draft from './Draft';
import Login from './Login';

const FANTASY_POINTS_CACHE_KEY = 'fantasyPointsCache-v4-20260406-shohei-hitter';
const TRADES_TAB_ENABLED = false;

function App() {
  const [activeTab, setActiveTab] = useState('players');
  const [players, setPlayers] = useState([]);
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerPositionFilter, setPlayerPositionFilter] = useState('ALL');
  const [playersSortSeason, setPlayersSortSeason] = useState('2026');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [backendStatus, setBackendStatus] = useState('checking...');
  const [myTeam, setMyTeam] = useState({ userId: '', userName: '', picks: [], groupId: '', benchPlayerIds: [], dropsUsed: 0, dropsRemaining: 1 });
  const [pendingSwapBenchPlayerId, setPendingSwapBenchPlayerId] = useState('');
  const [swapLoading, setSwapLoading] = useState(false);
  const [myTeamGroups, setMyTeamGroups] = useState([]);
  const [myTeamGroupsLoading, setMyTeamGroupsLoading] = useState(false);
  const [selectedMyTeamGroupId, setSelectedMyTeamGroupId] = useState('');
  const [groupPickedPlayerIds, setGroupPickedPlayerIds] = useState([]);
  const [groupPlayerOwnerById, setGroupPlayerOwnerById] = useState({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pickupLoadingPlayerId, setPickupLoadingPlayerId] = useState('');
  const [myTeamSelectionMessage, setMyTeamSelectionMessage] = useState('');
  const [teamNameInput, setTeamNameInput] = useState('');
  const [teamNameSaving, setTeamNameSaving] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [officialStatsCache, setOfficialStatsCache] = useState({});
  const [fantasyPoints2025Cache, setFantasyPoints2025Cache] = useState({});
  const [fantasyPoints2026Cache, setFantasyPoints2026Cache] = useState({});
  const [weeklyFantasyPointsCache, setWeeklyFantasyPointsCache] = useState({});
  const [fantasyPointsCache, setFantasyPointsCache] = useState(() => {
    try {
      const cached = localStorage.getItem(FANTASY_POINTS_CACHE_KEY);
      const parsed = cached ? JSON.parse(cached) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  });
  const [standings, setStandings] = useState([]);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [standingsError, setStandingsError] = useState('');
  const [standingsTeams, setStandingsTeams] = useState([]);
  const [standingsTeamsLoading, setStandingsTeamsLoading] = useState(false);
  const [standingsTeamsError, setStandingsTeamsError] = useState('');
  const [selectedStandingsTeamKey, setSelectedStandingsTeamKey] = useState('');
  const [tradeTeams, setTradeTeams] = useState({ myTeam: { players: [] }, otherTeams: [] });
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeError, setTradeError] = useState('');
  const [selectedTradePartnerId, setSelectedTradePartnerId] = useState('');
  const [offeredPlayerIds, setOfferedPlayerIds] = useState([]);
  const [requestedPlayerIds, setRequestedPlayerIds] = useState([]);
  const [tradeMessage, setTradeMessage] = useState('');
  const [tradeSubmitMessage, setTradeSubmitMessage] = useState('');
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState('');
  const [inboxData, setInboxData] = useState({ incomingOffers: [], sentPending: [], sentUpdates: [] });
  const [tradeEvaluationCache, setTradeEvaluationCache] = useState({});
  const fantasyPointsInFlightRef = useRef(new Map());
  const [auth, setAuth] = useState(() => {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    const userId = localStorage.getItem('userId');
    return token ? { token, username, userId } : null;
  });

  const currentGroup = useMemo(
    () => myTeamGroups.find((group) => group._id === selectedMyTeamGroupId) || null,
    [myTeamGroups, selectedMyTeamGroupId]
  );

  const playersById = useMemo(
    () => new Map((players || []).map((player) => [String(player._id), player])),
    [players]
  );

  const playersByName = useMemo(() => {
    const map = new Map();
    for (const player of players || []) {
      const key = String(player?.name || '').trim().toLowerCase();
      if (!key || map.has(key)) continue;
      map.set(key, player);
    }
    return map;
  }, [players]);

  useEffect(() => {
    try {
      localStorage.setItem(FANTASY_POINTS_CACHE_KEY, JSON.stringify(fantasyPointsCache));
    } catch {
      // Ignore storage errors; app can still use in-memory cache.
    }
  }, [fantasyPointsCache]);

  useEffect(() => {
    // Remove legacy cache key so old scoring values cannot leak into current seasons.
    localStorage.removeItem('fantasyPointsCache');
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  const canPickupInCurrentGroup = useMemo(() => {
    if (!currentGroup?.draftScheduledAt) return false;
    const scheduledAtMs = new Date(currentGroup.draftScheduledAt).getTime();
    if (!Number.isFinite(scheduledAtMs)) return false;
    return nowMs >= scheduledAtMs;
  }, [currentGroup?.draftScheduledAt, nowMs]);

  const getPlayerPhoto = (player) => {
    if (player?.photoUrl) return player.photoUrl;
    const playerName = player?.name || 'Player';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(playerName)}&size=96&background=667eea&color=ffffff&bold=true`;
  };

  const getTeamLogo = (team) => {
    const code = (team || '').toUpperCase();
    const teamCodeMap = {
      AZ: 'ari',
      ARI: 'ari',
      ATL: 'atl',
      BAL: 'bal',
      BOS: 'bos',
      CHC: 'chc',
      CWS: 'cws',
      CHW: 'cws',
      CIN: 'cin',
      CLE: 'cle',
      COL: 'col',
      DET: 'det',
      HOU: 'hou',
      KC: 'kc',
      KCR: 'kc',
      LAA: 'laa',
      LAD: 'lad',
      MIA: 'mia',
      MIL: 'mil',
      MIN: 'min',
      NYM: 'nym',
      NYY: 'nyy',
      ATH: 'ath',
      OAK: 'oak',
      PHI: 'phi',
      PIT: 'pit',
      SD: 'sd',
      SDP: 'sd',
      SEA: 'sea',
      SF: 'sf',
      SFG: 'sf',
      STL: 'stl',
      TB: 'tb',
      TBR: 'tb',
      TEX: 'tex',
      TOR: 'tor',
      WSH: 'wsh',
      WAS: 'wsh'
    };

    const espnCode = teamCodeMap[code] || code.toLowerCase();
    return `https://a.espncdn.com/i/teamlogos/mlb/500/${espnCode}.png`;
  };

  const isPitcherPosition = (position) => String(position || '').toUpperCase().includes('P');
  const HITTER_POSITION_ACCEPTS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH'];
  const MAX_BENCH_SLOTS = 0;

  function inferPitcherRosterRole(player, preferredSeason = 2026) {
    if (!player) return 'RP';

    const statsBySeason = player?.statsBySeason && typeof player.statsBySeason === 'object'
      ? player.statsBySeason
      : {};
    const seasonKeys = Object.keys(statsBySeason)
      .filter((season) => statsBySeason[season] && typeof statsBySeason[season] === 'object')
      .sort((a, b) => Number(b) - Number(a));

    const preferredKey = String(preferredSeason || '');
    const seasonStats = preferredKey && statsBySeason[preferredKey] && typeof statsBySeason[preferredKey] === 'object'
      ? statsBySeason[preferredKey]
      : seasonKeys.length > 0
        ? statsBySeason[seasonKeys[0]]
        : null;

    const stats = seasonStats && typeof seasonStats === 'object'
      ? seasonStats
      : player?.stats && typeof player.stats === 'object'
        ? player.stats
        : {};

    const read = (...keys) => {
      for (const key of keys) {
        const raw = stats?.[key];
        const value = Number(raw);
        if (Number.isFinite(value)) return value;
      }
      return null;
    };

    const gamesStarted = read('GamesStarted', 'Started', 'PitchingGamesStarted', 'GS');
    const gamesPitched = read('Games', 'GamesPitched', 'PitchingGames', 'Appearances', 'GP');
    const saves = read('Saves', 'PitchingSaves', 'SV') || 0;
    const holds = read('Holds', 'PitchingHolds', 'HLD') || 0;
    const gamesFinished = read('GamesFinished', 'PitchingGamesFinished', 'GF') || 0;

    if (Number.isFinite(gamesStarted) && gamesStarted >= 10) return 'SP';

    if (Number.isFinite(gamesStarted) && Number.isFinite(gamesPitched) && gamesPitched > 0) {
      const startRate = gamesStarted / gamesPitched;
      if (startRate >= 0.45) return 'SP';
      if (startRate <= 0.25) return 'RP';
    }

    if (saves > 0 || holds > 0 || gamesFinished > 0) return 'RP';
    if (Number.isFinite(gamesStarted) && gamesStarted > 0) return 'SP';

    return 'RP';
  }

  function resolveRosterPosition(playerOrPosition, preferredSeason = 2026) {
    if (!playerOrPosition) return '';

    if (typeof playerOrPosition === 'object') {
      const normalized = String(playerOrPosition.position || '').toUpperCase();
      if (!normalized) return '';
      if (normalized === 'SP' || normalized === 'RP') return normalized;
      if (normalized.includes('P')) return inferPitcherRosterRole(playerOrPosition, preferredSeason);
      return normalized;
    }

    const normalized = String(playerOrPosition || '').toUpperCase();
    if (!normalized) return '';
    return normalized;
  }

  const dedupePicksByPlayerId = (picks = []) => {
    const latestByPlayerId = new Map();

    for (const pick of picks || []) {
      const playerId = String(pick?.playerId || '').trim();
      if (!playerId) continue;

      const current = latestByPlayerId.get(playerId);
      if (!current) {
        latestByPlayerId.set(playerId, pick);
        continue;
      }

      const currentTs = new Date(current.timestamp || 0).getTime();
      const nextTs = new Date(pick.timestamp || 0).getTime();
      if (nextTs >= currentTs) {
        latestByPlayerId.set(playerId, pick);
      }
    }

    return [...latestByPlayerId.values()];
  };

  const normalizeTeamOverviewTeam = useCallback((team) => ({
    ...team,
    picks: dedupePicksByPlayerId(team?.picks || []),
    benchPlayerIds: [...new Set((team?.benchPlayerIds || []).map(String))].slice(0, MAX_BENCH_SLOTS)
  }), []);

  const buildRosterSlots = (picks, allPlayers, benchPlayerIds = []) => {
    const limitedBenchIds = [...new Set((benchPlayerIds || []).map(String))].slice(0, MAX_BENCH_SLOTS);
    const benchSet = new Set(limitedBenchIds);
    const slotTemplate = [
      { key: 'C', label: 'C', accepts: ['C'], isBench: false },
      { key: '1B', label: '1B', accepts: ['1B'], isBench: false },
      { key: '2B', label: '2B', accepts: ['2B'], isBench: false },
      { key: '3B', label: '3B', accepts: ['3B'], isBench: false },
      { key: 'SS', label: 'SS', accepts: ['SS'], isBench: false },
      { key: 'LF', label: 'LF', accepts: ['LF', 'OF'], isBench: false },
      { key: 'CF', label: 'CF', accepts: ['CF', 'OF'], isBench: false },
      { key: 'RF', label: 'RF', accepts: ['RF', 'OF'], isBench: false },
      { key: 'DH1', label: 'DH', accepts: HITTER_POSITION_ACCEPTS, isBench: false },
      { key: 'DH2', label: 'DH', accepts: HITTER_POSITION_ACCEPTS, isBench: false },
      { key: 'SP1', label: 'SP1', accepts: ['SP'], isBench: false },
      { key: 'SP2', label: 'SP2', accepts: ['SP'], isBench: false },
      { key: 'RP', label: 'RP', accepts: ['RP'], isBench: false }
    ].map((slot) => ({ ...slot, player: null, round: null }));

    for (const pick of picks) {
      const player = allPlayers.find((p) => p._id === pick.playerId) || null;
      const fallbackPosition = String(player?.position || '').toUpperCase();

      const slotPlayer = player || {
        name: pick.playerName,
        team: '',
        position: fallbackPosition || '',
        homeruns: 0,
        strikeouts: 0,
        photoUrl: ''
      };

      const isOnBench = benchSet.has(String(pick.playerId || ''));

      if (isOnBench) {
        const bnIndex = slotTemplate.findIndex((slot) => slot.isBench && !slot.player);
        if (bnIndex >= 0) {
          slotTemplate[bnIndex].player = slotPlayer;
          slotTemplate[bnIndex].round = pick.round;
        }
      } else {
        let targetIndex = -1;
        if (isPitcherPosition(slotPlayer.position)) {
          const pitcherRole = resolveRosterPosition(slotPlayer);
          targetIndex = slotTemplate.findIndex((slot) => !slot.isBench && slot.accepts.includes(pitcherRole) && !slot.player);
        } else {
          targetIndex = slotTemplate.findIndex((slot) => !slot.isBench && slot.accepts.includes(String(slotPlayer.position || '').toUpperCase()) && !slot.player);
        }

        if (targetIndex >= 0) {
          slotTemplate[targetIndex].player = slotPlayer;
          slotTemplate[targetIndex].round = pick.round;
        } else {
          // Overflow to bench if no active slot available
          const bnIndex = slotTemplate.findIndex((slot) => slot.isBench && !slot.player);
          if (bnIndex >= 0) {
            slotTemplate[bnIndex].player = slotPlayer;
            slotTemplate[bnIndex].round = pick.round;
          }
        }
      }
    }

    return { slots: slotTemplate, bench: [] };
  };

  const TRACKED_STATS = [
    { id: 'WAR', label: 'WAR (Wins Above Replacement)', keys: ['WAR', 'War', 'WinsAboveReplacement'] },
    { id: 'OPS', label: 'OPS (On-base + Slugging)', keys: ['OPS', 'OnBasePlusSlugging', 'OnBasePlusSluggingPercentage'] },
    { id: 'AVG', label: 'AVG (Batting Average)', keys: ['AVG', 'BattingAverage'] },
    { id: 'HR', label: 'HR (Home Runs)', keys: ['HR', 'HomeRuns'] },
    { id: 'RBI', label: 'RBI (Runs Batted In)', keys: ['RBI', 'RunsBattedIn'] },
    { id: 'OBP', label: 'OBP (On-Base Percentage)', keys: ['OBP', 'OnBasePercentage'] },
    { id: 'SB', label: 'SB (Stolen Bases)', keys: ['SB', 'StolenBases'] },
    { id: 'ERA', label: 'ERA (Earned Run Average)', keys: ['ERA', 'EarnedRunAverage'] },
    { id: 'K', label: 'K (Strikeouts)', keys: ['K', 'SO', 'Strikeouts', 'PitchingStrikeouts'] },
    { id: 'WHIP', label: 'WHIP (Walks + Hits / IP)', keys: ['WHIP', 'WalksHitsPerInningsPitched', 'WalksHitsPerInningPitched'] }
  ];

  const ALLOWED_SEASONS = new Set(['2026', '2025']);

  const getTrackedStatsForPlayer = (player) => {
    const isPitcher = (player?.position || '').toUpperCase() === 'P';
    if (isPitcher) {
      const pitcherStats = new Set(['WAR', 'ERA', 'K', 'WHIP']);
      return TRACKED_STATS.filter((stat) => pitcherStats.has(stat.id));
    }
    const pitcherOnly = new Set(['ERA', 'K', 'WHIP']);
    return TRACKED_STATS.filter((stat) => !pitcherOnly.has(stat.id));
  };

  const getTrackedStatValue = (stats, keys) => {
    for (const key of keys) {
      const value = stats?.[key];
      if (value !== null && value !== undefined && typeof value !== 'object') {
        return value;
      }
    }
    return undefined;
  };

  const getOfficialOverrideValue = (statId, officialStats) => {
    if (!officialStats || typeof officialStats !== 'object') return undefined;
    const value = officialStats[statId];
    return value === null || value === undefined ? undefined : value;
  };

  const getComputedBattingAverage = (stats) => {
    const hits = Number(stats?.Hits);
    const atBats = Number(stats?.AtBats);
    if (Number.isFinite(hits) && Number.isFinite(atBats) && atBats > 0) {
      return hits / atBats;
    }
    return undefined;
  };

  const getComputedOnBasePercentage = (stats) => {
    const hits = Number(stats?.Hits);
    const walks = Number(stats?.Walks);
    const hitByPitch = Number(stats?.HitByPitch);
    const atBats = Number(stats?.AtBats);
    const sacFlies = Number(stats?.SacrificeFlies);

    const numerator = (Number.isFinite(hits) ? hits : 0)
      + (Number.isFinite(walks) ? walks : 0)
      + (Number.isFinite(hitByPitch) ? hitByPitch : 0);

    const denominator = (Number.isFinite(atBats) ? atBats : 0)
      + (Number.isFinite(walks) ? walks : 0)
      + (Number.isFinite(hitByPitch) ? hitByPitch : 0)
      + (Number.isFinite(sacFlies) ? sacFlies : 0);

    if (denominator > 0) {
      return numerator / denominator;
    }
    return undefined;
  };

  const getComputedOPS = (stats) => {
    const obp = getComputedOnBasePercentage(stats);
    const slg = Number(stats?.SluggingPercentage);

    if (obp !== undefined && Number.isFinite(slg)) {
      return obp + slg;
    }
    return undefined;
  };

  const formatStatValue = (stat) => {
    const rawValue = stat?.value;
    const isWholeNumberStat = /\b(stolen bases|sb|home runs|hr|runs batted in|rbi|strikeouts|\bk\b)\b/i.test(stat?.label || '') || /\b(stolenbases|sb|homeruns|hr|runsbattedin|rbi|strikeouts|\bk\b)\b/i.test(stat?.key || '');
    if (isWholeNumberStat) {
      const numeric = typeof rawValue === 'number' ? rawValue : Number(rawValue);
      if (Number.isNaN(numeric)) return String(rawValue);
      return String(Math.round(numeric));
    }

    const isPercentageStat = /percentage|batting average|\bavg\b|\bops\b/i.test(stat?.label || '') || /percentage|battingaverage|\bavg\b|\bops\b/i.test(stat?.key || '');

    if (!isPercentageStat) {
      return String(rawValue);
    }

    const numeric = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (Number.isNaN(numeric)) {
      return String(rawValue);
    }

    const fixed = numeric.toFixed(3);
    if (fixed.startsWith('-0')) return `-${fixed.slice(2)}`;
    if (fixed.startsWith('0')) return fixed.slice(1);
    return fixed;
  };

  const getSeasonOptions = (player) => {
    const statsBySeason = player?.statsBySeason && typeof player.statsBySeason === 'object'
      ? player.statsBySeason
      : {};

    return Object.keys(statsBySeason)
      .filter((season) => ALLOWED_SEASONS.has(String(season)))
      .filter((season) => statsBySeason[season] && typeof statsBySeason[season] === 'object')
      .sort((a, b) => Number(b) - Number(a));
  };

  const getLatestSeasonForPlayer = (player) => {
    const seasons = getSeasonOptions(player);
    return Number(seasons[0] || new Date().getFullYear());
  };

  const getPitcherRole = (player, preferredSeason = 2026) => resolveRosterPosition(player, preferredSeason) || 'RP';

  const matchesPositionFilter = (playerOrPosition, selectedFilter) => {
    if (selectedFilter === 'ALL') return true;

    if (selectedFilter === 'SP' || selectedFilter === 'RP') {
      return getPitcherRole(playerOrPosition, 2026) === selectedFilter;
    }

    const normalizedPosition = typeof playerOrPosition === 'object'
      ? String(playerOrPosition?.position || '').toUpperCase()
      : String(playerOrPosition || '').toUpperCase();

    return normalizedPosition
      .split(/[\/,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean)
      .includes(selectedFilter);
  };

  const formatLocalDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const currentWeekWindow = useMemo(() => {
    const base = new Date(nowMs);
    const start = new Date(base);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return {
      startDate: formatLocalDateKey(start),
      endDate: formatLocalDateKey(end)
    };
  }, [nowMs]);

  const fetchFantasyPointsForSeason = useCallback(async (playerId, season) => {
    const safePlayerId = String(playerId || '').trim();
    const seasonKey = String(season || '').trim();
    if (!safePlayerId || !seasonKey) return null;

    const cacheKey = `${safePlayerId}-${seasonKey}`;
    const cached = fantasyPointsCache[cacheKey];
    if (cached !== undefined && cached !== null) return cached;

    const inFlight = fantasyPointsInFlightRef.current.get(cacheKey);
    if (inFlight) return inFlight;

    const requestPromise = (async () => {
      try {
        const res = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/players/${safePlayerId}/fantasy-points?season=${seasonKey}`);
        if (!res.ok) throw new Error('failed');

        const data = await res.json();
        const points = Number(data?.totals?.fantasyPoints);
        const safePoints = Number.isFinite(points) ? points : 0;

        setFantasyPointsCache((prev) => ({
          ...prev,
          [cacheKey]: safePoints
        }));

        if (seasonKey === '2025') {
          setFantasyPoints2025Cache((prev) => ({ ...prev, [safePlayerId]: safePoints }));
        } else if (seasonKey === '2026') {
          setFantasyPoints2026Cache((prev) => ({ ...prev, [safePlayerId]: safePoints }));
        }

        return safePoints;
      } catch {
        setFantasyPointsCache((prev) => ({
          ...prev,
          [cacheKey]: null
        }));

        if (seasonKey === '2025') {
          setFantasyPoints2025Cache((prev) => ({ ...prev, [safePlayerId]: null }));
        } else if (seasonKey === '2026') {
          setFantasyPoints2026Cache((prev) => ({ ...prev, [safePlayerId]: null }));
        }

        return null;
      } finally {
        fantasyPointsInFlightRef.current.delete(cacheKey);
      }
    })();

    fantasyPointsInFlightRef.current.set(cacheKey, requestPromise);
    return requestPromise;
  }, [fantasyPointsCache]);

  const getCurrentSeasonFantasyPoints = (player) => {
    const currentSeason = String(new Date().getFullYear());
    if (!player?._id) return null;
    const cacheKey = `${player._id}-${currentSeason}`;
    return fantasyPointsCache[cacheKey];
  };

  const positionPlayerOptions = [...new Set(
    players
      .filter((player) => player.position !== 'P')
      .flatMap((player) => String(player.position || '')
        .toUpperCase()
        .split(/[\/,\s]+/)
        .map((value) => value.trim())
        .filter(Boolean))
  )].sort((a, b) => a.localeCompare(b));

  const filteredAllPlayers = players
    .filter((player) => (
      player.name.toLowerCase().includes(playerSearch.toLowerCase())
      || player.team.toLowerCase().includes(playerSearch.toLowerCase())
      || player.position.toLowerCase().includes(playerSearch.toLowerCase())
    ))
    .filter((player) => matchesPositionFilter(player, playerPositionFilter))
    .sort((a, b) => {
      const aPoints = Number(fantasyPointsCache[`${a._id}-${playersSortSeason}`]);
      const bPoints = Number(fantasyPointsCache[`${b._id}-${playersSortSeason}`]);
      const safeA = Number.isFinite(aPoints) ? aPoints : -Infinity;
      const safeB = Number.isFinite(bPoints) ? bPoints : -Infinity;
      return safeB - safeA;
    });

  const getModalFantasyPoints = (player, season) => {
    if (!player?._id || !season) return undefined;

    const seasonKey = String(season);
    const seasonCacheValue = seasonKey === '2025'
      ? fantasyPoints2025Cache[player._id]
      : seasonKey === '2026'
        ? fantasyPoints2026Cache[player._id]
        : undefined;
    if (seasonCacheValue !== undefined) return seasonCacheValue;

    const cacheKey = `${player._id}-${seasonKey}`;
    const cachedPoints = fantasyPointsCache[cacheKey];
    if (cachedPoints !== undefined) return cachedPoints;

    return undefined;
  };

  const getPlayerStatsList = (player, season, officialStats) => {
    if (!player) return [];
    const trackedStats = getTrackedStatsForPlayer(player);
    const statsBySeason = player.statsBySeason && typeof player.statsBySeason === 'object' ? player.statsBySeason : {};

    const seasonStats = season && statsBySeason[season] && typeof statsBySeason[season] === 'object'
      ? statsBySeason[season]
      : null;

    if (seasonStats) {
      const selectedSeasonEntries = trackedStats
        .map((stat) => {
          const value = getOfficialOverrideValue(stat.id, officialStats) ?? (
            stat.id === 'AVG'
              ? (getComputedBattingAverage(seasonStats) ?? getTrackedStatValue(seasonStats, stat.keys))
              : stat.id === 'OBP'
                ? (getComputedOnBasePercentage(seasonStats) ?? getTrackedStatValue(seasonStats, stat.keys))
                : stat.id === 'OPS'
                  ? (getComputedOPS(seasonStats) ?? getTrackedStatValue(seasonStats, stat.keys))
                  : getTrackedStatValue(seasonStats, stat.keys)
          );

          if (value === undefined) return null;
          return { key: `${season}-${stat.id}`, label: stat.label, value };
        })
        .filter(Boolean);

      if (selectedSeasonEntries.length > 0) return selectedSeasonEntries;
    }

    const rawStats = player.stats && typeof player.stats === 'object' ? player.stats : {};

    const entries = trackedStats
      .map((stat) => {
        const value = stat.id === 'AVG'
          ? (getComputedBattingAverage(rawStats) ?? getTrackedStatValue(rawStats, stat.keys))
          : stat.id === 'OBP'
            ? (getComputedOnBasePercentage(rawStats) ?? getTrackedStatValue(rawStats, stat.keys))
            : stat.id === 'OPS'
              ? (getComputedOPS(rawStats) ?? getTrackedStatValue(rawStats, stat.keys))
              : getTrackedStatValue(rawStats, stat.keys);
        if (value === undefined) return null;
        return { key: stat.id, label: stat.label, value };
      })
      .filter(Boolean);

    if (entries.length > 0) return entries;

    const fallback = {
      HomeRuns: player.homeruns,
      Strikeouts: player.strikeouts
    };

    return trackedStats
      .map((stat) => {
        const value = getTrackedStatValue(fallback, stat.keys);
        if (value === undefined) return null;
        return { key: `fallback-${stat.id}`, label: stat.label, value };
      })
      .filter(Boolean);
  };

  useEffect(() => {
    if (!selectedPlayer) {
      setSelectedSeason(null);
      return;
    }

    const seasons = getSeasonOptions(selectedPlayer);
    setSelectedSeason(seasons[0] || null);
  }, [selectedPlayer]);

  useEffect(() => {
    const fetchOfficialStats = async () => {
      if (!selectedPlayer?._id || !selectedSeason) return;
      const cacheKey = `${selectedPlayer._id}-${selectedSeason}`;
      if (Object.prototype.hasOwnProperty.call(officialStatsCache, cacheKey)) return;

      try {
        const res = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/players/${selectedPlayer._id}/official-stats?season=${selectedSeason}`);
        if (!res.ok) {
          setOfficialStatsCache((prev) => ({ ...prev, [cacheKey]: null }));
          return;
        }
        const data = await res.json();
        setOfficialStatsCache((prev) => ({ ...prev, [cacheKey]: data.stats || null }));
      } catch {
        setOfficialStatsCache((prev) => ({ ...prev, [cacheKey]: null }));
      }
    };

    fetchOfficialStats();
  }, [selectedPlayer?._id, selectedSeason]);

  useEffect(() => {
    const fetchFantasyPoints2025 = async () => {
      if (!selectedPlayer?._id || Number(selectedSeason) !== 2025) return;
      await fetchFantasyPointsForSeason(selectedPlayer._id, 2025);
    };

    fetchFantasyPoints2025();
  }, [selectedPlayer?._id, selectedSeason, fetchFantasyPointsForSeason]);

  useEffect(() => {
    const fetchFantasyPoints2026 = async () => {
      if (!selectedPlayer?._id || Number(selectedSeason) !== 2026) return;
      await fetchFantasyPointsForSeason(selectedPlayer._id, 2026);
    };

    fetchFantasyPoints2026();
  }, [selectedPlayer?._id, selectedSeason, fetchFantasyPointsForSeason]);

  useEffect(() => {
    if (!selectedPlayer?._id) return;
    const seasonsToPrefetch = getSeasonOptions(selectedPlayer);
    if (!seasonsToPrefetch.length) return;

    Promise.all(
      seasonsToPrefetch.map((season) => fetchFantasyPointsForSeason(selectedPlayer._id, season))
    );
  }, [selectedPlayer?._id, selectedPlayer, fetchFantasyPointsForSeason]);

  const handleLogin = (authData) => {
    setAuth(authData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('userId');
    setAuth(null);
    setMyTeam({ userId: '', userName: '', picks: [], groupId: '', benchPlayerIds: [], dropsUsed: 0, dropsRemaining: 1 });
  };

  const fetchMyTeam = useCallback(async () => {
    if (!auth?.token) return;
    try {
      const res = await fetch('https://fantasy-baseball-o8ta.onrender.com/api/drafts/my-team', {
        headers: { Authorization: `Bearer ${auth.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMyTeam({ userId: auth.userId, userName: data.username, picks: data.picks, groupId: '', benchPlayerIds: [], dropsUsed: 0, dropsRemaining: 1 });
      }
    } catch (err) {
      console.error('Failed to fetch my team:', err);
    }
  }, [auth?.token, auth?.userId]);

  const fetchMyTeamGroups = useCallback(async () => {
    if (!auth?.token) return;

    setMyTeamGroupsLoading(true);
    setMyTeamSelectionMessage('');
    try {
      const res = await fetch('https://fantasy-baseball-o8ta.onrender.com/api/groups', {
        headers: { Authorization: `Bearer ${auth.token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to load groups');

      const groups = Array.isArray(data?.groups) ? data.groups : [];
      setMyTeamGroups(groups);
      setSelectedMyTeamGroupId((currentGroupId) => {
        if (currentGroupId && groups.some((group) => group._id === currentGroupId)) {
          return currentGroupId;
        }
        return groups[0]?._id || '';
      });
    } catch (err) {
      setMyTeamGroups([]);
      setSelectedMyTeamGroupId('');
      setMyTeamSelectionMessage(err.message || 'Failed to load groups');
    } finally {
      setMyTeamGroupsLoading(false);
    }
  }, [auth?.token]);

  const fetchGroupTeamsForMyTeam = useCallback(async (groupId) => {
    if (!auth?.token || !groupId) {
      setGroupPickedPlayerIds([]);
      setGroupPlayerOwnerById({});
      setMyTeam({ userId: '', userName: '', picks: [], groupId: '', benchPlayerIds: [], dropsUsed: 0, dropsRemaining: 1 });
      return;
    }

    setMyTeamSelectionMessage('');
    try {
      const res = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/groups/${groupId}/teams`, {
        headers: { Authorization: `Bearer ${auth.token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to load group teams');

      const teams = Array.isArray(data?.teams) ? data.teams : [];
      const ownedPlayerIds = new Set();
      const ownerByPlayerId = {};
      teams.forEach((team) => {
        (team.picks || []).forEach((pick) => {
          if (pick?.playerId) {
            const playerId = String(pick.playerId);
            ownedPlayerIds.add(playerId);
            ownerByPlayerId[playerId] = team.username || 'Another Team';
          }
        });
      });
      setGroupPickedPlayerIds([...ownedPlayerIds]);
      setGroupPlayerOwnerById(ownerByPlayerId);

      const selectedTeam = teams.find((team) => team.userId === auth?.userId) || null;

      setMyTeam({
        userId: selectedTeam?.userId || auth?.userId || '',
        userName: selectedTeam?.username || auth?.username || '',
        picks: dedupePicksByPlayerId(selectedTeam?.picks || []),
        groupId,
        benchPlayerIds: [...new Set(selectedTeam?.benchPlayerIds || [])].slice(0, MAX_BENCH_SLOTS),
        dropsUsed: Math.max(0, Number(selectedTeam?.dropsUsed) || 0),
        dropsRemaining: Math.max(0, Number(selectedTeam?.dropsRemaining ?? 1))
      });

      if (!selectedTeam) {
        setMyTeamSelectionMessage('You do not have a team in this group yet.');
      }
    } catch (err) {
      setGroupPickedPlayerIds([]);
      setGroupPlayerOwnerById({});
      setMyTeam({ userId: '', userName: '', picks: [], groupId, benchPlayerIds: [], dropsUsed: 0, dropsRemaining: 1 });
      setMyTeamSelectionMessage(err.message || 'Failed to load group teams');
    }
  }, [auth?.token, auth?.userId, auth?.username]);

  const handlePickupPlayer = async (player) => {
    if (!auth?.token || !selectedMyTeamGroupId || !player?._id) return;
    if (!canPickupInCurrentGroup) {
      if (!currentGroup?.draftScheduledAt) {
        alert('Pickups unlock after your group draft time is set and has passed.');
      } else {
        alert(`Pickups unlock after ${new Date(currentGroup.draftScheduledAt).toLocaleString()}`);
      }
      return;
    }

    if (!hasOpenSlotForPosition(player)) {
      const normalizedPosition = resolveRosterPosition(player) || 'N/A';
      alert(`No available lineup slot for position ${normalizedPosition}`);
      return;
    }

    setPickupLoadingPlayerId(player._id);
    try {
      const res = await fetch('https://fantasy-baseball-o8ta.onrender.com/api/drafts/my-team/pickup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify({ playerId: player._id, groupId: selectedMyTeamGroupId })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || 'Failed to pick up player');
      }

      await fetchGroupTeamsForMyTeam(selectedMyTeamGroupId);

      if (activeTab === 'trades') {
        fetchTradeTeams();
      }
      if (activeTab === 'standings') {
        fetchStandings();
      }
    } catch (err) {
      alert(err.message || 'Failed to pick up player');
    } finally {
      setPickupLoadingPlayerId('');
    }
  };


  const handleDropPlayer = async (player) => {
    if (!auth?.token || !player?._id) return;
    if (!selectedMyTeamGroupId) {
      alert('Select a group before dropping a player.');
      return;
    }
    if ((Number(myTeam.dropsRemaining) || 0) <= 0) {
      alert('You already used your one allowed drop for this group.');
      return;
    }

    const confirmed = window.confirm(`Drop ${player.name} from your roster? This cannot be undone and uses your only drop for this group.`);
    if (!confirmed) return;

    try {
      const res = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/drafts/my-team/${player._id}?groupId=${encodeURIComponent(selectedMyTeamGroupId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${auth.token}` }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || 'Failed to drop player');
      }

      const droppedPlayerId = String(player._id);

      // Optimistically update local state so Players tab reflects availability immediately.
      setGroupPickedPlayerIds((prev) => prev.filter((id) => String(id) !== droppedPlayerId));
      setGroupPlayerOwnerById((prev) => {
        const next = { ...prev };
        delete next[droppedPlayerId];
        return next;
      });

      setMyTeam((prev) => ({
        ...prev,
        picks: (prev.picks || []).filter((pick) => String(pick?.playerId || '') !== droppedPlayerId)
      }));

      if (selectedMyTeamGroupId) {
        await fetchGroupTeamsForMyTeam(selectedMyTeamGroupId);
      } else {
        setMyTeam((prev) => ({
          ...prev,
          userId: prev.userId || auth?.userId || '',
          userName: data.username || prev.userName,
          picks: data.picks || [],
          dropsUsed: Math.max(0, Number(data?.dropsUsed) || 0),
          dropsRemaining: Math.max(0, Number(data?.dropsRemaining ?? prev.dropsRemaining ?? 1))
        }));
      }
      fetchTradeTeams();
      fetchStandings();
    } catch (err) {
      alert(err.message || 'Failed to drop player');
    }
  };

  const handleSwapRoster = async (benchPlayerId, activePlayerId) => {
    if (!auth?.token || !selectedMyTeamGroupId) return;
    setSwapLoading(true);
    try {
      const res = await fetch('https://fantasy-baseball-o8ta.onrender.com/api/drafts/roster/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify({ groupId: selectedMyTeamGroupId, benchPlayerId, activePlayerId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Swap failed');
      setPendingSwapBenchPlayerId('');
      await fetchGroupTeamsForMyTeam(selectedMyTeamGroupId);
    } catch (err) {
      alert(err.message || 'Swap failed');
    } finally {
      setSwapLoading(false);
    }
  };

  const handleSaveTeamName = async () => {
    if (!auth?.token || !selectedMyTeamGroupId) return;

    const nextName = String(teamNameInput || '').trim();
    if (!nextName) {
      alert('Enter a team name first.');
      return;
    }

    setTeamNameSaving(true);
    try {
      const res = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/groups/${selectedMyTeamGroupId}/team-name`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify({ teamName: nextName })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to update team name');

      await Promise.all([
        fetchGroupTeamsForMyTeam(selectedMyTeamGroupId),
        fetchStandings(),
        fetchStandingsTeams(),
        fetchTradeTeams(),
        fetchInbox(),
        fetchMyTeamGroups()
      ]);
    } catch (err) {
      alert(err.message || 'Failed to update team name');
    } finally {
      setTeamNameSaving(false);
    }
  };

  const fetchStandings = useCallback(async () => {
    setStandingsLoading(true);
    setStandingsError('');
    try {
      const query = selectedMyTeamGroupId ? `?groupId=${encodeURIComponent(selectedMyTeamGroupId)}` : '';
      const res = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/drafts/standings${query}`);
      if (!res.ok) throw new Error('Failed to load standings');
      const data = await res.json();
      setStandings(Array.isArray(data?.standings) ? data.standings : []);
    } catch (err) {
      setStandings([]);
      setStandingsError(err.message || 'Failed to load standings');
    } finally {
      setStandingsLoading(false);
    }
  }, [selectedMyTeamGroupId]);

  const fetchStandingsTeams = useCallback(async () => {
    if (!auth?.token || !selectedMyTeamGroupId) {
      setStandingsTeams([]);
      return;
    }

    setStandingsTeamsLoading(true);
    setStandingsTeamsError('');
    try {
      const res = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/groups/${selectedMyTeamGroupId}/teams`, {
        headers: { Authorization: `Bearer ${auth.token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to load team overviews');

      const normalizedTeams = (Array.isArray(data?.teams) ? data.teams : []).map(normalizeTeamOverviewTeam);
      setStandingsTeams(normalizedTeams);
    } catch (err) {
      setStandingsTeams([]);
      setStandingsTeamsError(err.message || 'Failed to load team overviews');
    } finally {
      setStandingsTeamsLoading(false);
    }
  }, [auth?.token, selectedMyTeamGroupId, normalizeTeamOverviewTeam]);

  const getStandingsTeamSelectionKey = useCallback((teamLike) => {
    const userId = String(teamLike?.userId || '').trim();
    if (userId) return `uid:${userId}`;

    const teamName = String(teamLike?.teamName || teamLike?.username || teamLike?.name || '').trim().toLowerCase();
    if (teamName) return `name:${teamName}`;

    const fallbackId = String(teamLike?.teamId || teamLike?._id || '').trim();
    return fallbackId ? `id:${fallbackId}` : '';
  }, []);

  const normalizeTeamName = useCallback(
    (nameValue) => String(nameValue || '').trim().toLowerCase(),
    []
  );

  const getOverviewTeamForStandingsRow = useCallback((teamLike) => {
    if (!teamLike) return null;

    const targetUserId = String(teamLike?.userId || '').trim();
    if (targetUserId) {
      const byUserId = standingsTeams.find((team) => String(team?.userId || '').trim() === targetUserId);
      if (byUserId) return byUserId;
    }

    const targetName = normalizeTeamName(teamLike?.teamName || teamLike?.username || teamLike?.name);
    if (targetName) {
      const byName = standingsTeams.find((team) => (
        normalizeTeamName(team?.username || team?.teamName || team?.name) === targetName
      ));
      if (byName) return byName;
    }

    const targetKey = getStandingsTeamSelectionKey(teamLike);
    return standingsTeams.find((team) => getStandingsTeamSelectionKey(team) === targetKey) || null;
  }, [standingsTeams, normalizeTeamName, getStandingsTeamSelectionKey]);

  const selectedStandingsTeam = useMemo(() => {
    if (!selectedStandingsTeamKey) return null;

    const exact = standingsTeams.find((team) => getStandingsTeamSelectionKey(team) === selectedStandingsTeamKey);
    if (exact) return exact;

    if (selectedStandingsTeamKey.startsWith('uid:')) {
      const targetUserId = selectedStandingsTeamKey.slice(4);
      return standingsTeams.find((team) => String(team?.userId || '').trim() === targetUserId) || null;
    }

    if (selectedStandingsTeamKey.startsWith('name:')) {
      const targetName = normalizeTeamName(selectedStandingsTeamKey.slice(5));
      return standingsTeams.find((team) => (
        normalizeTeamName(team?.username || team?.teamName || team?.name) === targetName
      )) || null;
    }

    return null;
  }, [standingsTeams, selectedStandingsTeamKey, getStandingsTeamSelectionKey, normalizeTeamName]);

  const selectedStandingsTeamPlayers = useMemo(() => {
    if (!selectedStandingsTeam) return [];

    const benchSet = new Set((selectedStandingsTeam.benchPlayerIds || []).map(String));

    return (selectedStandingsTeam.picks || [])
      .map((pick) => {
        const playerId = String(pick.playerId || '');
        const playerNameKey = String(pick.playerName || '').trim().toLowerCase();
        const player = playersById.get(playerId) || playersByName.get(playerNameKey);
        return {
          playerId,
          resolvedPlayerId: String(player?._id || playerId),
          playerName: pick.playerName || player?.name || 'Unknown Player',
          photoUrl: player?.photoUrl || '',
          position: pick.position || player?.position || '—',
          team: pick.team || player?.team || '—',
          round: pick.round || null,
          draftName: pick.draftName || 'Draft',
          isBench: benchSet.has(playerId)
        };
      })
      .sort((a, b) => {
        if (a.isBench !== b.isBench) return Number(a.isBench) - Number(b.isBench);
        return Number(a.round || 999) - Number(b.round || 999);
      });
  }, [selectedStandingsTeam, playersById, playersByName]);

  const fetchTradeTeams = useCallback(async () => {
    if (!auth?.token) return;
    if (!selectedMyTeamGroupId) {
      setTradeTeams({ myTeam: { players: [] }, otherTeams: [] });
      return;
    }

    setTradeLoading(true);
    setTradeError('');
    try {
      const res = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/trades/teams?groupId=${encodeURIComponent(selectedMyTeamGroupId)}`, {
        headers: { Authorization: `Bearer ${auth.token}` }
      });
      if (!res.ok) throw new Error('Failed to load teams for trades');

      const data = await res.json();
      setTradeTeams({
        myTeam: data.myTeam || { players: [] },
        otherTeams: Array.isArray(data.otherTeams) ? data.otherTeams : []
      });
    } catch (err) {
      setTradeError(err.message || 'Failed to load teams for trades');
      setTradeTeams({ myTeam: { players: [] }, otherTeams: [] });
    } finally {
      setTradeLoading(false);
    }
  }, [auth?.token, selectedMyTeamGroupId]);

  const fetchInbox = useCallback(async () => {
    if (!auth?.token) return;

    setInboxLoading(true);
    setInboxError('');
    try {
      const query = selectedMyTeamGroupId ? `?groupId=${encodeURIComponent(selectedMyTeamGroupId)}` : '';
      const res = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/trades/inbox${query}`, {
        headers: { Authorization: `Bearer ${auth.token}` }
      });
      if (!res.ok) throw new Error('Failed to load inbox');
      const data = await res.json();
      setInboxData({
        incomingOffers: Array.isArray(data.incomingOffers) ? data.incomingOffers : [],
        sentPending: Array.isArray(data.sentPending) ? data.sentPending : [],
        sentUpdates: Array.isArray(data.sentUpdates) ? data.sentUpdates : []
      });
    } catch (err) {
      setInboxError(err.message || 'Failed to load inbox');
      setInboxData({ incomingOffers: [], sentPending: [], sentUpdates: [] });
    } finally {
      setInboxLoading(false);
    }
  }, [auth?.token, selectedMyTeamGroupId]);

  const markInboxAsRead = useCallback(async () => {
    if (!auth?.token) return;

    try {
      const query = selectedMyTeamGroupId ? `?groupId=${encodeURIComponent(selectedMyTeamGroupId)}` : '';
      const res = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/trades/inbox/read${query}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}` }
      });

      if (!res.ok) {
        throw new Error('Failed to mark inbox as read');
      }

      setInboxData((prev) => ({
        incomingOffers: (prev.incomingOffers || []).map((trade) => ({
          ...trade,
          recipientReadAt: trade.recipientReadAt || new Date().toISOString()
        })),
        sentPending: prev.sentPending || [],
        sentUpdates: (prev.sentUpdates || []).map((trade) => ({
          ...trade,
          senderUpdateReadAt: trade.senderUpdateReadAt || new Date().toISOString()
        }))
      }));
    } catch {
      // Ignore mark-as-read errors; inbox content remains available.
    }
  }, [auth?.token, selectedMyTeamGroupId]);

  const myTeamRoster = useMemo(() => buildRosterSlots(myTeam.picks, players, myTeam.benchPlayerIds), [myTeam.picks, players, myTeam.benchPlayerIds]);
  const isViewingOwnTeam = !myTeam.userId || myTeam.userId === auth?.userId;
  const normalizeRosterPosition = useCallback((playerOrPosition) => {
    return resolveRosterPosition(playerOrPosition);
  }, []);

  const hasOpenSlotForPosition = useCallback((playerOrPosition) => {
    const normalizedPosition = normalizeRosterPosition(playerOrPosition);
    if (!normalizedPosition) return false;

    const activeSlotTemplate = myTeamRoster.slots.filter((slot) => !slot.isBench);
    const currentPositions = (myTeam.picks || [])
      .map((pick) => {
        const playerId = String(pick?.playerId || '').trim();
        const livePlayer = playersById.get(playerId);
        return normalizeRosterPosition(livePlayer || pick?.position || '');
      })
      .filter(Boolean);

    const allPositions = [...currentPositions, normalizedPosition];
    if (allPositions.length > activeSlotTemplate.length) return false;

    const slotOptionsByPosition = allPositions.map((position) => {
      const options = [];
      for (let slotIdx = 0; slotIdx < activeSlotTemplate.length; slotIdx++) {
        if ((activeSlotTemplate[slotIdx].accepts || []).includes(position)) {
          options.push(slotIdx);
        }
      }
      return options;
    });

    const assignedPositionBySlot = new Array(activeSlotTemplate.length).fill(-1);

    const tryAssign = (positionIdx, seenSlots) => {
      for (const slotIdx of slotOptionsByPosition[positionIdx]) {
        if (seenSlots[slotIdx]) continue;
        seenSlots[slotIdx] = true;

        if (assignedPositionBySlot[slotIdx] === -1 || tryAssign(assignedPositionBySlot[slotIdx], seenSlots)) {
          assignedPositionBySlot[slotIdx] = positionIdx;
          return true;
        }
      }
      return false;
    };

    for (let positionIdx = 0; positionIdx < slotOptionsByPosition.length; positionIdx++) {
      if (slotOptionsByPosition[positionIdx].length === 0) return false;
      const seenSlots = new Array(activeSlotTemplate.length).fill(false);
      if (!tryAssign(positionIdx, seenSlots)) {
        return false;
      }
    }

    return true;
  }, [myTeam.picks, myTeamRoster.slots, normalizeRosterPosition, playersById]);

  const pendingBenchPlayer = useMemo(() => {
    if (!pendingSwapBenchPlayerId) return null;
    const pendingSlot = myTeamRoster.slots.find(
      (slot) => slot.isBench && slot.player?._id === pendingSwapBenchPlayerId
    );
    return pendingSlot?.player || null;
  }, [myTeamRoster, pendingSwapBenchPlayerId]);

  const myTeamPickIdSet = useMemo(() => {
    return new Set((myTeam.picks || []).map((pick) => String(pick?.playerId || '')));
  }, [myTeam.picks]);

  const groupPickedPlayerIdSet = useMemo(() => {
    return new Set((groupPickedPlayerIds || []).map((id) => String(id || '')));
  }, [groupPickedPlayerIds]);

  const getPickupButtonState = useCallback((player) => {
    const playerId = String(player?._id || '');
    const ownerName = groupPlayerOwnerById[playerId] || 'Another team';
    const isOnMyTeam = myTeamPickIdSet.has(playerId);
    const isPickedInGroup = groupPickedPlayerIdSet.has(playerId);
    const isPickupInProgress = pickupLoadingPlayerId === playerId;

    if (!selectedMyTeamGroupId) {
      return { disabled: true, label: 'Select Group', note: 'Choose a group to manage pickups.' };
    }

    if (isPickupInProgress) {
      return { disabled: true, label: 'Picking Up...', note: '' };
    }

    if (isOnMyTeam) {
      return { disabled: true, label: 'On My Team', note: '' };
    }

    if (isPickedInGroup) {
      return { disabled: true, label: 'Unavailable', note: `Owned by ${ownerName}` };
    }

    if (!canPickupInCurrentGroup) {
      return { disabled: true, label: 'Locked', note: 'Pickups unlock after draft time.' };
    }

    if (!hasOpenSlotForPosition(player)) {
      return { disabled: true, label: 'Roster Full', note: 'Drop a player to open a slot.' };
    }

    return { disabled: false, label: 'Pick Up', note: '' };
  }, [
    canPickupInCurrentGroup,
    groupPickedPlayerIdSet,
    groupPlayerOwnerById,
    hasOpenSlotForPosition,
    myTeamPickIdSet,
    pickupLoadingPlayerId,
    selectedMyTeamGroupId
  ]);

  const selectedTradePartner = useMemo(() => {
    return tradeTeams.otherTeams.find((team) => team.userId === selectedTradePartnerId) || null;
  }, [tradeTeams, selectedTradePartnerId]);

  const selectedOfferedPlayer = useMemo(() => {
    return (tradeTeams.myTeam?.players || []).filter((player) => offeredPlayerIds.includes(player.playerId));
  }, [tradeTeams, offeredPlayerIds]);

  const selectedRequestedPlayer = useMemo(() => {
    return (selectedTradePartner?.players || []).filter((player) => requestedPlayerIds.includes(player.playerId));
  }, [selectedTradePartner, requestedPlayerIds]);

  const getTradeGrade = (delta) => {
    if (!Number.isFinite(delta)) return 'N/A';
    if (delta >= 40) return 'A+';
    if (delta >= 30) return 'A';
    if (delta >= 22) return 'A-';
    if (delta >= 16) return 'B+';
    if (delta >= 10) return 'B';
    if (delta >= 5) return 'C+';
    if (delta >= 2) return 'C-';
    if (delta >= -1) return 'C';
    if (delta >= -6) return 'D';
    return 'F';
  };

  const getTradeSynopsis = (trade, offeredPoints, requestedPoints, grade, delta) => {
    if (!Number.isFinite(offeredPoints) || !Number.isFinite(requestedPoints)) {
      return 'Unable to score this offer yet because one or both players are missing point data.';
    }

    if (delta >= 8) {
      return `Strong value for you. You receive ${trade.offeredPlayerName} (${offeredPoints}) for ${trade.requestedPlayerName} (${requestedPoints}), net +${delta}.`;
    }
    if (delta >= 2) {
      return `Slightly favorable for you. You gain about ${delta} points in this swap.`;
    }
    if (delta >= -1) {
      return `Close to even. This is roughly balanced by current fantasy-point value.`;
    }
    if (delta >= -6) {
      return `Leans against you. You would give up about ${Math.abs(delta)} points of value.`;
    }
    return `Heavily favors the other team. You give up significantly more value in this deal.`;
  };

  const inboxUnreadCount = useMemo(() => {
    const unreadIncoming = (inboxData.incomingOffers || []).filter((trade) => !trade.recipientReadAt).length;
    const unreadUpdates = (inboxData.sentUpdates || []).filter((trade) => !trade.senderUpdateReadAt).length;
    return unreadIncoming + unreadUpdates;
  }, [inboxData]);

  useEffect(() => {
    if ((activeTab !== 'trades' && !inboxOpen) || !Array.isArray(inboxData.incomingOffers) || inboxData.incomingOffers.length === 0) {
      return;
    }

    let cancelled = false;

    const evaluateIncomingTrades = async () => {
      const pendingTargets = new Map();
      const fetchedPoints = {};

      const resolveTradePlayerPoints = (playerId, season, player) => {
        const cacheKey = `${playerId}-${season}`;
        const cached = fantasyPointsCache[cacheKey];
        if (typeof cached === 'number' && Number.isFinite(cached)) return cached;

        if (cached === undefined) {
          pendingTargets.set(cacheKey, { playerId, season, cacheKey });
        }

        return null;
      };

      const baseEvaluations = {};

      const getTradePlayers = (trade, kind) => {
        const key = kind === 'offered' ? 'offeredPlayers' : 'requestedPlayers';
        const fallbackIdKey = kind === 'offered' ? 'offeredPlayerId' : 'requestedPlayerId';
        const fallbackNameKey = kind === 'offered' ? 'offeredPlayerName' : 'requestedPlayerName';

        if (Array.isArray(trade?.[key]) && trade[key].length > 0) {
          return trade[key]
            .map((p) => ({ playerId: String(p?.playerId || '').trim(), playerName: p?.playerName || '' }))
            .filter((p) => p.playerId);
        }

        const fallbackId = String(trade?.[fallbackIdKey] || '').trim();
        if (!fallbackId) return [];
        return [{ playerId: fallbackId, playerName: trade?.[fallbackNameKey] || '' }];
      };

      for (const trade of inboxData.incomingOffers) {
        const offeredTradePlayers = getTradePlayers(trade, 'offered');
        const requestedTradePlayers = getTradePlayers(trade, 'requested');

        if (offeredTradePlayers.length === 0 || requestedTradePlayers.length === 0) {
          baseEvaluations[trade._id] = {
            grade: 'N/A',
            synopsis: 'Unable to evaluate yet because one or both players are not available in current player data.'
          };
          continue;
        }

        let offeredPointsTotal = 0;
        let requestedPointsTotal = 0;
        let hasMissingData = false;

        for (const p of offeredTradePlayers) {
          const player = playersById.get(String(p.playerId || ''));
          if (!player) {
            hasMissingData = true;
            continue;
          }
          const season = getLatestSeasonForPlayer(player);
          const points = resolveTradePlayerPoints(String(p.playerId), season, player);
          if (!Number.isFinite(points)) {
            hasMissingData = true;
          } else {
            offeredPointsTotal += points;
          }
        }

        for (const p of requestedTradePlayers) {
          const player = playersById.get(String(p.playerId || ''));
          if (!player) {
            hasMissingData = true;
            continue;
          }
          const season = getLatestSeasonForPlayer(player);
          const points = resolveTradePlayerPoints(String(p.playerId), season, player);
          if (!Number.isFinite(points)) {
            hasMissingData = true;
          } else {
            requestedPointsTotal += points;
          }
        }

        if (!hasMissingData) {
          const delta = offeredPointsTotal - requestedPointsTotal;
          const grade = getTradeGrade(delta);
          baseEvaluations[trade._id] = {
            grade,
            synopsis: getTradeSynopsis(trade, offeredPointsTotal, requestedPointsTotal, grade, delta)
          };
        }
      }

      if (pendingTargets.size > 0) {
        await Promise.all([...pendingTargets.values()].map(async (target) => {
          try {
            const res = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/players/${target.playerId}/fantasy-points?season=${target.season}`);
            if (!res.ok) throw new Error('failed');
            const data = await res.json();
            const points = Number(data?.totals?.fantasyPoints);
            fetchedPoints[target.cacheKey] = Number.isFinite(points) ? points : 0;
          } catch {
            fetchedPoints[target.cacheKey] = null;
          }
        }));

        if (!cancelled) {
          setFantasyPointsCache((prev) => ({ ...prev, ...fetchedPoints }));
        }
      }

      const finalEvaluations = { ...baseEvaluations };

      for (const trade of inboxData.incomingOffers) {
        if (finalEvaluations[trade._id]) continue;

        const offeredTradePlayers = Array.isArray(trade?.offeredPlayers) && trade.offeredPlayers.length > 0
          ? trade.offeredPlayers
          : [{ playerId: trade.offeredPlayerId }];
        const requestedTradePlayers = Array.isArray(trade?.requestedPlayers) && trade.requestedPlayers.length > 0
          ? trade.requestedPlayers
          : [{ playerId: trade.requestedPlayerId }];

        let offeredNumeric = 0;
        let requestedNumeric = 0;
        let missing = false;

        for (const p of offeredTradePlayers) {
          const player = playersById.get(String(p.playerId || ''));
          if (!player) {
            missing = true;
            continue;
          }
          const season = getLatestSeasonForPlayer(player);
          const cacheKey = `${p.playerId}-${season}`;
          const points = fetchedPoints?.[cacheKey] ?? fantasyPointsCache[cacheKey];
          if (!Number.isFinite(Number(points))) {
            missing = true;
          } else {
            offeredNumeric += Number(points);
          }
        }

        for (const p of requestedTradePlayers) {
          const player = playersById.get(String(p.playerId || ''));
          if (!player) {
            missing = true;
            continue;
          }
          const season = getLatestSeasonForPlayer(player);
          const cacheKey = `${p.playerId}-${season}`;
          const points = fetchedPoints?.[cacheKey] ?? fantasyPointsCache[cacheKey];
          if (!Number.isFinite(Number(points))) {
            missing = true;
          } else {
            requestedNumeric += Number(points);
          }
        }

        if (missing) {
          finalEvaluations[trade._id] = {
            grade: 'N/A',
            synopsis: 'Unable to score this offer yet because one or both players are missing point data.'
          };
          continue;
        }

        const delta = offeredNumeric - requestedNumeric;
        const grade = getTradeGrade(delta);
        finalEvaluations[trade._id] = {
          grade,
          synopsis: getTradeSynopsis(trade, offeredNumeric, requestedNumeric, grade, delta)
        };
      }

      if (!cancelled) {
        setTradeEvaluationCache((prev) => ({ ...prev, ...finalEvaluations }));
      }
    };

    evaluateIncomingTrades();

    return () => {
      cancelled = true;
    };
  }, [activeTab, inboxOpen, inboxData.incomingOffers, playersById, fantasyPointsCache]);

  const myTeamScoringTargets = useMemo(() => {
    return myTeamRoster.slots
      .filter((slot) => slot.player?._id && !slot.isBench)
      .map((slot) => {
        const season = getLatestSeasonForPlayer(slot.player);
        return {
          playerId: slot.player._id,
          season,
          cacheKey: `${slot.player._id}-${season}`
        };
      });
  }, [myTeamRoster]);

  const myTeamWeeklyScoringTargets = useMemo(() => {
    return myTeamRoster.slots
      .filter((slot) => slot.player?._id && !slot.isBench)
      .map((slot) => {
        const season = getLatestSeasonForPlayer(slot.player);
        return {
          playerId: slot.player._id,
          season,
          startDate: currentWeekWindow.startDate,
          endDate: currentWeekWindow.endDate,
          cacheKey: `${slot.player._id}-${season}-${currentWeekWindow.startDate}-${currentWeekWindow.endDate}`
        };
      });
  }, [myTeamRoster, currentWeekWindow.startDate, currentWeekWindow.endDate]);

  const standingsTeamScoringTargets = useMemo(() => {
    if (activeTab !== 'standings' || !selectedStandingsTeam) return [];

    return selectedStandingsTeamPlayers
      .map((player) => {
        if (!player?.playerId) return null;
        const fullPlayer = playersById.get(String(player.playerId));
        if (!fullPlayer) return null;

        const season = getLatestSeasonForPlayer(fullPlayer);
        return {
          playerId: String(player.playerId),
          season,
          cacheKey: `${player.playerId}-${season}`
        };
      })
      .filter(Boolean);
  }, [activeTab, selectedStandingsTeam, selectedStandingsTeamPlayers, playersById]);

  const standingsAllScoringTargets = useMemo(() => {
    if (activeTab !== 'standings') return [];

    const seen = new Set();
    const targets = [];

    for (const team of standingsTeams || []) {
      for (const pick of team?.picks || []) {
        const pickPlayerId = String(pick?.playerId || '').trim();
        const pickPlayerNameKey = String(pick?.playerName || '').trim().toLowerCase();
        const fullPlayer = playersById.get(pickPlayerId) || playersByName.get(pickPlayerNameKey);
        const resolvedPlayerId = String(fullPlayer?._id || pickPlayerId || '').trim();
        if (!resolvedPlayerId) continue;

        const season = fullPlayer ? getLatestSeasonForPlayer(fullPlayer) : 2026;
        const cacheKey = `${resolvedPlayerId}-${season}`;
        if (seen.has(cacheKey)) continue;

        seen.add(cacheKey);
        targets.push({
          playerId: resolvedPlayerId,
          season,
          cacheKey
        });
      }
    }

    return targets;
  }, [activeTab, standingsTeams, playersById, playersByName]);

  const standingsComputedTotalsByTeamKey = useMemo(() => {
    const totalsByTeam = new Map();

    for (const team of standingsTeams || []) {
      let total = 0;
      let hasPending = false;

      for (const pick of team?.picks || []) {
        const pickPlayerId = String(pick?.playerId || '').trim();
        const pickPlayerNameKey = String(pick?.playerName || '').trim().toLowerCase();
        const fullPlayer = playersById.get(pickPlayerId) || playersByName.get(pickPlayerNameKey);
        const resolvedPlayerId = String(fullPlayer?._id || pickPlayerId || '').trim();
        if (!resolvedPlayerId) continue;

        const season = fullPlayer ? getLatestSeasonForPlayer(fullPlayer) : 2026;
        const cacheKey = `${resolvedPlayerId}-${season}`;
        const points = fantasyPointsCache[cacheKey];

        if (points === undefined) {
          hasPending = true;
          continue;
        }

        if (typeof points === 'number' && Number.isFinite(points)) {
          total += points;
        }
      }

      totalsByTeam.set(getStandingsTeamSelectionKey(team), { total, hasPending });
    }

    return totalsByTeam;
  }, [standingsTeams, playersById, playersByName, fantasyPointsCache, getStandingsTeamSelectionKey]);

  const sortedStandings = useMemo(() => {
    return [...(standings || [])].sort((teamA, teamB) => {
      const matchedOverviewTeamA = getOverviewTeamForStandingsRow(teamA);
      const keyA = matchedOverviewTeamA
        ? getStandingsTeamSelectionKey(matchedOverviewTeamA)
        : getStandingsTeamSelectionKey(teamA);
      const computedA = standingsComputedTotalsByTeamKey.get(keyA);
      const totalA = computedA ? computedA.total : Number(teamA?.totalPoints || 0);

      const matchedOverviewTeamB = getOverviewTeamForStandingsRow(teamB);
      const keyB = matchedOverviewTeamB
        ? getStandingsTeamSelectionKey(matchedOverviewTeamB)
        : getStandingsTeamSelectionKey(teamB);
      const computedB = standingsComputedTotalsByTeamKey.get(keyB);
      const totalB = computedB ? computedB.total : Number(teamB?.totalPoints || 0);

      if (totalB !== totalA) return totalB - totalA;

      const fallbackRankA = Number(teamA?.rank || 999);
      const fallbackRankB = Number(teamB?.rank || 999);
      if (fallbackRankA !== fallbackRankB) return fallbackRankA - fallbackRankB;

      return String(teamA?.teamName || '').localeCompare(String(teamB?.teamName || ''));
    });
  }, [standings, standingsComputedTotalsByTeamKey, getOverviewTeamForStandingsRow, getStandingsTeamSelectionKey]);

  const playersTabScoringTargets = useMemo(() => {
    return players
      .filter((player) => player?._id)
      .map((player) => ({
        playerId: player._id,
        season: 2026,
        cacheKey: `${player._id}-2026`
      }));
  }, [players]);

  const myTeamTotalPoints = useMemo(() => {
    let total = 0;
    let hasPending = false;

    for (const slot of myTeamRoster.slots) {
      if (slot.isBench) continue; // bench players don't count toward team total
      if (!slot.player?._id) continue;

      const season = getLatestSeasonForPlayer(slot.player);
      const cacheKey = `${slot.player._id}-${season}`;
      const points = fantasyPointsCache[cacheKey];

      if (points === undefined) {
        hasPending = true;
        continue;
      }

      if (typeof points === 'number' && Number.isFinite(points)) {
        total += points;
      }
    }

    return { total, hasPending };
  }, [myTeamRoster, fantasyPointsCache]);

  const myTeamWeeklyPoints = useMemo(() => {
    let total = 0;
    let hasPending = false;

    for (const target of myTeamWeeklyScoringTargets) {
      const points = weeklyFantasyPointsCache[target.cacheKey];

      if (points === undefined) {
        hasPending = true;
        continue;
      }

      if (typeof points === 'number' && Number.isFinite(points)) {
        total += points;
      }
    }

    return { total, hasPending };
  }, [myTeamWeeklyScoringTargets, weeklyFantasyPointsCache]);

  useEffect(() => {
    if (activeTab !== 'my-team') return;
    if (myTeamScoringTargets.length === 0) return;

    let cancelled = false;

    const fetchFantasyPoints = async () => {
      const pendingTargets = myTeamScoringTargets.filter((target) => fantasyPointsCache[target.cacheKey] === undefined);
      if (pendingTargets.length === 0) return;

      await Promise.all(pendingTargets.map(async (target) => {
        try {
          const res = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/players/${target.playerId}/fantasy-points?season=${target.season}`);
          if (!res.ok) throw new Error('failed');

          const data = await res.json();
          const points = Number(data?.totals?.fantasyPoints);
          if (!cancelled) {
            setFantasyPointsCache((prev) => ({
              ...prev,
              [target.cacheKey]: Number.isFinite(points) ? points : 0
            }));
          }
        } catch {
          if (!cancelled) {
            setFantasyPointsCache((prev) => ({
              ...prev,
              [target.cacheKey]: null
            }));
          }
        }
      }));
    };

    fetchFantasyPoints();

    return () => {
      cancelled = true;
    };
  }, [activeTab, myTeamScoringTargets, fantasyPointsCache]);

  useEffect(() => {
    if (activeTab !== 'my-team') return;
    if (myTeamWeeklyScoringTargets.length === 0) return;

    let cancelled = false;

    const fetchWeeklyFantasyPoints = async () => {
      const pendingTargets = myTeamWeeklyScoringTargets.filter((target) => weeklyFantasyPointsCache[target.cacheKey] === undefined);
      if (pendingTargets.length === 0) return;

      await Promise.all(pendingTargets.map(async (target) => {
        try {
          const res = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/players/${target.playerId}/fantasy-points?season=${target.season}&startDate=${target.startDate}&endDate=${target.endDate}`);
          if (!res.ok) throw new Error('failed');

          const data = await res.json();
          const points = Number(data?.totals?.fantasyPoints);
          if (!cancelled) {
            setWeeklyFantasyPointsCache((prev) => ({
              ...prev,
              [target.cacheKey]: Number.isFinite(points) ? points : 0
            }));
          }
        } catch {
          if (!cancelled) {
            setWeeklyFantasyPointsCache((prev) => ({
              ...prev,
              [target.cacheKey]: null
            }));
          }
        }
      }));
    };

    fetchWeeklyFantasyPoints();

    return () => {
      cancelled = true;
    };
  }, [activeTab, myTeamWeeklyScoringTargets, weeklyFantasyPointsCache]);

  useEffect(() => {
    if (activeTab !== 'standings') return;
    if (standingsTeamScoringTargets.length === 0) return;

    let cancelled = false;

    const fetchFantasyPoints = async () => {
      const pendingTargets = standingsTeamScoringTargets.filter((target) => fantasyPointsCache[target.cacheKey] === undefined);
      if (pendingTargets.length === 0) return;

      await Promise.all(pendingTargets.map(async (target) => {
        try {
          const res = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/players/${target.playerId}/fantasy-points?season=${target.season}`);
          if (!res.ok) throw new Error('failed');

          const data = await res.json();
          const points = Number(data?.totals?.fantasyPoints);
          if (!cancelled) {
            setFantasyPointsCache((prev) => ({
              ...prev,
              [target.cacheKey]: Number.isFinite(points) ? points : 0
            }));
          }
        } catch {
          if (!cancelled) {
            setFantasyPointsCache((prev) => ({
              ...prev,
              [target.cacheKey]: null
            }));
          }
        }
      }));
    };

    fetchFantasyPoints();

    return () => {
      cancelled = true;
    };
  }, [activeTab, standingsTeamScoringTargets, fantasyPointsCache]);

  useEffect(() => {
    if (activeTab !== 'standings') return;
    if (standingsAllScoringTargets.length === 0) return;

    let cancelled = false;

    const fetchFantasyPoints = async () => {
      const pendingTargets = standingsAllScoringTargets.filter((target) => fantasyPointsCache[target.cacheKey] === undefined);
      if (pendingTargets.length === 0) return;

      await Promise.all(pendingTargets.map(async (target) => {
        try {
          const res = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/players/${target.playerId}/fantasy-points?season=${target.season}`);
          if (!res.ok) throw new Error('failed');

          const data = await res.json();
          const points = Number(data?.totals?.fantasyPoints);
          if (!cancelled) {
            setFantasyPointsCache((prev) => ({
              ...prev,
              [target.cacheKey]: Number.isFinite(points) ? points : 0
            }));
          }
        } catch {
          if (!cancelled) {
            setFantasyPointsCache((prev) => ({
              ...prev,
              [target.cacheKey]: null
            }));
          }
        }
      }));
    };

    fetchFantasyPoints();

    return () => {
      cancelled = true;
    };
  }, [activeTab, standingsAllScoringTargets, fantasyPointsCache]);

  useEffect(() => {
    // Only run when Players tab is active and there are players
    if (activeTab !== 'players' || players.length === 0) return;

    let cancelled = false;

    const fetchBatchFantasyPoints = async () => {
      try {
        const res = await fetch('https://fantasy-baseball-o8ta.onrender.com/api/players/fantasy-points/batch?season=2026');
        if (!res.ok) throw new Error('Failed to fetch batch fantasy points');
        const data = await res.json();
        // data is an array of { playerId, totals: { fantasyPoints } }
        const batchCache = {};
        for (const entry of data) {
          if (!entry?.playerId) continue;
          const cacheKey = `${entry.playerId}-2026`;
          const points = Number(entry?.totals?.fantasyPoints);
          batchCache[cacheKey] = Number.isFinite(points) ? points : 0;
        }
        if (!cancelled) {
          setFantasyPointsCache((prev) => ({ ...prev, ...batchCache }));
        }
      } catch (err) {
        // fallback: do nothing, let per-player fetches handle it
      }
    };

    fetchBatchFantasyPoints();

    return () => {
      cancelled = true;
    };
  }, [activeTab, players]);

  // Dedicated effect to fill in missing points after batch
  useEffect(() => {
    if (activeTab !== 'players' || players.length === 0) return;
    // Fetch missing points for both current and prior season columns.
    players.forEach((player) => {
      if (!player?._id) return;
      const seasonsToLoad = [2025, 2026];
      seasonsToLoad.forEach((season) => {
        const cacheKey = `${player._id}-${season}`;
        const points = fantasyPointsCache[cacheKey];
        if (points === undefined || points === null || isNaN(points)) {
          fetchFantasyPointsForSeason(player._id, season);
        }
      });
    });
  }, [activeTab, players, fantasyPointsCache, fetchFantasyPointsForSeason]);

  useEffect(() => {
    if (activeTab !== 'players' || players.length === 0) return;

    let cancelled = false;

    const fetchBatchFantasyPoints2025 = async () => {
      try {
        const res = await fetch('https://fantasy-baseball-o8ta.onrender.com/api/players/fantasy-points/batch?season=2025');
        if (!res.ok) throw new Error('Failed to fetch batch fantasy points');
        const data = await res.json();
        const batchCache = {};
        for (const entry of data) {
          if (!entry?.playerId) continue;
          const cacheKey = `${entry.playerId}-2025`;
          const points = Number(entry?.totals?.fantasyPoints);
          batchCache[cacheKey] = Number.isFinite(points) ? points : 0;
        }
        if (!cancelled) {
          setFantasyPointsCache((prev) => ({ ...prev, ...batchCache }));
        }
      } catch (err) {
        // fallback: do nothing, let per-player fetches handle it
      }
    };

    fetchBatchFantasyPoints2025();

    return () => {
      cancelled = true;
    };
  }, [activeTab, players]);

  useEffect(() => {
    if (activeTab === 'standings' && selectedMyTeamGroupId) {
      fetchStandings();
      fetchStandingsTeams();
    }
  }, [activeTab, fetchStandings, fetchStandingsTeams, selectedMyTeamGroupId]);

  useEffect(() => {
    if (!auth?.token) return;
    fetchMyTeamGroups();
  }, [auth?.token, activeTab, fetchMyTeamGroups]);

  useEffect(() => {
    if (activeTab !== 'my-team') return;
    if (!selectedMyTeamGroupId) {
      setMyTeam({ userId: '', userName: '', picks: [], groupId: '', benchPlayerIds: [], dropsUsed: 0, dropsRemaining: 1 });
      return;
    }

    fetchGroupTeamsForMyTeam(selectedMyTeamGroupId);
  }, [activeTab, selectedMyTeamGroupId, fetchGroupTeamsForMyTeam]);

  useEffect(() => {
    if (activeTab !== 'players') return;

    if (!selectedMyTeamGroupId) {
      setGroupPickedPlayerIds([]);
      setGroupPlayerOwnerById({});
      return;
    }

    fetchGroupTeamsForMyTeam(selectedMyTeamGroupId);
  }, [activeTab, selectedMyTeamGroupId, fetchGroupTeamsForMyTeam]);

  useEffect(() => {
    if (activeTab === 'trades' && selectedMyTeamGroupId) {
      fetchTradeTeams();
      fetchInbox();
    }
  }, [activeTab, fetchTradeTeams, fetchInbox, selectedMyTeamGroupId]);

  useEffect(() => {
    setTeamNameInput(String(myTeam?.userName || auth?.username || ''));
  }, [myTeam?.userName, auth?.username, selectedMyTeamGroupId]);

  useEffect(() => {
    if (auth?.token && selectedMyTeamGroupId) {
      fetchInbox();
    }
  }, [auth?.token, fetchInbox, selectedMyTeamGroupId]);

  // Refresh all group-dependent data when group selection changes
  useEffect(() => {
    if (!auth?.token) return;
    if (!selectedMyTeamGroupId) return;

    const refreshGroupData = async () => {
      try {
        // Refresh all tab data for the selected group
        await Promise.all([
          fetchGroupTeamsForMyTeam(selectedMyTeamGroupId), // my-team and players tabs
          fetchStandings(),                                 // standings tab
          fetchStandingsTeams(),                            // standings tab
          fetchTradeTeams(),                                // trades tab
          fetchInbox()                                      // trades tab
        ]);
        console.log('[DEBUG] Group changed: refreshed all data for group', selectedMyTeamGroupId);
      } catch (err) {
        console.error('[DEBUG] Error refreshing group data:', err);
      }
    };

    refreshGroupData();
  }, [selectedMyTeamGroupId, auth?.token, fetchGroupTeamsForMyTeam, fetchStandings, fetchStandingsTeams, fetchTradeTeams, fetchInbox]);

  useEffect(() => {
    setSelectedTradePartnerId('');
    setOfferedPlayerIds([]);
    setRequestedPlayerIds([]);
    setTradeSubmitMessage('');
    setSelectedStandingsTeamKey('');
  }, [selectedMyTeamGroupId]);

  const handleCreateTradeOffer = async () => {
    if (!auth?.token) return;
    if (!selectedTradePartnerId || offeredPlayerIds.length === 0 || requestedPlayerIds.length === 0) {
      setTradeSubmitMessage('Select a trade partner and at least one player on both sides before sending an offer.');
      return;
    }
    if (offeredPlayerIds.length !== requestedPlayerIds.length) {
      setTradeSubmitMessage('Please select the same number of offered and requested players.');
      return;
    }
    if (!selectedMyTeamGroupId) {
      setTradeSubmitMessage('Select a group before sending a trade offer.');
      return;
    }

    setTradeSubmitMessage('Sending trade offer...');
    try {
      const res = await fetch('https://fantasy-baseball-o8ta.onrender.com/api/trades/offers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify({
          groupId: selectedMyTeamGroupId,
          toUserId: selectedTradePartnerId,
          offeredPlayerIds,
          requestedPlayerIds,
          message: tradeMessage
        })
      });

      const data = await res.json();
      fetchTradeTeams();
      if (!res.ok) {
        throw new Error(data?.message || 'Failed to send trade offer');
      }

      setTradeSubmitMessage('Trade offer sent.');
      setOfferedPlayerIds([]);
      setRequestedPlayerIds([]);
      setTradeMessage('');
      fetchInbox();
    } catch (err) {
      setTradeSubmitMessage(err.message || 'Failed to send trade offer');
    }
  };

  const handleRespondToTrade = async (tradeId, action) => {
    if (!auth?.token) return;

    try {
      const res = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/trades/${tradeId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify({ action })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || `Failed to ${action} trade`);
      }

      fetchInbox();
      fetchTradeTeams();
      if (selectedMyTeamGroupId) {
        fetchGroupTeamsForMyTeam(selectedMyTeamGroupId);
      }
    } catch (err) {
      setInboxError(err.message || `Failed to ${action} trade`);
    }
  };

  // Refresh all data when user logs in
  useEffect(() => {
    if (!auth?.token) return;

    const refreshAllData = async () => {
      try {
        // Clear stale fantasy points cache from previous user
        setFantasyPointsCache({});

        // Fetch fresh players list from backend
        const playersRes = await fetch('https://fantasy-baseball-o8ta.onrender.com/api/players');
        if (playersRes.ok) {
          const playersData = await playersRes.json();
          if (Array.isArray(playersData)) {
            setPlayers(playersData);
            setError(null);
          }
        }

        // Fetch user's groups and teams
        await fetchMyTeamGroups();

        // Fetch user's team
        await fetchMyTeam();

        console.log('[DEBUG] Login refresh complete: players, groups, and teams updated');
      } catch (err) {
        console.error('[DEBUG] Error during login refresh:', err);
      }
    };

    refreshAllData();
  }, [auth?.token]);

  useEffect(() => {
    // First, check if backend is running
    const checkBackend = async () => {
      try {
        console.log('[DEBUG] Checking backend health...');
        const healthResponse = await fetch('https://fantasy-baseball-o8ta.onrender.com/api/health');
        console.log('[DEBUG] Health check response:', healthResponse);
        
        if (healthResponse.ok) {
          const healthData = await healthResponse.json();
          console.log('[DEBUG] Backend is alive:', healthData);
          setBackendStatus('✓ Backend running');
        } else {
          console.error('[DEBUG] Backend returned status:', healthResponse.status);
          setBackendStatus('✗ Backend error: ' + healthResponse.status);
        }
      } catch (err) {
        console.error('[DEBUG] Backend health check failed:', err.message);
        setBackendStatus('✗ Cannot connect to backend');
      }
    };

    checkBackend();

    // Then fetch players
    const fetchPlayers = async () => {
      try {
        console.log('[DEBUG] Fetching players from https://fantasy-baseball-o8ta.onrender.com/api/players');
        setLoading(true);
        
        const response = await fetch('https://fantasy-baseball-o8ta.onrender.com/api/players');
        console.log('[DEBUG] Fetch response status:', response.status);
        console.log('[DEBUG] Fetch response ok:', response.ok);
        console.log('[DEBUG] Response type:', response.type);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('[DEBUG] Error response body:', errorText);
          throw new Error(`Failed to fetch players: ${response.status} ${response.statusText}`);
        }
        
        console.log('[DEBUG] Attempting to parse JSON...');
        const data = await response.json();
        console.log('[DEBUG] Successfully parsed JSON');
        console.log('[DEBUG] Fetched players:', data);
        console.log('[DEBUG] Number of players:', Array.isArray(data) ? data.length : 'Not an array');
        
        if (!Array.isArray(data)) {
          console.error('[DEBUG] Data is not an array:', typeof data);
          throw new Error('Invalid data format: expected array of players');
        }
        
        setPlayers(data);
        setError(null);
      } catch (err) {
        console.error('[DEBUG] Fetch error:', err);
        console.error('[DEBUG] Error stack:', err.stack);
        setError(err.message);
        setPlayers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPlayers();
  }, []);

  if (!auth) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="App">
      <div className="site-topbar">
        <header className="App-header">
          <div className="header-top header-top-custom">
            <div className="header-title-left">
              <div className="header-title-block">
                <span className="header-kicker">League HQ</span>
                <h1>Fantasy Baseball</h1>
              </div>
            </div>
            <div className="header-logo-center">
              <img src="/app-logo.png" alt="App Logo" className="app-logo app-logo-large" />
            </div>
            <div className="header-user">
              <span className="header-user-name">
                <img src="/profiel-icon.png.webp" alt="Profile" className="header-user-avatar" />
                <span>{auth.username}</span>
              </span>
              <button
                className="inbox-btn"
                onClick={async () => {
                  setInboxOpen(true);
                  await fetchInbox();
                  await markInboxAsRead();
                }}
              >
                Inbox / Messages
                {inboxUnreadCount > 0 && <span className="inbox-badge" aria-label="Unread inbox notifications" />}
              </button>
              <button className="logout-btn" onClick={handleLogout}>Sign Out</button>
            </div>
          </div>
          <div className="backend-status-pill">
            {backendStatus}
          </div>
        </header>

        <nav className="tabs-navigation">
          <div className="center-tabs">
            <button 
              className={`tab tab-players ${activeTab === 'players' ? 'active' : ''}`}
              onClick={() => setActiveTab('players')}
            >
              Players
            </button>
            <button
              className={`tab tab-groups ${activeTab === 'group' ? 'active' : ''}`}
              onClick={() => setActiveTab('group')}
            >
              My Groups
            </button>
            <button 
              className={`tab tab-myteam ${activeTab === 'my-team' ? 'active' : ''}`}
              onClick={() => { setActiveTab('my-team'); fetchMyTeam(); }}
            >
              My Team
            </button>
            <button 
              className={`tab tab-standings ${activeTab === 'standings' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('standings');
                if (selectedMyTeamGroupId) {
                  fetchStandings();
                  fetchStandingsTeams();
                }
              }}
            >
              Standings
            </button>
          </div>
        </nav>
      </div>

      <main className="App-main">
        {/* Group Tab */}
        {activeTab === 'group' && <Draft players={players} auth={auth} onTeamUpdated={(team) => { setMyTeam(team); }} />}

        {/* Players Tab */}
        {activeTab === 'players' && (
          <div className="tab-content players-broadcast-view">
            <div className="tab-section-header players-tab-header">
              <h2 className="players-tab-title">Players</h2>
              <label className="tab-group-filter">
                <span>Group</span>
                <select
                  value={selectedMyTeamGroupId}
                  onChange={(e) => setSelectedMyTeamGroupId(e.target.value)}
                  disabled={myTeamGroupsLoading || myTeamGroups.length === 0}
                >
                  {myTeamGroups.length === 0 ? (
                    <option value="">No groups</option>
                  ) : (
                    myTeamGroups.map((group) => (
                      <option value={group._id} key={group._id}>{group.name}</option>
                    ))
                  )}
                </select>
              </label>
            </div>
            {loading && <p className="loading">Loading players...</p>}
            {error && (
              <div className="error">
                <p><strong>Error:</strong> {error}</p>
                <p style={{ fontSize: '0.9em', marginTop: '10px' }}>Check browser console (F12) for more details</p>
              </div>
            )}
            {!loading && !error && players.length === 0 && (
              <p className="no-players">No players found.</p>
            )}
            {!loading && !error && players.length > 0 && (
              <div className="players-columns">
                <div className="player-column">
                  <h3>Players</h3>
                  <div className="player-column-controls">
                    <div className="search-container">
                      <input
                        type="text"
                        placeholder="🔍 Search players..."
                        value={playerSearch}
                        onChange={(e) => setPlayerSearch(e.target.value)}
                        className="search-input"
                      />
                      {playerSearch && (
                        <button
                          className="search-clear"
                          onClick={() => setPlayerSearch('')}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div className="player-filter-stack">
                      <button
                        type="button"
                        className="player-filter-reset"
                        disabled={!playerSearch && playerPositionFilter === 'ALL'}
                        onClick={() => {
                          setPlayerSearch('');
                          setPlayerPositionFilter('ALL');
                        }}
                      >
                        Clear Filters
                      </button>
                      <select
                        className="player-filter-select"
                        value={playerPositionFilter}
                        onChange={(e) => setPlayerPositionFilter(e.target.value)}
                      >
                        <option value="ALL">All Positions</option>
                        {positionPlayerOptions.map((position) => (
                          <option value={position} key={position}>{position}</option>
                        ))}
                        <option value="P">P</option>
                        <option value="SP">SP</option>
                        <option value="RP">RP</option>
                      </select>
                    </div>
                  </div>

                  <div className="players-mobile-sort" role="group" aria-label="Sort players by fantasy points season">
                    <span>Sort By</span>
                    <button
                      type="button"
                      className={`players-mobile-sort-btn ${playersSortSeason === '2025' ? 'active' : ''}`}
                      onClick={() => setPlayersSortSeason('2025')}
                    >
                      2025 FP
                    </button>
                    <button
                      type="button"
                      className={`players-mobile-sort-btn ${playersSortSeason === '2026' ? 'active' : ''}`}
                      onClick={() => setPlayersSortSeason('2026')}
                    >
                      2026 FP
                    </button>
                  </div>

                  <div className="players-list-scroll">
                    {filteredAllPlayers.length === 0 ? (
                      <p className="no-players">No players match your filters.</p>
                    ) : (
                      <>
                        <div className="players-mobile-list">
                          {filteredAllPlayers.map((player) => {
                            const points2025 = fantasyPointsCache[`${player._id}-2025`];
                            const points2026 = fantasyPointsCache[`${player._id}-2026`];
                            const pickupState = getPickupButtonState(player);
                            const playerId = String(player?._id || '');
                            const isDraftedByOtherTeam = !!selectedMyTeamGroupId
                              && groupPickedPlayerIdSet.has(playerId)
                              && !myTeamPickIdSet.has(playerId);

                            return (
                              <article
                                key={player._id}
                                className={`player-mobile-card clickable-row ${isDraftedByOtherTeam ? 'player-unavailable' : ''}`}
                                onClick={() => setSelectedPlayer(player)}
                              >
                                <div className="player-mobile-card-header">
                                  <img src={getPlayerPhoto(player)} alt={player.name} className="player-photo player-mobile-photo" />
                                  <div className="player-mobile-identity">
                                    <h4>{player.name}</h4>
                                    <div className="player-mobile-subtitle">
                                      <span className="player-mobile-team">
                                        <img src={getTeamLogo(player.team)} alt={player.team} className="team-logo" />
                                        <span>{player.team}</span>
                                      </span>
                                      <span className="player-mobile-pos">{player.position === 'P' ? getPitcherRole(player, 2026) : player.position}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="player-mobile-stats-grid">
                                  <div className="player-mobile-stat-card">
                                    <span>2025 FP</span>
                                    <strong>{points2025 === undefined || points2025 === null || typeof points2025 !== 'number' || isNaN(points2025) ? 0 : points2025}</strong>
                                  </div>
                                  <div className="player-mobile-stat-card">
                                    <span>2026 FP</span>
                                    <strong>{points2026 === undefined || points2026 === null || typeof points2026 !== 'number' || isNaN(points2026) ? 0 : points2026}</strong>
                                  </div>
                                </div>

                                <div className="player-mobile-action">
                                  <button
                                    type="button"
                                    className="pickup-player-btn"
                                    disabled={pickupState.disabled}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!pickupState.disabled) {
                                        handlePickupPlayer(player);
                                      }
                                    }}
                                  >
                                    {pickupState.label}
                                  </button>
                                  {pickupState.note ? <small className="players-action-note">{pickupState.note}</small> : null}
                                </div>
                              </article>
                            );
                          })}
                        </div>

                        <table className="players-table players-table-all players-table-desktop">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Team</th>
                              <th>POS</th>
                              <th
                                onClick={() => setPlayersSortSeason('2025')}
                                style={{ cursor: 'pointer' }}
                                title="Sort by 2025 fantasy points (high to low)"
                              >
                                2025 FP {playersSortSeason === '2025' ? '↓' : ''}
                              </th>
                              <th
                                onClick={() => setPlayersSortSeason('2026')}
                                style={{ cursor: 'pointer' }}
                                title="Sort by 2026 fantasy points (high to low)"
                              >
                                2026 FP {playersSortSeason === '2026' ? '↓' : ''}
                              </th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredAllPlayers.map((player) => {
                              const points2025 = fantasyPointsCache[`${player._id}-2025`];
                              const points2026 = fantasyPointsCache[`${player._id}-2026`];
                              const pickupState = getPickupButtonState(player);
                              const playerId = String(player?._id || '');
                              const isDraftedByOtherTeam = !!selectedMyTeamGroupId
                                && groupPickedPlayerIdSet.has(playerId)
                                && !myTeamPickIdSet.has(playerId);

                              return (
                                <tr
                                  key={player._id}
                                  className={`clickable-row ${isDraftedByOtherTeam ? 'player-unavailable' : ''}`}
                                  onClick={() => setSelectedPlayer(player)}
                                >
                                  <td data-label="Name">
                                    <div className="player-name-cell">
                                      <img src={getPlayerPhoto(player)} alt={player.name} className="player-photo" />
                                      <span>{player.name}</span>
                                    </div>
                                  </td>
                                  <td data-label="Team">
                                    <div className="team-cell">
                                      <img src={getTeamLogo(player.team)} alt={player.team} className="team-logo" />
                                      <span>{player.team}</span>
                                    </div>
                                  </td>
                                  <td data-label="POS">{player.position === 'P' ? getPitcherRole(player, 2026) : player.position}</td>
                                  <td data-label="2025 FP">{points2025 === undefined || points2025 === null || typeof points2025 !== 'number' || isNaN(points2025) ? 0 : points2025}</td>
                                  <td data-label="2026 FP">{points2026 === undefined || points2026 === null || typeof points2026 !== 'number' || isNaN(points2026) ? 0 : points2026}</td>
                                  <td data-label="Action" className="players-action-cell">
                                    <button
                                      type="button"
                                      className="pickup-player-btn"
                                      disabled={pickupState.disabled}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!pickupState.disabled) {
                                          handlePickupPlayer(player);
                                        }
                                      }}
                                    >
                                      {pickupState.label}
                                    </button>
                                    {pickupState.note ? <small className="players-action-note">{pickupState.note}</small> : null}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* My Team Tab */}
        {activeTab === 'my-team' && (
          <div className="tab-content">
            <div className="my-team-header">
              <div>
                <h2>My Team</h2>
                <div className="my-team-filters">
                  <label className="my-team-filter">
                    <span>Group</span>
                    <select
                      value={selectedMyTeamGroupId}
                      onChange={(e) => setSelectedMyTeamGroupId(e.target.value)}
                      disabled={myTeamGroupsLoading || myTeamGroups.length === 0}
                    >
                      {myTeamGroups.length === 0 ? (
                        <option value="">No groups available</option>
                      ) : (
                        myTeamGroups.map((group) => (
                          <option value={group._id} key={group._id}>{group.name}</option>
                        ))
                      )}
                    </select>
                  </label>
                  <label className="my-team-filter">
                    <span>Team Name</span>
                    <div className="team-name-edit-row">
                      <input
                        type="text"
                        value={teamNameInput}
                        onChange={(e) => setTeamNameInput(e.target.value)}
                        placeholder="Enter team name"
                        className="team-name-input"
                        maxLength={60}
                        disabled={!selectedMyTeamGroupId || teamNameSaving}
                      />
                      <button
                        type="button"
                        className="swap-select-btn"
                        onClick={handleSaveTeamName}
                        disabled={!selectedMyTeamGroupId || teamNameSaving || !String(teamNameInput || '').trim()}
                      >
                        {teamNameSaving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </label>
                </div>
                {myTeamSelectionMessage && <p className="my-team-selection-message">{myTeamSelectionMessage}</p>}
              </div>
              <div className="my-team-summary">
                <div className="my-team-total">
                  <span>Total Points:</span>
                  <strong>{myTeamTotalPoints.total}</strong>
                  {myTeamTotalPoints.hasPending && <small>updating...</small>}
                </div>
                  <div className="my-team-total">
                    <span>Drops Left:</span>
                    <strong>{Math.max(0, Number(myTeam.dropsRemaining) || 0)}</strong>
                  </div>
              </div>
            </div>
            <div className="my-team-roster">
              <table className="players-table my-team-list">
                <thead>
                  <tr>
                    <th>Slot</th>
                    <th>Player</th>
                    <th>Team</th>
                    <th>POS</th>
                    <th>Points</th>
                    <th>Drop</th>
                  </tr>
                </thead>
                <tbody>
                  {myTeamRoster.slots.map((slot) => {
                    const season = slot.player ? getLatestSeasonForPlayer(slot.player) : null;
                    const cacheKey = slot.player?._id && season ? `${slot.player._id}-${season}` : null;
                    const fantasyPoints = cacheKey ? fantasyPointsCache[cacheKey] : null;
                    const isBenchSlot = slot.isBench;
                    const isPendingBenchPlayer = pendingSwapBenchPlayerId && pendingSwapBenchPlayerId === slot.player?._id;
                    const pendingBenchPosition = normalizeRosterPosition(pendingBenchPlayer);
                    const activePosition = normalizeRosterPosition(slot.player);
                    const isDhTargetSlot = String(slot.label || '').toUpperCase() === 'DH';
                    const isSwapTargetCompatible = pendingSwapBenchPlayerId
                      ? (
                        activePosition === pendingBenchPosition
                        || (isDhTargetSlot && pendingBenchPosition && !isPitcherPosition(pendingBenchPosition))
                      )
                      : false;

                    return (
                      <tr
                        key={slot.key}
                        className={[
                          slot.player ? 'clickable-row' : 'roster-empty-row',
                          isBenchSlot ? 'bench-slot-row' : ''
                        ].filter(Boolean).join(' ')}
                        onClick={() => slot.player && !isBenchSlot && setSelectedPlayer(slot.player)}
                      >
                        <td data-label="Slot"><strong className={isBenchSlot ? 'bench-slot-label' : ''}>{slot.label}</strong></td>
                        <td data-label="Player">
                          {slot.player ? (
                            <div className="player-name-cell">
                              <img src={getPlayerPhoto(slot.player)} alt={slot.player.name} className="player-photo" />
                              <span>{slot.player.name}</span>
                            </div>
                          ) : (
                            <span>{isBenchSlot ? 'Empty bench' : 'Open slot'}</span>
                          )}
                        </td>
                        <td data-label="Team">
                          {slot.player?.team ? (
                            <div className="team-cell">
                              <img src={getTeamLogo(slot.player.team)} alt={slot.player.team} className="team-logo" />
                              <span>{slot.player.team}</span>
                            </div>
                          ) : (
                            <span>—</span>
                          )}
                        </td>
                        <td data-label="POS">{slot.player?.position || '—'}</td>
                        <td data-label="Points">
                          {!slot.player
                            ? '—'
                            : fantasyPoints === undefined
                              ? 'Loading...'
                              : fantasyPoints === null
                                ? 'N/A'
                                : fantasyPoints}
                        </td>
                        <td data-label="Drop">
                          {!isViewingOwnTeam || !slot.player ? '—' : isBenchSlot ? (
                            <div className="roster-status-cell">
                              {isPendingBenchPlayer ? (
                                <button
                                  type="button"
                                  className="swap-cancel-btn"
                                  onClick={(e) => { e.stopPropagation(); setPendingSwapBenchPlayerId(''); }}
                                >
                                  Cancel
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="swap-select-btn"
                                  disabled={swapLoading}
                                  onClick={(e) => { e.stopPropagation(); setPendingSwapBenchPlayerId(slot.player._id); }}
                                >
                                  Swap
                                </button>
                              )}
                              <button
                                type="button"
                                className="drop-player-btn"
                                disabled={(Number(myTeam.dropsRemaining) || 0) <= 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDropPlayer(slot.player);
                                }}
                              >
                                Drop
                              </button>
                            </div>
                          ) : (
                            <div className="roster-status-cell">
                              {pendingSwapBenchPlayerId && isSwapTargetCompatible ? (
                                <button
                                  type="button"
                                  className="swap-in-btn"
                                  disabled={swapLoading}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSwapRoster(pendingSwapBenchPlayerId, slot.player._id);
                                  }}
                                >
                                  {swapLoading ? '...' : 'Swap In'}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="drop-player-btn"
                                disabled={(Number(myTeam.dropsRemaining) || 0) <= 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDropPlayer(slot.player);
                                }}
                              >
                                Drop
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {pendingSwapBenchPlayerId && (
                <div className="swap-pending-notice">
                  Select an active player in a compatible position to swap.
                  <button type="button" onClick={() => setPendingSwapBenchPlayerId('')}>Cancel</button>
                </div>
              )}

              {myTeamGroupsLoading && (
                <p className="loading">Loading groups...</p>
              )}

              {!myTeamGroupsLoading && myTeamGroups.length === 0 && (
                <p className="no-players">Join or create a group to view a team.</p>
              )}

              {!myTeamGroupsLoading && myTeamGroups.length > 0 && myTeam.picks.length === 0 && (
                <p className="no-players">Draft players to start filling these roster slots.</p>
              )}
            </div>
          </div>
        )}

        {/* Standings Tab */}
        {activeTab === 'standings' && (
          <div className="tab-content">
            <div className="tab-section-header">
              <h2>Standings</h2>
              <label className="tab-group-filter">
                <span>Current Group</span>
                <select
                  value={selectedMyTeamGroupId}
                  onChange={(e) => setSelectedMyTeamGroupId(e.target.value)}
                  disabled={myTeamGroupsLoading || myTeamGroups.length === 0}
                >
                  {myTeamGroups.length === 0 ? (
                    <option value="">No groups available</option>
                  ) : (
                    myTeamGroups.map((group) => (
                      <option value={group._id} key={group._id}>{group.name}</option>
                    ))
                  )}
                </select>
              </label>
            </div>
            {currentGroup && <p className="tab-group-caption">Showing standings for {currentGroup.name}.</p>}
            {standingsLoading && <p className="loading">Loading standings...</p>}
            {standingsError && <p className="error">{standingsError}</p>}

            {!selectedMyTeamGroupId && !standingsLoading && !standingsError && (
              <p className="no-players">Select a group to view standings.</p>
            )}

            {!standingsLoading && !standingsError && selectedMyTeamGroupId && standings.length === 0 && (
              <p className="no-players">No teams with drafted players yet.</p>
            )}

            {!standingsLoading && !standingsError && selectedMyTeamGroupId && standings.length > 0 && (
              <>
                <p className="standings-hint">Click a team row to view that roster overview.</p>
                <table className="players-table standings-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Team</th>
                      <th>Total Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStandings.map((team, index) => {
                      const displayRank = index + 1;
                      const trophy = displayRank === 1 ? '🏆' : displayRank === 2 ? '🥈' : displayRank === 3 ? '🥉' : '';
                      const teamNameClass = displayRank <= 3
                        ? `standings-team-name standings-team-name-top-${displayRank}`
                        : 'standings-team-name';
                      const matchedOverviewTeam = getOverviewTeamForStandingsRow(team);
                      const standingsTeamKey = matchedOverviewTeam
                        ? getStandingsTeamSelectionKey(matchedOverviewTeam)
                        : getStandingsTeamSelectionKey(team);
                      const isSelected = standingsTeamKey === selectedStandingsTeamKey;
                      const computedTotals = standingsComputedTotalsByTeamKey.get(standingsTeamKey);
                      const rowTotalPoints = computedTotals ? computedTotals.total : (team.totalPoints || 0);
                      const rowHasPending = Boolean(computedTotals?.hasPending);

                      return (
                        <tr
                          key={standingsTeamKey || team.teamId || team.teamName}
                          className={[
                            displayRank <= 3 ? `standings-top standings-top-${displayRank}` : '',
                            'standings-clickable-row',
                            isSelected ? 'standings-selected-row' : ''
                          ].filter(Boolean).join(' ')}
                          onClick={() => setSelectedStandingsTeamKey((prev) => (prev === standingsTeamKey ? '' : standingsTeamKey))}
                        >
                          <td data-label="Rank">
                            <span className="standings-rank">
                              {trophy && <span className="standings-trophy">{trophy}</span>}
                              <span>#{displayRank}</span>
                            </span>
                          </td>
                          <td data-label="Team">
                            <span className={teamNameClass}>{team.teamName}</span>
                          </td>
                          <td data-label="Total Points"><strong>{rowHasPending ? 'Loading...' : rowTotalPoints}</strong></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {standingsTeamsLoading && <p className="loading">Loading team overview...</p>}
                {standingsTeamsError && <p className="error">{standingsTeamsError}</p>}

                {!standingsTeamsLoading && selectedStandingsTeam && (
                  <div className="standings-overview-panel">
                    <div className="standings-overview-header">
                      <h3>{selectedStandingsTeam.username} Team Overview</h3>
                      <div className="standings-overview-meta">
                        <span>Owner: {selectedStandingsTeam.ownerUsername || selectedStandingsTeam.username || 'Unknown'}</span>
                      </div>
                    </div>
                    {selectedStandingsTeamPlayers.length === 0 ? (
                      <p className="no-players">No players on this team yet.</p>
                    ) : (
                      <table className="players-table standings-overview-table">
                        <thead>
                          <tr>
                            <th>Player</th>
                            <th>Team</th>
                            <th>Pos</th>
                            <th>Points</th>
                            <th>Slot</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedStandingsTeamPlayers.map((player, index) => {
                            const fullPlayer = playersById.get(String(player.resolvedPlayerId || player.playerId || ''));
                            const season = fullPlayer ? getLatestSeasonForPlayer(fullPlayer) : null;
                            const cacheKey = (player.resolvedPlayerId || player.playerId) && season
                              ? `${player.resolvedPlayerId || player.playerId}-${season}`
                              : null;
                            const points = cacheKey ? fantasyPointsCache[cacheKey] : null;

                            return (
                            <tr key={`${player.playerId}-${index}`}>
                              <td data-label="Player">
                                <div className="player-name-cell">
                                  <img
                                    src={getPlayerPhoto({ name: player.playerName, photoUrl: player.photoUrl || '' })}
                                    alt={player.playerName}
                                    className="player-photo"
                                  />
                                  <span>{player.playerName}</span>
                                </div>
                              </td>
                              <td data-label="Team">
                                {player.team && player.team !== '—' ? (
                                  <div className="team-cell">
                                    <img src={getTeamLogo(player.team)} alt={player.team} className="team-logo" />
                                    <span>{player.team}</span>
                                  </div>
                                ) : (
                                  <span>—</span>
                                )}
                              </td>
                              <td data-label="Pos">{player.position}</td>
                              <td data-label="Points">
                                {!cacheKey ? 'N/A' : points === undefined ? 'Loading...' : points === null ? 'N/A' : points}
                              </td>
                              <td data-label="Slot">{player.isBench ? 'Bench' : 'Active'}</td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Trades Tab */}
        {TRADES_TAB_ENABLED && activeTab === 'trades' && (
          <div className="tab-content trades-broadcast-view">
            <div className="tab-section-header">
              <h2>Trades</h2>
              <label className="tab-group-filter">
                <span>Current Group</span>
                <select
                  value={selectedMyTeamGroupId}
                  onChange={(e) => setSelectedMyTeamGroupId(e.target.value)}
                  disabled={myTeamGroupsLoading || myTeamGroups.length === 0}
                >
                  {myTeamGroups.length === 0 ? (
                    <option value="">No groups available</option>
                  ) : (
                    myTeamGroups.map((group) => (
                      <option value={group._id} key={group._id}>{group.name}</option>
                    ))
                  )}
                </select>
              </label>
            </div>
            {currentGroup && <p className="tab-group-caption">Trading inside {currentGroup.name}.</p>}

            {tradeLoading && <p className="loading">Loading teams for trading...</p>}
            {tradeError && <p className="error">{tradeError}</p>}

            {!selectedMyTeamGroupId && !tradeLoading && !tradeError && (
              <p className="no-players">Select a group to view trade options.</p>
            )}

            {!tradeLoading && !tradeError && selectedMyTeamGroupId && (
              <div className="trade-layout">
                <div className="trade-card">
                  <h3 className="trade-card-kicker">Matchup Setup</h3>
                  <label className="trade-label">Select Team To Trade With</label>
                  <select
                    className="trade-select"
                    value={selectedTradePartnerId}
                    onChange={(e) => {
                      setSelectedTradePartnerId(e.target.value);
                      setRequestedPlayerIds([]);
                      setTradeSubmitMessage('');
                    }}
                  >
                    <option value="">Select a team</option>
                    {tradeTeams.otherTeams.map((team) => (
                      <option value={team.userId} key={team.userId}>{team.username}</option>
                    ))}
                  </select>
                </div>

                <div className="trade-team-columns">
                  <div className="trade-team-panel">
                    <h3><span className="trade-panel-tag">Your Side</span> Your Team</h3>
                    {(tradeTeams.myTeam?.players || []).length === 0 ? (
                      <p className="no-players">No players on your team yet.</p>
                    ) : (
                      <div className="trade-player-list">
                        {(tradeTeams.myTeam?.players || []).map((player) => {
                          const isSelected = offeredPlayerIds.includes(player.playerId);
                          return (
                            <button
                              key={player.playerId}
                              type="button"
                              className={`trade-player-row ${isSelected ? 'selected' : ''}`}
                              onClick={() => setOfferedPlayerIds((prev) => (
                                prev.includes(player.playerId)
                                  ? prev.filter((id) => id !== player.playerId)
                                  : [...prev, player.playerId]
                              ))}
                            >
                              <div className="trade-player-main">
                                <img
                                  src={getPlayerPhoto({ name: player.playerName, photoUrl: player.photoUrl || '' })}
                                  alt={player.playerName}
                                  className="trade-player-photo"
                                />
                                <div className="trade-player-text">
                                  <strong>{player.playerName}</strong>
                                  <div className="trade-player-meta">
                                    {player.team ? (
                                      <span className="trade-player-team">
                                        <img src={getTeamLogo(player.team)} alt={player.team} className="team-logo" />
                                        <span>{player.team}</span>
                                      </span>
                                    ) : (
                                      <span className="trade-player-team">—</span>
                                    )}
                                    <small>{player.position || '—'}</small>
                                  </div>
                                </div>
                              </div>
                              <span className="trade-select-indicator">{isSelected ? 'Selected' : 'Select'}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="trade-team-panel">
                    <h3><span className="trade-panel-tag">Opponent Side</span> {selectedTradePartner ? `${selectedTradePartner.username}'s Team` : 'Trade Partner Team'}</h3>
                    {!selectedTradePartner ? (
                      <p className="no-players">Select a trade partner to see their team.</p>
                    ) : (selectedTradePartner.players || []).length === 0 ? (
                      <p className="no-players">This team has no players available.</p>
                    ) : (
                      <div className="trade-player-list">
                        {(selectedTradePartner.players || []).map((player) => {
                          const isSelected = requestedPlayerIds.includes(player.playerId);
                          return (
                            <button
                              key={player.playerId}
                              type="button"
                              className={`trade-player-row ${isSelected ? 'selected' : ''}`}
                              onClick={() => setRequestedPlayerIds((prev) => (
                                prev.includes(player.playerId)
                                  ? prev.filter((id) => id !== player.playerId)
                                  : [...prev, player.playerId]
                              ))}
                            >
                              <div className="trade-player-main">
                                <img
                                  src={getPlayerPhoto({ name: player.playerName, photoUrl: player.photoUrl || '' })}
                                  alt={player.playerName}
                                  className="trade-player-photo"
                                />
                                <div className="trade-player-text">
                                  <strong>{player.playerName}</strong>
                                  <div className="trade-player-meta">
                                    {player.team ? (
                                      <span className="trade-player-team">
                                        <img src={getTeamLogo(player.team)} alt={player.team} className="team-logo" />
                                        <span>{player.team}</span>
                                      </span>
                                    ) : (
                                      <span className="trade-player-team">—</span>
                                    )}
                                    <small>{player.position || '—'}</small>
                                  </div>
                                </div>
                              </div>
                              <span className="trade-select-indicator">{isSelected ? 'Selected' : 'Select'}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="trade-card trade-review-panel">
                  <h3><span className="trade-card-kicker">Studio Analysis</span> Review Trade</h3>
                  <div className="trade-review-grid">
                    <div className="trade-review-item">
                      <p><strong>You Trade</strong></p>
                      {selectedOfferedPlayer.length > 0 ? (
                        <div className="trade-review-list">
                          {selectedOfferedPlayer.map((player) => (
                            <div className="trade-review-player" key={player.playerId}>
                              <img
                                src={getPlayerPhoto({ name: player.playerName, photoUrl: player.photoUrl || '' })}
                                alt={player.playerName}
                                className="trade-player-photo"
                              />
                              <div>
                                <strong>{player.playerName}</strong>
                                <div className="trade-player-meta">
                                  {player.team ? (
                                    <span className="trade-player-team">
                                      <img src={getTeamLogo(player.team)} alt={player.team} className="team-logo" />
                                      <span>{player.team}</span>
                                    </span>
                                  ) : (
                                    <span className="trade-player-team">—</span>
                                  )}
                                  <small>{player.position || '—'}</small>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p>No player selected</p>
                      )}
                    </div>
                    <div className="trade-review-item">
                      <p><strong>You Receive</strong></p>
                      {selectedRequestedPlayer.length > 0 ? (
                        <div className="trade-review-list">
                          {selectedRequestedPlayer.map((player) => (
                            <div className="trade-review-player" key={player.playerId}>
                              <img
                                src={getPlayerPhoto({ name: player.playerName, photoUrl: player.photoUrl || '' })}
                                alt={player.playerName}
                                className="trade-player-photo"
                              />
                              <div>
                                <strong>{player.playerName}</strong>
                                <div className="trade-player-meta">
                                  {player.team ? (
                                    <span className="trade-player-team">
                                      <img src={getTeamLogo(player.team)} alt={player.team} className="team-logo" />
                                      <span>{player.team}</span>
                                    </span>
                                  ) : (
                                    <span className="trade-player-team">—</span>
                                  )}
                                  <small>{player.position || '—'}</small>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p>No player selected</p>
                      )}
                    </div>
                  </div>

                  <label className="trade-label">Message (optional)</label>
                  <textarea
                    className="trade-message-input"
                    value={tradeMessage}
                    onChange={(e) => setTradeMessage(e.target.value)}
                    placeholder="Add a message to this offer"
                  />

                  <button className="trade-action-btn" onClick={handleCreateTradeOffer}>Send Trade Offer</button>
                  {tradeSubmitMessage && <p className="trade-submit-message">{tradeSubmitMessage}</p>}
                </div>

                <div className="trade-card">
                  <h3><span className="trade-card-kicker">Ticker</span> Your Pending Offers</h3>
                  {inboxData.sentPending.length === 0 ? (
                    <p className="no-players">No pending offers.</p>
                  ) : (
                    <div className="trade-feed-list">
                      {inboxData.sentPending.map((trade) => (
                        <div key={trade._id} className="trade-feed-item">
                          <p><strong>To:</strong> {trade.toUsername}</p>
                          <p><strong>You offer:</strong> {trade.offeredPlayerName}</p>
                          <p><strong>You want:</strong> {trade.requestedPlayerName}</p>
                          {trade.message ? <p><strong>Message:</strong> {trade.message}</p> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {inboxOpen && (
          <div className="player-modal-overlay" onClick={() => setInboxOpen(false)}>
            <div className="player-modal inbox-modal" onClick={(e) => e.stopPropagation()}>
              <div className="player-modal-header">
                <div className="player-modal-title">
                  <div>
                    <h3>Inbox / Messages</h3>
                    <p>Incoming trade offers and updates</p>
                  </div>
                </div>
                <button className="player-modal-close" onClick={() => setInboxOpen(false)}>✕</button>
              </div>

              {inboxLoading && <p className="loading">Loading inbox...</p>}
              {inboxError && <p className="error">{inboxError}</p>}

              {!inboxLoading && (
                <div className="inbox-sections">
                  <section>
                    <h4>Incoming Offers</h4>
                    {inboxData.incomingOffers.length === 0 ? (
                      <p className="no-players">No incoming offers.</p>
                    ) : (
                      <div className="trade-feed-list">
                        {inboxData.incomingOffers.map((trade) => (
                          <div key={trade._id} className="trade-feed-item">
                            <p><strong>From:</strong> {trade.fromUsername}</p>
                            <p><strong>They offer:</strong> {trade.offeredPlayerName}</p>
                            <p><strong>They want:</strong> {trade.requestedPlayerName}</p>
                            <p>
                              <strong>Fairness Grade:</strong>{' '}
                              <span className={`trade-grade-badge trade-grade-${String(tradeEvaluationCache[trade._id]?.grade || 'N/A').replace('+', 'plus').toLowerCase()}`}>
                                {tradeEvaluationCache[trade._id]?.grade || '...'}
                              </span>
                            </p>
                            <p className="trade-fairness-summary">{tradeEvaluationCache[trade._id]?.synopsis || 'Evaluating trade fairness...'}</p>
                            {trade.message ? <p><strong>Message:</strong> {trade.message}</p> : null}
                            <div className="trade-feed-actions">
                              <button className="trade-accept-btn" onClick={() => handleRespondToTrade(trade._id, 'accepted')}>Accept</button>
                              <button className="trade-decline-btn" onClick={() => handleRespondToTrade(trade._id, 'declined')}>Decline</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section>
                    <h4>Your Trade Updates</h4>
                    {inboxData.sentUpdates.length === 0 ? (
                      <p className="no-players">No accepted/declined updates yet.</p>
                    ) : (
                      <div className="trade-feed-list">
                        {inboxData.sentUpdates.map((trade) => (
                          <div key={trade._id} className="trade-feed-item">
                            <p><strong>To:</strong> {trade.toUsername}</p>
                            <p>{trade.offeredPlayerName} for {trade.requestedPlayerName}</p>
                            <p><strong>Status:</strong> {trade.status}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          </div>
        )}

        {selectedPlayer && (
          <div className="player-modal-overlay" onClick={() => setSelectedPlayer(null)}>
            <div className="player-modal" onClick={(e) => e.stopPropagation()}>
              <div className="player-modal-header">
                <div className="player-modal-title">
                  <img src={getPlayerPhoto(selectedPlayer)} alt={selectedPlayer.name} className="player-modal-photo" />
                  <div>
                    <h3>{selectedPlayer.name}</h3>
                    <p>{selectedPlayer.team} • {selectedPlayer.position}</p>
                  </div>
                </div>
                <button className="player-modal-close" onClick={() => setSelectedPlayer(null)}>✕</button>
              </div>

              {getSeasonOptions(selectedPlayer).length > 0 && (
                <div className="season-tabs">
                  {getSeasonOptions(selectedPlayer).map((season) => (
                    <button
                      key={season}
                      className={`season-tab ${selectedSeason === season ? 'active' : ''}`}
                      onClick={() => setSelectedSeason(season)}
                    >
                      {season}
                    </button>
                  ))}
                </div>
              )}

              <div className="player-stats-grid">
                {Number(selectedSeason) === 2025 && selectedPlayer && (
                  <div className="player-stat-item player-fantasy-points">
                    <span className="stat-label">Fantasy Points: </span>
                    <span className="stat-value">
                      {getModalFantasyPoints(selectedPlayer, 2025) === undefined
                        ? 'Loading...'
                        : getModalFantasyPoints(selectedPlayer, 2025) === null
                          ? 'N/A'
                          : getModalFantasyPoints(selectedPlayer, 2025)}
                    </span>
                  </div>
                )}
                {Number(selectedSeason) === 2026 && selectedPlayer && (
                  <div className="player-stat-item player-fantasy-points">
                    <span className="stat-label">Fantasy Points: </span>
                    <span className="stat-value">
                      {getModalFantasyPoints(selectedPlayer, 2026) === undefined
                        ? 'Loading...'
                        : getModalFantasyPoints(selectedPlayer, 2026) === null
                          ? 'N/A'
                          : getModalFantasyPoints(selectedPlayer, 2026)}
                    </span>
                  </div>
                )}
                {getPlayerStatsList(
                  selectedPlayer,
                  selectedSeason,
                  selectedPlayer && selectedSeason ? officialStatsCache[`${selectedPlayer._id}-${selectedSeason}`] : null
                ).map((stat) => (
                  <div className="player-stat-item" key={stat.key}>
                    <span className="stat-label">{stat.label}: </span>
                    <span className="stat-value">{formatStatValue(stat)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
