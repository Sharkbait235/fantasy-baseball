import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import './Draft.css';

const DRAFT_FANTASY_POINTS_2025_CACHE_KEY = 'draftFantasyPoints2025Cache-v1-20260328';

const HITTER_POSITION_ACCEPTS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH'];

const DRAFT_ROSTER_SLOT_TEMPLATE = [
  { key: 'C', accepts: ['C'], isBench: false },
  { key: '1B', accepts: ['1B'], isBench: false },
  { key: '2B', accepts: ['2B'], isBench: false },
  { key: '3B', accepts: ['3B'], isBench: false },
  { key: 'SS', accepts: ['SS'], isBench: false },
  { key: 'LF', accepts: ['LF', 'OF'], isBench: false },
  { key: 'CF', accepts: ['CF', 'OF'], isBench: false },
  { key: 'RF', accepts: ['RF', 'OF'], isBench: false },
  { key: 'DH1', accepts: HITTER_POSITION_ACCEPTS, isBench: false },
  { key: 'DH2', accepts: HITTER_POSITION_ACCEPTS, isBench: false },
  { key: 'SP1', accepts: ['SP'], isBench: false },
  { key: 'SP2', accepts: ['SP'], isBench: false },
  { key: 'RP', accepts: ['RP'], isBench: false }
];

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

function Draft({ auth, players = [] }) {
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupDraftDateTime, setGroupDraftDateTime] = useState('');
  const [groupDraftType, setGroupDraftType] = useState('snake');
  const [groupInviteCode, setGroupInviteCode] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isJoiningGroup, setIsJoiningGroup] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [joiningGroup, setJoiningGroup] = useState(false);
  const [groupStatusMessage, setGroupStatusMessage] = useState('');
  const [isEditingGroupName, setIsEditingGroupName] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [savingGroupName, setSavingGroupName] = useState(false);
  const [joiningDraftId, setJoiningDraftId] = useState('');
  const [isEditingDraftSchedule, setIsEditingDraftSchedule] = useState(false);
  const [editingDraftDateTime, setEditingDraftDateTime] = useState('');
  const [savingDraftSchedule, setSavingDraftSchedule] = useState(false);
  const [isEditingDraftOrder, setIsEditingDraftOrder] = useState(false);
  const [draftOrderUserIds, setDraftOrderUserIds] = useState([]);
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);
  const [savingDraftOrder, setSavingDraftOrder] = useState(false);
  const [deletingGroupId, setDeletingGroupId] = useState('');
  const [activeDraftId, setActiveDraftId] = useState('');
  const [activeDraftGroupId, setActiveDraftGroupId] = useState('');
  const [activeDraft, setActiveDraft] = useState(null);
  const [loadingActiveDraft, setLoadingActiveDraft] = useState(false);
  const [draftNowMs, setDraftNowMs] = useState(() => Date.now());
  const [startingDraft, setStartingDraft] = useState(false);
  const [endingDraft, setEndingDraft] = useState(false);
  const [pickingPlayerId, setPickingPlayerId] = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  const [draftCombinedPositionRoleFilter, setDraftCombinedPositionRoleFilter] = useState('ALL');
  const [selectedDraftPlayer, setSelectedDraftPlayer] = useState(null);
  const [selectedDraftPlayerSeason, setSelectedDraftPlayerSeason] = useState(2026);
  const [draftPlayerStatsCache, setDraftPlayerStatsCache] = useState({});
  const [draftModalFantasyPointsCache, setDraftModalFantasyPointsCache] = useState({});
  const [draftFantasyPoints2025Cache, setDraftFantasyPoints2025Cache] = useState(() => {
    try {
      const cached = localStorage.getItem(DRAFT_FANTASY_POINTS_2025_CACHE_KEY);
      const parsed = cached ? JSON.parse(cached) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  });
  const [isDraftFantasySnapshotLoaded, setIsDraftFantasySnapshotLoaded] = useState(false);
  const tickerViewportRef = useRef(null);
  const tickerMeasureRef = useRef(null);
  const draftFantasyPointsInFlightRef = useRef(new Map());
  const draftModalFantasyPointsInFlightRef = useRef(new Map());
  const draftPlayerStatsCacheRef = useRef({});
  const draftFantasyPoints2025CacheRef = useRef({});
  const draftModalFantasyPointsCacheRef = useRef({});
  const [shouldScrollTicker, setShouldScrollTicker] = useState(false);

  const getPlayerPhoto = (player) => {
    if (player?.photoUrl) return player.photoUrl;
    const playerName = player?.name || 'Player';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(playerName)}&size=96&background=667eea&color=ffffff&bold=true`;
  };

  const getTeamLogo = (team) => {
    const code = String(team || '').toUpperCase();
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

  const toDateTimeInputValue = (dateValue) => {
    if (!dateValue) return '';
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return '';

    const local = new Date(parsed.getTime() - (parsed.getTimezoneOffset() * 60000));
    return local.toISOString().slice(0, 16);
  };

  const toDisplayDateTime = (dateValue) => {
    if (!dateValue) return 'Not scheduled yet';
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return 'Not scheduled yet';

    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    const year = parsed.getFullYear();
    const timeLabel = parsed.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit'
    });

    return `${month}/${day}/${year} ${timeLabel}`;
  };

  const toRelativeDraftLabel = (dateValue) => {
    if (!dateValue) return 'Draft time not set';

    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return 'Draft time not set';

    const diffMs = parsed.getTime() - Date.now();
    const diffMinutes = Math.round(diffMs / 60000);

    if (Math.abs(diffMinutes) < 60) {
      if (diffMinutes > 0) return `Starts in ${diffMinutes} min`;
      if (diffMinutes < 0) return `Started ${Math.abs(diffMinutes)} min ago`;
      return 'Starting now';
    }

    const diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 24) {
      if (diffHours > 0) return `Starts in ${diffHours} hr`;
      return `Started ${Math.abs(diffHours)} hr ago`;
    }

    const diffDays = Math.round(diffHours / 24);
    if (diffDays > 0) return `Starts in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
    return `Started ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} ago`;
  };

  const toDisplayDateParts = (dateValue) => {
    if (!dateValue) {
      return { date: 'Not scheduled yet', time: '' };
    }

    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      return { date: 'Not scheduled yet', time: '' };
    }

    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    const year = parsed.getFullYear();
    const timeLabel = parsed.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit'
    });

    return {
      date: `${month}/${day}/${year}`,
      time: timeLabel
    };
  };

  const getInitials = (nameValue) => {
    const words = String(nameValue || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (words.length === 0) return 'TM';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  };

  const buildDraftOrderIdsForGroup = useCallback((group) => {
    const members = Array.isArray(group?.members) ? group.members : [];
    const fallback = members.map((member) => String(member?.userId || '')).filter(Boolean);
    const configured = Array.isArray(group?.draftOrderUserIds)
      ? group.draftOrderUserIds.map((id) => String(id || '')).filter(Boolean)
      : [];

    if (configured.length !== fallback.length) return fallback;

    const fallbackSet = new Set(fallback);
    const configuredSet = new Set(configured);
    if (configuredSet.size !== fallback.length) return fallback;

    const isSameMembers = configured.every((id) => fallbackSet.has(id));
    return isSameMembers ? configured : fallback;
  }, []);

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

  const getDraftModalFantasyPoints = (player, season) => {
    if (!player?._id || !season) return undefined;

    const seasonKey = String(season);
    if (seasonKey === '2025') {
      const cached2025 = draftFantasyPoints2025Cache[player._id];
      if (cached2025 !== undefined) return cached2025;
    }

    const cacheKey = `${player._id}-${seasonKey}`;
    const cachedPoints = draftModalFantasyPointsCache[cacheKey];
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

    return trackedStats
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
  };

  useEffect(() => {
    if (!auth?.token) return;

    const fetchGroups = async () => {
      try {
        setLoadingGroups(true);
        const response = await fetch('https://fantasy-baseball-o8ta.onrender.com/api/groups', {
          headers: { Authorization: `Bearer ${auth.token}` }
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data?.message || 'Failed to load groups');

        const nextGroups = Array.isArray(data?.groups) ? data.groups : [];
        setGroups(nextGroups);
        setSelectedGroupId((currentSelectedGroupId) => {
          if (currentSelectedGroupId && nextGroups.some((group) => group._id === currentSelectedGroupId)) {
            return currentSelectedGroupId;
          }
          return nextGroups[0]?._id || '';
        });
      } catch (err) {
        setGroupStatusMessage(err.message || 'Failed to load groups');
      } finally {
        setLoadingGroups(false);
      }
    };

    fetchGroups();
  }, [auth?.token]);

  const selectedGroup = useMemo(
    () => groups.find((group) => group._id === selectedGroupId) || null,
    [groups, selectedGroupId]
  );

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_FANTASY_POINTS_2025_CACHE_KEY, JSON.stringify(draftFantasyPoints2025Cache));
    } catch {
      // Ignore storage errors and keep using in-memory draft cache.
    }
  }, [draftFantasyPoints2025Cache]);

  useEffect(() => {
    draftPlayerStatsCacheRef.current = draftPlayerStatsCache;
  }, [draftPlayerStatsCache]);

  useEffect(() => {
    draftFantasyPoints2025CacheRef.current = draftFantasyPoints2025Cache;
  }, [draftFantasyPoints2025Cache]);

  useEffect(() => {
    draftModalFantasyPointsCacheRef.current = draftModalFantasyPointsCache;
  }, [draftModalFantasyPointsCache]);

  const activeDraftGroup = useMemo(
    () => groups.find((group) => group._id === activeDraftGroupId) || null,
    [groups, activeDraftGroupId]
  );

  const isSelectedGroupOwner = selectedGroup?.ownerUserId === auth?.userId;

  useEffect(() => {
    setIsEditingGroupName(false);
    setEditingGroupName(selectedGroup?.name || '');
    setIsEditingDraftSchedule(false);
    setEditingDraftDateTime(toDateTimeInputValue(selectedGroup?.draftScheduledAt));
    setIsEditingDraftOrder(false);
    setIsGroupInfoOpen(false);
    setDraftOrderUserIds(buildDraftOrderIdsForGroup(selectedGroup));
  }, [selectedGroup?._id, selectedGroup?.name, selectedGroup?.draftScheduledAt]);

  useEffect(() => {
    if (!selectedGroup) return;
    if (isEditingDraftOrder) return;
    setDraftOrderUserIds(buildDraftOrderIdsForGroup(selectedGroup));
  }, [selectedGroup, isEditingDraftOrder, buildDraftOrderIdsForGroup]);

  const handleCreateGroup = async () => {
    if (!auth?.token || !groupName.trim()) return;

    try {
      setCreatingGroup(true);
      setGroupStatusMessage('');

      const response = await fetch('https://fantasy-baseball-o8ta.onrender.com/api/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify({
          name: groupName.trim(),
          draftScheduledAt: groupDraftDateTime ? new Date(groupDraftDateTime).toISOString() : null,
          preferredDraftType: groupDraftType
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Failed to create group');

      setGroups((previousGroups) => [data, ...previousGroups.filter((group) => group._id !== data._id)]);
      setSelectedGroupId(data._id);
      setGroupName('');
      setGroupDraftDateTime('');
      setGroupDraftType('snake');
      setIsCreatingGroup(false);
      setGroupStatusMessage(`Created ${data.name}. Invite code: ${data.inviteCode}`);
    } catch (err) {
      setGroupStatusMessage(err.message || 'Failed to create group');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleSaveDraftSchedule = async () => {
    if (!auth?.token || !selectedGroup) return;

    try {
      setSavingDraftSchedule(true);
      setGroupStatusMessage('');

      const response = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/groups/${selectedGroup._id}/draft-schedule`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify({
          draftScheduledAt: editingDraftDateTime ? new Date(editingDraftDateTime).toISOString() : null
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Failed to update draft schedule');

      setGroups((previousGroups) => previousGroups.map((group) => (
        group._id === data._id ? data : group
      )));
      setIsEditingDraftSchedule(false);
      setEditingDraftDateTime(toDateTimeInputValue(data.draftScheduledAt));
      setGroupStatusMessage(data.draftScheduledAt
        ? `Draft time set for ${toDisplayDateTime(data.draftScheduledAt)}`
        : 'Draft time cleared'
      );
    } catch (err) {
      setGroupStatusMessage(err.message || 'Failed to update draft schedule');
    } finally {
      setSavingDraftSchedule(false);
    }
  };

  const handleJoinGroup = async () => {
    if (!auth?.token || !groupInviteCode.trim()) return;

    try {
      setJoiningGroup(true);
      setGroupStatusMessage('');

      const response = await fetch('https://fantasy-baseball-o8ta.onrender.com/api/groups/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify({ inviteCode: groupInviteCode.trim().toUpperCase() })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Failed to join group');

      setGroups((previousGroups) => [data, ...previousGroups.filter((group) => group._id !== data._id)]);
      setSelectedGroupId(data._id);
      setGroupInviteCode('');
      setIsJoiningGroup(false);
      setGroupStatusMessage(`Joined ${data.name}`);
    } catch (err) {
      setGroupStatusMessage(err.message || 'Failed to join group');
    } finally {
      setJoiningGroup(false);
    }
  };

  const handleCopyInviteCode = async () => {
    if (!selectedGroup?.inviteCode) return;

    try {
      await navigator.clipboard.writeText(selectedGroup.inviteCode);
      setGroupStatusMessage(`Invite code copied: ${selectedGroup.inviteCode}`);
    } catch {
      setGroupStatusMessage(`Copy failed. Invite code: ${selectedGroup.inviteCode}`);
    }
  };

  const handleRenameGroup = async () => {
    if (!auth?.token || !selectedGroup || !editingGroupName.trim()) return;

    try {
      setSavingGroupName(true);
      setGroupStatusMessage('');

      const response = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/groups/${selectedGroup._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify({ name: editingGroupName.trim() })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Failed to rename group');

      setGroups((previousGroups) => previousGroups.map((group) => (
        group._id === data._id ? data : group
      )));
      setIsEditingGroupName(false);
      setGroupStatusMessage(`Renamed group to ${data.name}`);
    } catch (err) {
      setGroupStatusMessage(err.message || 'Failed to rename group');
    } finally {
      setSavingGroupName(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!auth?.token || !selectedGroup) return;
    if (!window.confirm(`Delete ${selectedGroup.name}? This cannot be undone.`)) return;

    try {
      const targetGroupId = selectedGroup._id;
      const targetGroupName = selectedGroup.name;
      setDeletingGroupId(selectedGroup._id);
      setGroupStatusMessage('');

      const response = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/groups/${targetGroupId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${auth.token}`
        }
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Failed to delete group');

      setGroups((previousGroups) => {
        const remainingGroups = previousGroups.filter((group) => group._id !== targetGroupId);
        setSelectedGroupId((currentGroupId) => (
          currentGroupId === targetGroupId ? (remainingGroups[0]?._id || '') : currentGroupId
        ));
        return remainingGroups;
      });
      setGroupStatusMessage(`Deleted ${targetGroupName}`);
    } catch (err) {
      setGroupStatusMessage(err.message || 'Failed to delete group');
    } finally {
      setDeletingGroupId('');
    }
  };

  const moveDraftOrderMember = (fromIndex, toIndex) => {
    setDraftOrderUserIds((currentOrder) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= currentOrder.length || toIndex >= currentOrder.length) {
        return currentOrder;
      }
      const nextOrder = [...currentOrder];
      const [moved] = nextOrder.splice(fromIndex, 1);
      nextOrder.splice(toIndex, 0, moved);
      return nextOrder;
    });
  };

  const handleSaveDraftOrder = async () => {
    if (!auth?.token || !selectedGroup || !isSelectedGroupOwner) return;

    const members = Array.isArray(selectedGroup.members) ? selectedGroup.members : [];
    if (draftOrderUserIds.length !== members.length) {
      setGroupStatusMessage('Draft order must include all group members.');
      return;
    }

    try {
      setSavingDraftOrder(true);
      setGroupStatusMessage('');

      const response = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/groups/${selectedGroup._id}/draft-order`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify({ draftOrderUserIds })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Failed to update draft order');

      setGroups((previousGroups) => previousGroups.map((group) => (
        group._id === data._id ? data : group
      )));
      setIsEditingDraftOrder(false);
      setGroupStatusMessage('Draft order updated.');
    } catch (err) {
      setGroupStatusMessage(err.message || 'Failed to update draft order');
    } finally {
      setSavingDraftOrder(false);
    }
  };

  const fetchDraftById = useCallback(async (draftId, { silent = false } = {}) => {
    if (!draftId) return;

    try {
      if (!silent) setLoadingActiveDraft(true);

      const response = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/drafts/${draftId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Failed to load draft');
      setActiveDraft(data);
    } catch (err) {
      setGroupStatusMessage(err.message || 'Failed to load draft');
    } finally {
      if (!silent) setLoadingActiveDraft(false);
    }
  }, []);

  useEffect(() => {
    if (!activeDraftId) return;

    fetchDraftById(activeDraftId);
    const interval = setInterval(() => {
      fetchDraftById(activeDraftId, { silent: true });
    }, 5000);

    return () => clearInterval(interval);
  }, [activeDraftId, fetchDraftById]);

  useEffect(() => {
    if (!activeDraftId) return;

    const timer = setInterval(() => {
      setDraftNowMs(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [activeDraftId]);

  const handleOpenDraftRoom = (draftId, groupId) => {
    if (!draftId) return;
    setActiveDraftId(String(draftId));
    setActiveDraftGroupId(String(groupId || selectedGroupId || ''));
    setDraftSearch('');
    setIsDraftFantasySnapshotLoaded(false);
  };

  const handleBackToGroups = () => {
    setActiveDraftId('');
    setActiveDraftGroupId('');
    setActiveDraft(null);
    setDraftSearch('');
    setIsDraftFantasySnapshotLoaded(false);
  };

  const handleStartDraft = async () => {
    if (!activeDraftId) return;

    try {
      setStartingDraft(true);
      const response = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/drafts/${activeDraftId}/start`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Failed to start draft');

      setActiveDraft(data);
      setGroupStatusMessage('Draft started');
    } catch (err) {
      setGroupStatusMessage(err.message || 'Failed to start draft');
    } finally {
      setStartingDraft(false);
    }
  };

  const handleEndDraft = async () => {
    if (!activeDraftId || !auth?.token) return;

    if (!window.confirm('End this draft now? This cannot be undone.')) return;

    try {
      setEndingDraft(true);
      const response = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/drafts/${activeDraftId}/end`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`
        }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Failed to end draft');

      setActiveDraft(data);
      setGroupStatusMessage('Draft ended');
    } catch (err) {
      setGroupStatusMessage(err.message || 'Failed to end draft');
    } finally {
      setEndingDraft(false);
    }
  };

  const handlePickPlayer = async (player) => {
    if (!activeDraftId || !player?._id) return false;

    try {
      setPickingPlayerId(String(player._id));
      const response = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/drafts/${activeDraftId}/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: String(player._id), playerName: player.name })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Failed to make pick');

      setActiveDraft(data);
      setDraftCombinedPositionRoleFilter('ALL');
      return true;
    } catch (err) {
      setGroupStatusMessage(err.message || 'Failed to make pick');
      return false;
    } finally {
      setPickingPlayerId('');
    }
  };

  const handleJoinDraft = async () => {
    if (!auth?.token || !selectedGroup?._id) return;

    try {
      setJoiningDraftId(selectedGroup._id);
      setGroupStatusMessage('');

      const response = await fetch('https://fantasy-baseball-o8ta.onrender.com/api/drafts/from-group', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify({ groupId: selectedGroup._id })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Failed to join draft');

      setGroupStatusMessage(
        `Joined ${data.name}. Status: ${data.status}.`
      );
      handleOpenDraftRoom(data._id, selectedGroup._id);
    } catch (err) {
      setGroupStatusMessage(err.message || 'Failed to join draft');
    } finally {
      setJoiningDraftId('');
    }
  };

  const myDraftSlotIndex = useMemo(() => {
    if (!activeDraft?.users || !auth?.userId) return -1;
    return activeDraft.users.findIndex((user) => user.userId === auth.userId);
  }, [activeDraft, auth?.userId]);

  const isMyTurn = activeDraft?.status === 'active' && myDraftSlotIndex >= 0 && activeDraft?.currentTurn === myDraftSlotIndex;

  const MAX_ROSTER_SIZE = DRAFT_ROSTER_SLOT_TEMPLATE.length;
  const MAX_PITCHERS_PER_TEAM = 3;
  const normalizePosition = (position) => {
    const normalized = String(position || '').trim().toUpperCase();
    if (!normalized) return '';
    if (normalized === 'SP' || normalized === 'RP') return normalized;
    if (normalized.includes('P')) return 'P';
    return normalized;
  };

  const inferPitcherRosterRole = (player, preferredSeason = 2026) => {
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
  };

  const resolveRosterPosition = (playerOrPosition, preferredSeason = 2026) => {
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
  };

  const isPitcherPositionValue = (position) => String(position || '').toUpperCase().includes('P');
  const buildRosterSlotState = () => DRAFT_ROSTER_SLOT_TEMPLATE.map((slot) => ({ ...slot, occupied: false }));
  const occupySlotForPosition = (slots, position) => {
    const normalizedPosition = normalizePosition(position);
    if (!normalizedPosition) return null;

    let targetIndex = slots.findIndex(
      (slot) => !slot.occupied && !slot.isBench && slot.accepts.includes(normalizedPosition)
    );

    if (targetIndex < 0) {
      targetIndex = slots.findIndex(
        (slot) => !slot.occupied && slot.isBench && slot.accepts.includes(normalizedPosition)
      );
    }

    if (targetIndex < 0) return null;
    slots[targetIndex].occupied = true;
    return slots[targetIndex].key;
  };
  const canFitOpenSlotForPosition = (slots, position) => {
    const normalizedPosition = normalizePosition(position);
    if (!normalizedPosition) return false;

    return slots.some(
      (slot) => !slot.occupied && slot.accepts.includes(normalizedPosition)
    );
  };

  const myPickCount = useMemo(() => {
    if (myDraftSlotIndex < 0 || !activeDraft?.users) return 0;
    return (activeDraft.users[myDraftSlotIndex]?.picks || []).length;
  }, [activeDraft, myDraftSlotIndex]);
  const myRosterFull = myPickCount >= MAX_ROSTER_SIZE;

  const myPositionCounts = useMemo(() => {
    if (myDraftSlotIndex < 0 || !activeDraft?.users) return new Map();

    const myPicks = activeDraft.users[myDraftSlotIndex]?.picks || [];
    const playerById = new Map((players || []).map((player) => [String(player._id), player]));

    const counts = new Map();
    myPicks.forEach((pick) => {
      const pickPlayerId = String(pick?.playerId || '');
      const persistedPosition = normalizePosition(pick?.position);
      const pickPosition = (persistedPosition && persistedPosition !== 'P')
        ? persistedPosition
        : resolveRosterPosition(playerById.get(pickPlayerId));
      if (!pickPosition) return;
      counts.set(pickPosition, (counts.get(pickPosition) || 0) + 1);
    });

    return counts;
  }, [activeDraft, myDraftSlotIndex, players]);
  const myOpenRosterSlots = useMemo(() => {
    const slots = buildRosterSlotState();
    if (myDraftSlotIndex < 0 || !activeDraft?.users) return slots;

    const myPicks = activeDraft.users[myDraftSlotIndex]?.picks || [];
    const playerById = new Map((players || []).map((player) => [String(player._id), player]));

    myPicks.forEach((pick) => {
      const pickPlayerId = String(pick?.playerId || '');
      const persistedPosition = normalizePosition(pick?.position);
      const pickPosition = (persistedPosition && persistedPosition !== 'P')
        ? persistedPosition
        : resolveRosterPosition(playerById.get(pickPlayerId));
      if (!pickPosition) return;
      occupySlotForPosition(slots, pickPosition);
    });

    return slots;
  }, [activeDraft, myDraftSlotIndex, players]);

  const myPitcherCount = (myPositionCounts.get('SP') || 0) + (myPositionCounts.get('RP') || 0);

  const remainingTurnSeconds = useMemo(() => {
    if (activeDraft?.status !== 'active' || !activeDraft?.turnEndsAt) return null;
    const endMs = new Date(activeDraft.turnEndsAt).getTime();
    if (!Number.isFinite(endMs)) return null;
    return Math.max(0, Math.ceil((endMs - draftNowMs) / 1000));
  }, [activeDraft?.status, activeDraft?.turnEndsAt, draftNowMs]);

  const timerLabel = useMemo(() => {
    if (remainingTurnSeconds === null) return '--:--';
    const minutes = Math.floor(remainingTurnSeconds / 60);
    const seconds = remainingTurnSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, [remainingTurnSeconds]);

  const pickedIds = useMemo(() => new Set((activeDraft?.pickedPlayerIds || []).map((id) => String(id))), [activeDraft?.pickedPlayerIds]);
  const playerById = useMemo(
    () => new Map((players || []).map((player) => [String(player._id), player])),
    [players]
  );
  const playerByName = useMemo(
    () => new Map((players || []).map((player) => [String(player.name || '').toLowerCase(), player])),
    [players]
  );

  const draftablePlayersForTeam = useMemo(() => {
    return (players || [])
      .filter((player) => !pickedIds.has(String(player._id)))
      .filter((player) => {
        if (myPickCount >= MAX_ROSTER_SIZE) return false;

        const rosterPosition = resolveRosterPosition(player);
        if (!rosterPosition) return false;

        return canFitOpenSlotForPosition(myOpenRosterSlots, rosterPosition);
      });
  }, [players, pickedIds, myOpenRosterSlots, myPickCount]);
  const draftPositionOptions = useMemo(() => {
    const uniquePositions = new Set();
    draftablePlayersForTeam.forEach((player) => {
      const normalizedPosition = normalizePosition(player.position);
      if (!normalizedPosition) return;
      // Only add non-pitcher positions
      if (normalizedPosition !== 'P') {
        uniquePositions.add(normalizedPosition);
      }
    });
    return Array.from(uniquePositions).sort((a, b) => a.localeCompare(b));
  }, [draftablePlayersForTeam]);

  const draftPitcherRoleOptions = useMemo(() => {
    const uniqueRoles = new Set();
    draftablePlayersForTeam.forEach((player) => {
      if (isPitcherPositionValue(player.position)) {
        const role = inferPitcherRosterRole(player);
        uniqueRoles.add(role);
      }
    });
    return Array.from(uniqueRoles).sort((a, b) => a.localeCompare(b));
  }, [draftablePlayersForTeam]);

  const draftCombinedOptions = useMemo(() => {
    const options = ['ALL'];
    // Add position options
    options.push(...draftPositionOptions);
    // Add pitcher role options
    options.push(...draftPitcherRoleOptions);
    return options;
  }, [draftPositionOptions, draftPitcherRoleOptions]);

  const getCombinedFilterLabel = (value) => {
    if (value === 'ALL') return 'All Positions & Roles';
    if (value === 'SP' || value === 'RP') return `${value} (Pitchers)`;
    return value;
  };

  const availablePlayers = useMemo(() => {
    const filter = draftCombinedPositionRoleFilter;
    const search = draftSearch.trim().toLowerCase();

    return draftablePlayersForTeam
      .filter((player) => {
        if (filter === 'ALL') return true;
        // If filter is a pitcher role (SP or RP)
        if (filter === 'SP' || filter === 'RP') {
          if (!isPitcherPositionValue(player.position)) return false;
          return inferPitcherRosterRole(player) === filter;
        }
        // Otherwise filter is a position
        return normalizePosition(player.position) === filter;
      })
      .filter((player) => {
        if (!search) return true;
        return String(player.name || '').toLowerCase().includes(search)
          || String(player.team || '').toLowerCase().includes(search)
          || String(player.position || '').toLowerCase().includes(search);
      })
      .sort((a, b) => {
        const pointsA = Number(draftFantasyPoints2025Cache[a._id]);
        const pointsB = Number(draftFantasyPoints2025Cache[b._id]);
        const normalizedA = Number.isFinite(pointsA) ? pointsA : -1;
        const normalizedB = Number.isFinite(pointsB) ? pointsB : -1;

        if (normalizedB !== normalizedA) {
          return normalizedB - normalizedA;
        }

        return String(a.name || '').localeCompare(String(b.name || ''));
      });
  }, [draftablePlayersForTeam, draftCombinedPositionRoleFilter, draftSearch, draftFantasyPoints2025Cache]);

  const getPickControlState = useCallback((player) => {
    const isPicking = pickingPlayerId === String(player?._id);
    const rosterPosition = resolveRosterPosition(player);
    const hasOpenSlot = canFitOpenSlotForPosition(myOpenRosterSlots, rosterPosition);
    const teamLimitReached = myRosterFull || !hasOpenSlot;
    const pickDisabled = !isMyTurn || isPicking || activeDraft?.status !== 'active' || teamLimitReached;

    let title = '';
    if (myRosterFull) {
      title = `Roster full (${MAX_ROSTER_SIZE} max)`;
    } else if (!hasOpenSlot) {
      title = `No open roster slot for ${rosterPosition || 'this player'}`;
    } else if (activeDraft?.status !== 'active') {
      title = 'Draft is not active';
    } else if (!isMyTurn) {
      title = 'It is not your turn';
    }

    let label = 'Pick';
    if (isPicking) {
      label = 'Picking...';
    } else if (myRosterFull) {
      label = 'Roster Full';
    } else if (!hasOpenSlot) {
      label = 'No Open Slot';
    }

    return {
      isPicking,
      rosterPosition,
      hasOpenSlot,
      teamLimitReached,
      pickDisabled,
      title,
      label
    };
  }, [pickingPlayerId, myOpenRosterSlots, myRosterFull, isMyTurn, activeDraft?.status, MAX_ROSTER_SIZE]);
  const pickTickerItems = useMemo(() => {
    return (activeDraft?.users || [])
      .flatMap((user) => (user.picks || []).map((pick) => ({
        playerId: pick.playerId,
        teamName: user.name,
        playerName: pick.playerName,
        round: pick.round,
        timestamp: pick.timestamp
      })))
      .sort((a, b) => {
        const roundDiff = Number(a.round || 0) - Number(b.round || 0);
        if (roundDiff !== 0) return roundDiff;
        return new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime();
      });
  }, [activeDraft?.users]);

  const latestPickSummary = useMemo(() => {
    if (pickTickerItems.length === 0) {
      return {
        playerName: 'Waiting for first pick',
        teamName: 'Draft in progress',
        team: '',
        fantasyPointsLabel: '2025 FP: --',
        photoUrl: getPlayerPhoto({ name: 'Draft Pick' }),
        teamLogo: ''
      };
    }

    const latestPick = pickTickerItems[pickTickerItems.length - 1];
    const byId = latestPick.playerId ? playerById.get(String(latestPick.playerId)) : null;
    const byName = !byId ? playerByName.get(String(latestPick.playerName || '').toLowerCase()) : null;
    const player = byId || byName || null;
    const resolvedPlayerId = String(player?._id || latestPick.playerId || '');
    const cachedPoints = resolvedPlayerId ? draftFantasyPoints2025Cache[resolvedPlayerId] : null;

    let fantasyPointsLabel = '2025 FP: N/A';
    if (cachedPoints === undefined) {
      fantasyPointsLabel = '2025 FP: ...';
    } else if (cachedPoints !== null && Number.isFinite(Number(cachedPoints))) {
      fantasyPointsLabel = `2025 FP: ${Math.round(Number(cachedPoints))}`;
    }

    return {
      playerName: latestPick.playerName,
      teamName: latestPick.teamName,
      round: latestPick.round,
      team: String(player?.team || ''),
      fantasyPointsLabel,
      photoUrl: getPlayerPhoto(player || { name: latestPick.playerName }),
      teamLogo: player?.team ? getTeamLogo(player.team) : ''
    };
  }, [pickTickerItems, playerById, playerByName, draftFantasyPoints2025Cache]);

  useEffect(() => {
    if (!activeDraftId || pickTickerItems.length === 0) {
      setShouldScrollTicker(false);
      return;
    }

    const measure = () => {
      const viewportEl = tickerViewportRef.current;
      const measureEl = tickerMeasureRef.current;
      if (!viewportEl || !measureEl) return;

      const needsScroll = measureEl.scrollWidth > (viewportEl.clientWidth + 2);
      setShouldScrollTicker(needsScroll);
    };

    const rafId = window.requestAnimationFrame(measure);
    window.addEventListener('resize', measure);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', measure);
    };
  }, [activeDraftId, pickTickerItems]);

  const fetchDraftPlayerStats = useCallback(async (playerId, season) => {
    if (!playerId || !season) return null;
    
    const cacheKey = `${playerId}-${season}`;
    if (Object.prototype.hasOwnProperty.call(draftPlayerStatsCacheRef.current, cacheKey)) {
      return draftPlayerStatsCacheRef.current[cacheKey];
    }
    
    try {
      const res = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/players/${playerId}/official-stats?season=${season}`);
      if (!res.ok) {
        setDraftPlayerStatsCache((prev) => ({
          ...prev,
          [cacheKey]: null
        }));
        return null;
      }
      
      const data = await res.json();
      setDraftPlayerStatsCache((prev) => ({
        ...prev,
        [cacheKey]: data?.stats || null
      }));
      return data?.stats || null;
    } catch {
      setDraftPlayerStatsCache((prev) => ({
        ...prev,
        [cacheKey]: null
      }));
      return null;
    }
  }, []);

  const fetchDraftModalFantasyPoints = useCallback(async (playerId, season) => {
    if (!playerId || !season) return null;

    const safePlayerId = String(playerId || '').trim();
    const seasonKey = String(season || '').trim();
    if (!safePlayerId || !seasonKey) return null;

    if (seasonKey === '2025' && draftFantasyPoints2025CacheRef.current[safePlayerId] !== undefined) {
      return draftFantasyPoints2025CacheRef.current[safePlayerId];
    }

    const cacheKey = `${safePlayerId}-${seasonKey}`;
    if (Object.prototype.hasOwnProperty.call(draftModalFantasyPointsCacheRef.current, cacheKey)) {
      return draftModalFantasyPointsCacheRef.current[cacheKey];
    }

    const inFlight = draftModalFantasyPointsInFlightRef.current.get(cacheKey);
    if (inFlight) return inFlight;

    const requestPromise = (async () => {
      try {
        const response = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/players/${safePlayerId}/fantasy-points?season=${seasonKey}`);
        if (!response.ok) throw new Error('Failed to load fantasy points');

        const data = await response.json();
        const points = Number(data?.totals?.fantasyPoints);
        const safePoints = Number.isFinite(points) ? points : 0;

        setDraftModalFantasyPointsCache((prev) => ({
          ...prev,
          [cacheKey]: safePoints
        }));

        if (seasonKey === '2025') {
          setDraftFantasyPoints2025Cache((prev) => ({
            ...prev,
            [safePlayerId]: safePoints
          }));
        }

        return safePoints;
      } catch {
        setDraftModalFantasyPointsCache((prev) => ({
          ...prev,
          [cacheKey]: null
        }));

        if (seasonKey === '2025') {
          setDraftFantasyPoints2025Cache((prev) => ({
            ...prev,
            [safePlayerId]: null
          }));
        }

        return null;
      } finally {
        draftModalFantasyPointsInFlightRef.current.delete(cacheKey);
      }
    })();

    draftModalFantasyPointsInFlightRef.current.set(cacheKey, requestPromise);
    return requestPromise;
  }, []);

  const fetchDraftFantasyPoints2025 = useCallback(async (playerId) => {
    const safePlayerId = String(playerId || '').trim();
    if (!safePlayerId) return null;

    const cached = draftFantasyPoints2025Cache[safePlayerId];
    if (cached !== undefined) return cached;

    const inFlight = draftFantasyPointsInFlightRef.current.get(safePlayerId);
    if (inFlight) return inFlight;

    const requestPromise = (async () => {
      try {
        const response = await fetch(`https://fantasy-baseball-o8ta.onrender.com/api/players/${safePlayerId}/fantasy-points?season=2025`);
        if (!response.ok) throw new Error('Failed to load 2025 fantasy points');

        const data = await response.json();
        const points = Number(data?.totals?.fantasyPoints);
        const safePoints = Number.isFinite(points) ? points : 0;

        setDraftFantasyPoints2025Cache((prev) => ({
          ...prev,
          [safePlayerId]: safePoints
        }));

        return safePoints;
      } catch {
        setDraftFantasyPoints2025Cache((prev) => ({
          ...prev,
          [safePlayerId]: null
        }));
        return null;
      } finally {
        draftFantasyPointsInFlightRef.current.delete(safePlayerId);
      }
    })();

    draftFantasyPointsInFlightRef.current.set(safePlayerId, requestPromise);
    return requestPromise;
  }, [draftFantasyPoints2025Cache]);

  useEffect(() => {
    if (!selectedDraftPlayer?._id) return;

    const seasons = getSeasonOptions(selectedDraftPlayer);
    const nextSeason = seasons[0] || '2026';
    setSelectedDraftPlayerSeason(nextSeason);
  }, [selectedDraftPlayer]);

  useEffect(() => {
    if (!selectedDraftPlayer?._id || !selectedDraftPlayerSeason) return;

    fetchDraftPlayerStats(selectedDraftPlayer._id, selectedDraftPlayerSeason);
    fetchDraftModalFantasyPoints(selectedDraftPlayer._id, selectedDraftPlayerSeason);
  }, [selectedDraftPlayer, selectedDraftPlayerSeason, fetchDraftPlayerStats, fetchDraftModalFantasyPoints]);

  useEffect(() => {
    if (!activeDraftId) return;

    const prioritizedPlayers = [];
    const prioritizedIds = new Set();

    draftablePlayersForTeam.forEach((player) => {
      const playerId = String(player?._id || '').trim();
      if (!playerId || prioritizedIds.has(playerId)) return;
      prioritizedIds.add(playerId);
      prioritizedPlayers.push(player);
    });

    (players || []).forEach((player) => {
      const playerId = String(player?._id || '').trim();
      if (!playerId || prioritizedIds.has(playerId)) return;
      prioritizedIds.add(playerId);
      prioritizedPlayers.push(player);
    });

    const missingPlayers = prioritizedPlayers.filter((player) => {
      const playerId = String(player?._id || '').trim();
      return playerId && draftFantasyPoints2025Cache[playerId] === undefined;
    });

    if (missingPlayers.length === 0) {
      if (!isDraftFantasySnapshotLoaded) {
        setIsDraftFantasySnapshotLoaded(true);
      }
      return;
    }

    if (isDraftFantasySnapshotLoaded) {
      setIsDraftFantasySnapshotLoaded(false);
    }

    let cancelled = false;
    let cursor = 0;
    const concurrency = Math.min(12, missingPlayers.length);

    const runWorker = async () => {
      while (!cancelled && cursor < missingPlayers.length) {
        const currentIndex = cursor;
        cursor += 1;
        const player = missingPlayers[currentIndex];
        if (!player?._id) continue;
        await fetchDraftFantasyPoints2025(player._id);
      }
    };

    Promise.all(Array.from({ length: concurrency }, () => runWorker())).then(() => {
      if (!cancelled) {
        setIsDraftFantasySnapshotLoaded(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    activeDraftId,
    draftFantasyPoints2025Cache,
    draftablePlayersForTeam,
    fetchDraftFantasyPoints2025,
    isDraftFantasySnapshotLoaded,
    players
  ]);

  if (activeDraftId) {
    const currentTurnUser = activeDraft?.users?.[activeDraft?.currentTurn] || null;
    const isOwner = activeDraftGroup?.ownerUserId === auth?.userId;
    const draftResultUsers = activeDraft?.users || [];
    const scrollingDraftResultUsers = draftResultUsers.length > 0
      ? [...draftResultUsers, ...draftResultUsers]
      : [];
    const scrollingPickTickerItems = pickTickerItems.length > 0
      ? (shouldScrollTicker && pickTickerItems.length > 1 ? [...pickTickerItems, ...pickTickerItems] : pickTickerItems)
      : [];

    return (
      <div className="draft-container groups-view-container draft-room-container">
        <div className="groups-page-header">
          <div>
            <h2>Draft Room</h2>
            <p className="groups-page-subtitle">{activeDraft?.name || 'Loading draft...'}</p>
          </div>
          <div className="groups-header-actions">
            <button type="button" className="draft-button groups-create-trigger" onClick={handleBackToGroups}>
              Back to Groups
            </button>
            {activeDraft?.status === 'setup' && (
              <button
                type="button"
                className="draft-button groups-create-trigger groups-start-draft-trigger"
                onClick={handleStartDraft}
                disabled={startingDraft || !isOwner}
                title={isOwner ? '' : 'Only the group owner can start the draft'}
              >
                {startingDraft ? 'Starting...' : (isOwner ? 'Start Draft' : 'Owner Starts Draft')}
              </button>
            )}
            {activeDraft?.status === 'active' && isOwner && (
              <button
                type="button"
                className="draft-button groups-create-trigger groups-end-draft-trigger"
                onClick={handleEndDraft}
                disabled={endingDraft}
              >
                {endingDraft ? 'Ending...' : 'End Draft'}
              </button>
            )}
          </div>
        </div>

        {groupStatusMessage && <p className="groups-status-message">{groupStatusMessage}</p>}

        {loadingActiveDraft || !activeDraft ? (
          <p className="group-empty">Loading draft...</p>
        ) : (
          <>
            <div className="broadcast-topline">
              <span className="broadcast-topline-pill">Live Draft Feed</span>
              <span>Round {activeDraft.currentRound || 1}</span>
              <span>{currentTurnUser ? `On the clock: ${currentTurnUser.name}` : 'Waiting to start'}</span>
            </div>

            {scrollingPickTickerItems.length > 0 && (
              <div className="draft-picks-ticker-strip" aria-label="Draft pick ticker" ref={tickerViewportRef}>
                <div className="draft-picks-ticker-track-measure" ref={tickerMeasureRef} aria-hidden="true">
                  {pickTickerItems.map((item, index) => (
                    <span key={`measure-${item.playerName}-${item.teamName}-${index}`} className="draft-picks-ticker-item">
                      Round {item.round}: {item.playerName} to {item.teamName}
                    </span>
                  ))}
                </div>
                <div className={`draft-picks-ticker-track ${shouldScrollTicker ? 'is-scrolling' : ''}`}>
                  {scrollingPickTickerItems.map((item, index) => (
                    <span key={`${item.playerName}-${item.teamName}-${index}`} className="draft-picks-ticker-item">
                      Round {item.round}: {item.playerName} to {item.teamName}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="draft-status">
              <div className="current-drafter">
                <h3 className="broadcast-status-title">
                  <span>Draft Status</span>
                  <span>{activeDraft.status}</span>
                </h3>
                <div className={`timer${remainingTurnSeconds !== null && remainingTurnSeconds > 0 ? ' is-counting' : ''}`}>
                  {timerLabel}
                </div>
                <p className="broadcast-callout">{isMyTurn ? 'You are on the clock' : 'Stand by for your next pick'}</p>
                <p>Round {activeDraft.currentRound || 1}</p>
                <p>{currentTurnUser ? `On the clock: ${currentTurnUser.name}` : 'Waiting to start'}</p>
                <p>Pitchers {myPitcherCount}/{MAX_PITCHERS_PER_TEAM}</p>
                {myRosterFull && (
                  <p className="roster-full-badge">✓ Roster Full ({MAX_ROSTER_SIZE}/{MAX_ROSTER_SIZE})</p>
                )}
              </div>

              <div className="latest-pick-summary" aria-live="polite">
                <h4 className="latest-pick-summary-title">Most Recent Pick</h4>
                <div className="latest-pick-summary-body">
                  <img
                    src={latestPickSummary.photoUrl}
                    alt={latestPickSummary.playerName}
                    className="latest-pick-summary-photo"
                  />
                  <div className="latest-pick-summary-meta">
                    <p className="latest-pick-summary-player">{latestPickSummary.playerName}</p>
                    <p className="latest-pick-summary-draft-team">{latestPickSummary.teamName}</p>
                    <div className="latest-pick-summary-mlb-team">
                      {latestPickSummary.teamLogo && (
                        <img
                          src={latestPickSummary.teamLogo}
                          alt={latestPickSummary.team}
                          className="latest-pick-summary-team-logo"
                        />
                      )}
                      <span>{latestPickSummary.team || 'Team N/A'}</span>
                    </div>
                    <p className="latest-pick-summary-fp">{latestPickSummary.fantasyPointsLabel}</p>
                  </div>
                </div>
              </div>

              <div className="round-info">
                <div className="broadcast-metric-tile">
                  <span>Draft Type</span>
                  <strong>{activeDraft.draftType}</strong>
                </div>
                <div className="broadcast-metric-tile">
                  <span>Teams</span>
                  <strong>{activeDraft.users?.length || 0}</strong>
                </div>
                <div className="broadcast-metric-tile">
                  <span>Picked</span>
                  <strong>{activeDraft.pickedPlayerIds?.length || 0}</strong>
                </div>
                <div className="broadcast-metric-tile">
                  <span>Available</span>
                  <strong>{availablePlayers.length}</strong>
                </div>
              </div>
            </div>

            <div className="draft-board draft-board-single">
              <section className="section">
                <h4>Available Players</h4>
                <div className="draft-search-wrap">
                  <input
                    type="text"
                    className="draft-search-input"
                    value={draftSearch}
                    onChange={(event) => setDraftSearch(event.target.value)}
                    placeholder="Search available players"
                  />
                  <div className="draft-filters-stack">
                    <div className="draft-filter-group">
                      <select
                        className="draft-position-filter"
                        value={draftCombinedPositionRoleFilter}
                        onChange={(event) => setDraftCombinedPositionRoleFilter(event.target.value)}
                      >
                        {draftCombinedOptions.map((optionValue) => (
                          <option key={optionValue} value={optionValue}>
                            {getCombinedFilterLabel(optionValue)}
                          </option>
                        ))}
                      </select>
                      {draftCombinedPositionRoleFilter !== 'ALL' && (
                        <button type="button" className="draft-filter-clear" onClick={() => setDraftCombinedPositionRoleFilter('ALL')}>
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  {!!draftSearch && (
                    <button type="button" className="draft-search-clear" onClick={() => setDraftSearch('')}>
                      Clear
                    </button>
                  )}
                </div>
                <p className="draft-search-count">{availablePlayers.length} available</p>
                <div className="player-grid">
                  {availablePlayers.slice(0, 150).map((player) => {
                    const pickState = getPickControlState(player);
                    const fantasyPoints2025 = draftFantasyPoints2025Cache[player._id];
                    const fantasyPointsLabel = fantasyPoints2025 === undefined
                      ? '2025 FP: ...'
                      : fantasyPoints2025 === null
                        ? '2025 FP: N/A'
                        : `2025 FP: ${Math.round(fantasyPoints2025)}`;

                    return (
                      <div key={player._id} className={`player-card${pickState.teamLimitReached ? ' position-limit-hit' : ''}`} onClick={() => {
                        setSelectedDraftPlayer(player);
                      }} style={{ cursor: 'pointer' }}>
                        <img
                          src={getPlayerPhoto(player)}
                          alt={player.name}
                          className="draft-player-photo"
                        />
                        <div className="player-name">{player.name}</div>
                        <div className="player-info">
                          <img src={getTeamLogo(player.team)} alt={player.team} className="draft-team-logo" />
                          <span>
                            {player.team} •{' '}
                            {isPitcherPositionValue(player.position)
                              ? `${inferPitcherRosterRole(player)} (${player.position})`
                              : player.position}
                          </span>
                        </div>
                        <div className="player-stat">{fantasyPointsLabel}</div>
                        <div className="player-card-actions">
                          <button
                            type="button"
                            className={`pick-player-btn${pickState.teamLimitReached ? ' limit-reached' : ''}`}
                            disabled={pickState.pickDisabled}
                            onClick={(event) => {
                              event.stopPropagation();
                              handlePickPlayer(player);
                            }}
                            title={pickState.title}
                          >
                            {pickState.label}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <h4 className="draft-results-heading">Team Draft Boards</h4>
            {scrollingDraftResultUsers.length === 0 ? (
              <p className="group-empty">No draft results yet.</p>
            ) : (
              <div className="draft-results-strip">
                <div className="draft-results">
                  {scrollingDraftResultUsers.map((user, index) => (
                    <div key={`${user.userId || user.name}-${index}`} className="user-picks">
                      <strong>{user.name}</strong>
                      <ul>
                        {(user.picks || []).length === 0 ? (
                          <li>No picks yet</li>
                        ) : (
                          (user.picks || []).map((pick, pickIndex) => (
                            <li key={`${pick.playerId}-${index}-${pickIndex}`}>Round {pick.round}: {pick.playerName}</li>
                          ))
                        )}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {selectedDraftPlayer && (
          <div className="player-modal-overlay" onClick={() => setSelectedDraftPlayer(null)}>
            <div className="player-modal" onClick={(e) => e.stopPropagation()}>
              {(() => {
                const pickState = getPickControlState(selectedDraftPlayer);
                return (
                  <>
              <div className="player-modal-header">
                <div className="player-modal-title">
                  <img src={getPlayerPhoto(selectedDraftPlayer)} alt={selectedDraftPlayer.name} className="player-modal-photo" />
                  <div>
                    <h3>{selectedDraftPlayer.name}</h3>
                    <p>{selectedDraftPlayer.team} • {isPitcherPositionValue(selectedDraftPlayer.position) ? `${inferPitcherRosterRole(selectedDraftPlayer)} (${selectedDraftPlayer.position})` : selectedDraftPlayer.position}</p>
                  </div>
                </div>
                <button className="player-modal-close" onClick={() => setSelectedDraftPlayer(null)}>✕</button>
              </div>

              <div className="season-tabs">
                {getSeasonOptions(selectedDraftPlayer).map((season) => (
                  <button
                    key={season}
                    className={`season-tab ${selectedDraftPlayerSeason === season ? 'active' : ''}`}
                    onClick={() => setSelectedDraftPlayerSeason(season)}
                  >
                    {season}
                  </button>
                ))}
              </div>

              <div className="player-stats-grid">
                {selectedDraftPlayer && selectedDraftPlayerSeason && (
                  <div className="player-stat-item player-fantasy-points">
                    <span className="stat-label">Fantasy Points: </span>
                    <span className="stat-value">
                      {getDraftModalFantasyPoints(selectedDraftPlayer, selectedDraftPlayerSeason) === undefined
                        ? 'Loading...'
                        : getDraftModalFantasyPoints(selectedDraftPlayer, selectedDraftPlayerSeason) === null
                          ? 'N/A'
                          : Math.round(getDraftModalFantasyPoints(selectedDraftPlayer, selectedDraftPlayerSeason))}
                    </span>
                  </div>
                )}
                {getPlayerStatsList(
                  selectedDraftPlayer,
                  selectedDraftPlayerSeason,
                  selectedDraftPlayer && selectedDraftPlayerSeason
                    ? draftPlayerStatsCache[`${selectedDraftPlayer._id}-${selectedDraftPlayerSeason}`]
                    : null
                ).length > 0 ? (
                  getPlayerStatsList(
                    selectedDraftPlayer,
                    selectedDraftPlayerSeason,
                    selectedDraftPlayer && selectedDraftPlayerSeason
                      ? draftPlayerStatsCache[`${selectedDraftPlayer._id}-${selectedDraftPlayerSeason}`]
                      : null
                  ).map((stat) => (
                    <div key={stat.key} className="player-stat-item">
                      <span className="stat-label">{stat.label}: </span>
                      <span className="stat-value">{formatStatValue(stat)}</span>
                    </div>
                  ))
                ) : draftPlayerStatsCache[`${selectedDraftPlayer._id}-${selectedDraftPlayerSeason}`] === undefined ? (
                  <div className="player-stat-item">
                    <span className="stat-label">Loading stats...</span>
                  </div>
                ) : (
                  <div className="player-stat-item">
                    <span className="stat-label">No stats available for this season.</span>
                  </div>
                )}
              </div>

              <div className="player-card-actions">
                <button
                  type="button"
                  className={`pick-player-btn${pickState.teamLimitReached ? ' limit-reached' : ''}`}
                  disabled={pickState.pickDisabled}
                  onClick={async () => {
                    const didPick = await handlePickPlayer(selectedDraftPlayer);
                    if (didPick) {
                      setSelectedDraftPlayer(null);
                    }
                  }}
                  title={pickState.title}
                >
                  {pickState.label}
                </button>
              </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="draft-container groups-view-container">
      <div className="groups-page-header">
        <div>
          <h2>My Groups</h2>
          <p className="groups-page-subtitle">Create a group, then click into it to see every team in that room.</p>
        </div>

        <div className="groups-header-actions">
          {!isJoiningGroup ? (
            <button
              type="button"
              className="draft-button groups-create-trigger"
              onClick={() => {
                setGroupStatusMessage('');
                setIsCreatingGroup(false);
                setIsJoiningGroup(true);
              }}
            >
              Join Group
            </button>
          ) : (
            <div className="groups-create-panel">
              <input
                type="text"
                value={groupInviteCode}
                onChange={(event) => setGroupInviteCode(event.target.value.toUpperCase())}
                placeholder="Enter invite code"
                className="groups-create-input"
                autoFocus
              />
              <div className="groups-create-actions">
                <button
                  type="button"
                  className="draft-button groups-create-confirm"
                  onClick={handleJoinGroup}
                  disabled={joiningGroup || !groupInviteCode.trim()}
                >
                  {joiningGroup ? 'Joining...' : 'Join'}
                </button>
                <button
                  type="button"
                  className="draft-button groups-create-cancel"
                  onClick={() => {
                    setGroupInviteCode('');
                    setIsJoiningGroup(false);
                    setGroupStatusMessage('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!isCreatingGroup ? (
            <button
              type="button"
              className="draft-button groups-create-trigger"
              onClick={() => {
                setGroupStatusMessage('');
                setIsJoiningGroup(false);
                setIsCreatingGroup(true);
              }}
            >
              Create Group
            </button>
          ) : (
            <div className="groups-create-panel">
              <input
                type="text"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Enter group name"
                className="groups-create-input"
                autoFocus
              />
              <input
                type="datetime-local"
                value={groupDraftDateTime}
                onChange={(event) => setGroupDraftDateTime(event.target.value)}
                className="groups-create-input groups-create-input-secondary"
              />
              <select
                value={groupDraftType}
                onChange={(event) => setGroupDraftType(event.target.value)}
                className="groups-create-input groups-create-input-secondary"
              >
                <option value="snake">Snake Draft</option>
                <option value="round-robin">Round Robin Draft</option>
              </select>
              <div className="groups-create-actions">
                <button
                  type="button"
                  className="draft-button groups-create-confirm"
                  onClick={handleCreateGroup}
                  disabled={creatingGroup || !groupName.trim()}
                >
                  {creatingGroup ? 'Creating...' : 'Save'}
                </button>
                <button
                  type="button"
                  className="draft-button groups-create-cancel"
                  onClick={() => {
                    setGroupName('');
                    setGroupDraftDateTime('');
                    setGroupDraftType('snake');
                    setIsCreatingGroup(false);
                    setGroupStatusMessage('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {groupStatusMessage && <p className="groups-status-message">{groupStatusMessage}</p>}

      <div className="groups-layout">
        <section className="groups-list-panel">
          <h3>Your Groups</h3>
          {loadingGroups ? (
            <p className="group-empty">Loading groups...</p>
          ) : groups.length === 0 ? (
            <p className="group-empty">No groups yet. Create one to get started.</p>
          ) : (
            <div className="group-list">
              {groups.map((group) => {
                const isSelected = group._id === selectedGroupId;

                return (
                  <button
                    type="button"
                    key={group._id}
                    className={`group-list-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedGroupId(group._id)}
                  >
                    <div className="group-list-top">
                      <strong>{group.name}</strong>
                    </div>
                    <div className="group-list-meta">
                      <span className="group-list-draft-date">Draft: {toDisplayDateTime(group.draftScheduledAt)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="groups-detail-panel">
          {!selectedGroup ? (
            <div className="groups-detail-empty">
              <h3>Select a Group</h3>
              <p>Choose a group from the list to view every team in it.</p>
            </div>
          ) : (
            <>
              {(() => {
                const selectedGroupMembers = selectedGroup.members || [];
                const ownerMember = selectedGroupMembers.find((member) => member.userId === selectedGroup.ownerUserId);
                const ownerName = selectedGroup.ownerUserId === auth?.userId
                  ? (auth?.username || ownerMember?.username || 'Group owner')
                  : (ownerMember?.username || 'Group owner');
                const draftIsScheduled = Boolean(selectedGroup.draftScheduledAt);
                const draftDisplay = toDisplayDateParts(selectedGroup.draftScheduledAt);
                const draftOrderLookup = new Map(selectedGroupMembers.map((member) => [String(member.userId), member]));
                const orderedDraftMembers = draftOrderUserIds
                  .map((userId) => draftOrderLookup.get(String(userId)))
                  .filter(Boolean);

                return (
                  <>
                    <div className="groups-detail-header groups-detail-header-enhanced">
                      <div>
                        <h3>{selectedGroup.name}</h3>
                        <div className="groups-detail-chips">
                          <span className="groups-detail-chip">{selectedGroupMembers.length} teams</span>
                          <span className="groups-detail-chip">Owner: {ownerName}</span>
                          <span className={`groups-detail-chip ${draftIsScheduled ? 'ready' : 'pending'}`}>
                            {draftIsScheduled ? 'Draft Scheduled' : 'Needs Draft Time'}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="groups-owner-action groups-join-draft-action"
                        onClick={handleJoinDraft}
                        disabled={!draftIsScheduled || joiningDraftId === selectedGroup._id}
                      >
                        {!draftIsScheduled
                          ? 'Set Draft Time First'
                          : (joiningDraftId === selectedGroup._id ? 'Joining Draft...' : 'Join Draft Room')}
                      </button>
                    </div>

                    <div className="groups-info-toggle-row">
                      <button
                        type="button"
                        className={`groups-owner-action groups-info-toggle ${isGroupInfoOpen ? 'open' : ''}`}
                        onClick={() => setIsGroupInfoOpen((current) => !current)}
                        aria-expanded={isGroupInfoOpen}
                      >
                        <span>{isGroupInfoOpen ? 'Hide Group Info' : 'Show Group Info'}</span>
                        <span className="groups-info-toggle-chevron" aria-hidden="true">▾</span>
                      </button>
                    </div>

                    {isGroupInfoOpen && (
                      <>
                        <div className="groups-overview-grid">
                          <article className="groups-overview-card groups-overview-card-invite">
                            <p className="groups-overview-label">Invite Code</p>
                            <p className="groups-overview-value">{selectedGroup.inviteCode}</p>
                            <button type="button" className="groups-owner-action" onClick={handleCopyInviteCode}>
                              Copy Invite Code
                            </button>
                          </article>

                          <article className="groups-overview-card groups-overview-card-draft-time">
                            <p className="groups-overview-label">Draft Time</p>
                            <div className="groups-overview-value groups-overview-value-multi groups-overview-draft-time-value">
                              <span className="groups-overview-draft-time-date">{draftDisplay.date}</span>
                              {draftDisplay.time ? (
                                <span className="groups-overview-draft-time-time">{draftDisplay.time}</span>
                              ) : null}
                            </div>
                            <p className="groups-overview-subtext groups-overview-draft-time-subtext">{toRelativeDraftLabel(selectedGroup.draftScheduledAt)}</p>
                          </article>

                          <article className="groups-overview-card">
                            <p className="groups-overview-label">Team Summary</p>
                            <p className="groups-overview-value">{selectedGroupMembers.length} teams</p>
                            <p className="groups-overview-subtext">
                              {isSelectedGroupOwner ? 'You manage this group' : 'You are a member of this group'}
                            </p>
                          </article>
                        </div>

                        {isSelectedGroupOwner && (
                          <div className="groups-owner-actions-panel">
                            <p className="groups-overview-label groups-owner-actions-title">Owner Tools</p>
                            <div className="groups-owner-actions">
                              {!isEditingGroupName ? (
                                <button
                                  type="button"
                                  className="groups-owner-action"
                                  onClick={() => {
                                    setEditingGroupName(selectedGroup.name || '');
                                    setIsEditingGroupName(true);
                                    setGroupStatusMessage('');
                                  }}
                                >
                                  Rename Group
                                </button>
                              ) : null}
                              {!isEditingDraftSchedule ? (
                                <button
                                  type="button"
                                  className="groups-owner-action"
                                  onClick={() => {
                                    setEditingDraftDateTime(toDateTimeInputValue(selectedGroup.draftScheduledAt));
                                    setIsEditingDraftSchedule(true);
                                    setGroupStatusMessage('');
                                  }}
                                >
                                  Set Draft Time
                                </button>
                              ) : null}
                              {!isEditingDraftOrder ? (
                                <button
                                  type="button"
                                  className="groups-owner-action"
                                  onClick={() => {
                                    setDraftOrderUserIds(buildDraftOrderIdsForGroup(selectedGroup));
                                    setIsEditingDraftOrder(true);
                                    setGroupStatusMessage('');
                                  }}
                                >
                                  Edit Draft Order
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="groups-owner-action groups-owner-action-danger"
                                onClick={handleDeleteGroup}
                                disabled={deletingGroupId === selectedGroup._id}
                              >
                                {deletingGroupId === selectedGroup._id ? 'Deleting...' : 'Delete Group'}
                              </button>
                            </div>
                          </div>
                        )}

                        {isSelectedGroupOwner && isEditingDraftOrder && (
                          <div className="groups-draft-order-panel">
                            <p className="groups-overview-label groups-owner-actions-title">Draft Order</p>
                            <p className="groups-overview-subtext">The order below will be used when this group draft starts.</p>
                            <div className="groups-draft-order-list">
                              {orderedDraftMembers.map((member, index) => {
                                const memberDisplayName = member.userId === auth?.userId
                                  ? (auth?.username || member.username)
                                  : member.username;
                                const isOwner = member.userId === selectedGroup.ownerUserId;

                                return (
                                  <div className="groups-draft-order-item" key={member.userId}>
                                    <div className="groups-draft-order-rank">{index + 1}</div>
                                    <div className="groups-draft-order-name-wrap">
                                      <strong>{memberDisplayName}</strong>
                                      {isOwner ? <span className="group-role-badge owner">Owner</span> : null}
                                    </div>
                                    <div className="groups-draft-order-actions">
                                      <button
                                        type="button"
                                        className="groups-owner-action"
                                        onClick={() => moveDraftOrderMember(index, index - 1)}
                                        disabled={index === 0 || savingDraftOrder}
                                      >
                                        Up
                                      </button>
                                      <button
                                        type="button"
                                        className="groups-owner-action"
                                        onClick={() => moveDraftOrderMember(index, index + 1)}
                                        disabled={index === orderedDraftMembers.length - 1 || savingDraftOrder}
                                      >
                                        Down
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="groups-create-actions groups-schedule-actions">
                              <button
                                type="button"
                                className="draft-button groups-create-confirm groups-schedule-button"
                                onClick={handleSaveDraftOrder}
                                disabled={savingDraftOrder || orderedDraftMembers.length === 0}
                              >
                                {savingDraftOrder ? 'Saving...' : 'Save Draft Order'}
                              </button>
                              <button
                                type="button"
                                className="draft-button groups-create-cancel groups-schedule-button"
                                onClick={() => {
                                  setIsEditingDraftOrder(false);
                                  setDraftOrderUserIds(buildDraftOrderIdsForGroup(selectedGroup));
                                }}
                                disabled={savingDraftOrder}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {isSelectedGroupOwner && isEditingDraftSchedule && (
                          <div className="groups-rename-panel">
                            <input
                              type="datetime-local"
                              value={editingDraftDateTime}
                              onChange={(event) => setEditingDraftDateTime(event.target.value)}
                              className="groups-create-input"
                            />
                            <div className="groups-create-actions groups-schedule-actions">
                              <button
                                type="button"
                                className="draft-button groups-create-confirm groups-schedule-button"
                                onClick={handleSaveDraftSchedule}
                                disabled={savingDraftSchedule}
                              >
                                {savingDraftSchedule ? 'Saving...' : 'Save Draft Time'}
                              </button>
                              <button
                                type="button"
                                className="draft-button groups-create-cancel groups-schedule-button"
                                onClick={() => {
                                  setEditingDraftDateTime('');
                                }}
                                disabled={savingDraftSchedule}
                              >
                                Clear
                              </button>
                              <button
                                type="button"
                                className="draft-button groups-create-cancel groups-schedule-button"
                                onClick={() => {
                                  setIsEditingDraftSchedule(false);
                                  setEditingDraftDateTime(toDateTimeInputValue(selectedGroup.draftScheduledAt));
                                }}
                                disabled={savingDraftSchedule}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {isSelectedGroupOwner && isEditingGroupName && (
                          <div className="groups-rename-panel">
                            <input
                              type="text"
                              value={editingGroupName}
                              onChange={(event) => setEditingGroupName(event.target.value)}
                              className="groups-create-input"
                              placeholder="Group name"
                            />
                            <div className="groups-create-actions">
                              <button
                                type="button"
                                className="draft-button groups-create-confirm"
                                onClick={handleRenameGroup}
                                disabled={savingGroupName || !editingGroupName.trim()}
                              >
                                {savingGroupName ? 'Saving...' : 'Save Name'}
                              </button>
                              <button
                                type="button"
                                className="draft-button groups-create-cancel"
                                onClick={() => {
                                  setIsEditingGroupName(false);
                                  setEditingGroupName(selectedGroup.name || '');
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="group-members-grid">
                          {selectedGroupMembers.map((member) => {
                            const isOwner = member.userId === selectedGroup.ownerUserId;
                            const isMe = member.userId === auth?.userId;
                            const memberDisplayName = isMe
                              ? (auth?.username || member.username)
                              : member.username;
                            const teamLabel = `${memberDisplayName}'s Team`;

                            return (
                              <article key={member.userId} className="group-member-card">
                                <div className="group-member-top">
                                  <div className="group-member-heading">
                                    <div className="group-member-avatar">{getInitials(memberDisplayName)}</div>
                                    <div>
                                      <h4>{teamLabel}</h4>
                                      <p className="group-member-meta">Joined {new Date(member.joinedAt || selectedGroup.createdAt).toLocaleDateString()}</p>
                                    </div>
                                  </div>
                                  <span className={`group-role-badge ${isOwner ? 'owner' : 'member'}`}>
                                    {isOwner ? 'Owner' : 'Team'}
                                  </span>
                                </div>
                                <p className="group-member-note">{isMe ? 'This is your team.' : 'Group member team.'}</p>
                              </article>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default Draft;