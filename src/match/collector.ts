import { EventEmitter } from 'events';
import {
  RLEvent,
  UpdateStatePayload,
  StatfeedPayload,
  GoalScoredPayload,
  MatchEndedPayload,
  PlayerState,
  PlayerRef,
} from '../socket/events';

export interface StateSample {
  timestamp: number;
  gameTime: number;
  players: Record<string, PlayerSnapshot>;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  boost: number;
  shots: number;
  goals: number;
  saves: number;
  assists: number;
  demos: number;
  touches: number;
  team: number;
  me: boolean;
}

export interface StatfeedEntry {
  timestamp: number;
  eventName: string;
  mainTarget: PlayerRef;
  secondaryTarget: PlayerRef | null;
}

export interface GoalEntry {
  timestamp: number;
  gameTime: number;
  scorer: PlayerRef;
  assister: PlayerRef | null;
  teamNum: number;
}

export interface DemoEntry {
  timestamp: number;
  attacker: PlayerRef;
  victim: PlayerRef;
}

export interface MatchBuffer {
  matchId: string;
  playlist: string;
  startTime: number;
  localPlayerId: string | null;
  localPlayerTeam: number;
  stateSamples: StateSample[];
  statfeedEvents: StatfeedEntry[];
  goals: GoalEntry[];
  demoEvents: DemoEntry[];
  isComplete: boolean;
  winnerTeamNum: number | null;
}

function mapPlaylist(raw: string | undefined): string {
  if (!raw) return 'default';
  const lower = raw.toLowerCase();
  if (lower.includes('1v1') || lower.includes('duel')) return 'ranked_duels';
  if (lower.includes('2v2') || lower.includes('doubles')) return 'ranked_doubles';
  if (lower.includes('3v3') || lower.includes('standard')) return 'ranked_standard';
  return 'default';
}

function snapshotPlayer(p: PlayerState): PlayerSnapshot {
  return {
    id: p.id,
    name: p.name,
    boost: p.boost,
    shots: p.shots,
    goals: p.goals,
    saves: p.saves,
    assists: p.assists,
    demos: p.demos,
    touches: p.touches,
    team: p.team,
    me: p.me ?? false,
  };
}

export class MatchCollector extends EventEmitter {
  private buffer: MatchBuffer | null = null;

  get isMatchActive(): boolean {
    return this.buffer !== null;
  }

  handle(event: RLEvent): void {
    switch (event.event) {
      case 'game:match_created':
      case 'game:initialized':
      case 'game:pre_countdown_begin':
        this._startMatch();
        break;

      case 'game:update_state':
        this._handleUpdateState(event.data as UpdateStatePayload);
        break;

      case 'game:statfeed_event':
        this._handleStatfeed(event.data as StatfeedPayload);
        break;

      case 'game:goal_scored':
        this._handleGoal(event.data as GoalScoredPayload);
        break;

      case 'game:match_ended':
      case 'game:podium_start':
        this._handleMatchEnd(event.data as MatchEndedPayload);
        break;
    }
  }

  discardIfActive(): void {
    if (this.buffer) {
      this.buffer = null;
      this.emit('match:discard');
    }
  }

  private _startMatch(): void {
    if (this.buffer) return; // already tracking
    this.buffer = {
      matchId: `match-${Date.now()}`,
      playlist: 'default',
      startTime: Date.now(),
      localPlayerId: null,
      localPlayerTeam: 0,
      stateSamples: [],
      statfeedEvents: [],
      goals: [],
      demoEvents: [],
      isComplete: false,
      winnerTeamNum: null,
    };
    this.emit('match:start');
  }

  private _handleUpdateState(payload: UpdateStatePayload): void {
    if (!payload.hasGame) return;

    if (!this.buffer) {
      // Started capturing mid-match
      this._startMatch();
    }
    const buf = this.buffer!;

    // Detect local player on first occurrence
    if (!buf.localPlayerId) {
      const entry = Object.entries(payload.players).find(([, p]) => p.me === true);
      if (entry) {
        buf.localPlayerId = entry[0];
        buf.localPlayerTeam = entry[1].team;
      }
    }

    // Update playlist from game state
    if (payload.game.playlist) {
      buf.playlist = mapPlaylist(payload.game.playlist);
    }

    // Sample current state
    const sample: StateSample = {
      timestamp: Date.now(),
      gameTime: payload.game.time,
      players: Object.fromEntries(
        Object.entries(payload.players).map(([id, p]) => [id, snapshotPlayer(p)])
      ),
    };
    buf.stateSamples.push(sample);
  }

  private _handleStatfeed(payload: StatfeedPayload): void {
    if (!this.buffer) return;

    this.buffer.statfeedEvents.push({
      timestamp: Date.now(),
      eventName: payload.event_name,
      mainTarget: payload.main_target,
      secondaryTarget: payload.secondary_target,
    });

    if (payload.event_name === 'Demo') {
      this.buffer.demoEvents.push({
        timestamp: Date.now(),
        attacker: payload.main_target,
        victim: payload.secondary_target ?? payload.main_target,
      });
    }
  }

  private _handleGoal(payload: GoalScoredPayload): void {
    if (!this.buffer) return;
    this.buffer.goals.push({
      timestamp: Date.now(),
      gameTime: payload.goaltime,
      scorer: payload.scorer,
      assister: payload.assister,
      teamNum: payload.team_num,
    });
  }

  private _handleMatchEnd(payload: MatchEndedPayload): void {
    if (!this.buffer) return;
    this.buffer.isComplete = true;
    this.buffer.winnerTeamNum = payload?.winner_team_num ?? null;
    const completed = this.buffer;
    this.buffer = null;
    this.emit('match:end', completed);
  }
}
