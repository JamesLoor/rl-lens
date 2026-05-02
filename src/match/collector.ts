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
  players: PlayerSnapshot[];
}

export interface PlayerSnapshot {
  name: string;
  primaryId: string;
  shortcut: number;
  teamNum: number;
  boost: number | undefined;
  speed: number | undefined;
  bSupersonic: boolean | undefined;
  shots: number;
  goals: number;
  saves: number;
  assists: number;
  demos: number;
  touches: number;
}

export interface StatfeedEntry {
  timestamp: number;
  eventName: string;
  mainTarget: PlayerRef;
  secondaryTarget: PlayerRef | undefined;
}

export interface GoalEntry {
  timestamp: number;
  goalTime: number;
  scorer: PlayerRef;
  assister: PlayerRef | undefined;
  teamNum: number;
}

export interface DemoEntry {
  timestamp: number;
  attacker: PlayerRef;
  victim: PlayerRef;
}

export interface MatchBuffer {
  matchId: string;
  startTime: number;
  localPlayerName: string | null;
  localPlayerTeam: number;
  playlist: string;
  roundActive: boolean;
  finalTeamScores: { teamNum: number; score: number }[];
  stateSamples: StateSample[];
  statfeedEvents: StatfeedEntry[];
  goals: GoalEntry[];
  demoEvents: DemoEntry[];
  winnerTeamNum: number | null;
}

function snapshotPlayer(p: PlayerState): PlayerSnapshot {
  return {
    name: p.Name,
    primaryId: p.PrimaryId,
    shortcut: p.Shortcut,
    teamNum: p.TeamNum,
    boost: p.Boost,
    speed: p.Speed,
    bSupersonic: p.bSupersonic,
    shots: p.Shots,
    goals: p.Goals,
    saves: p.Saves,
    assists: p.Assists,
    demos: p.Demos,
    touches: p.Touches,
  };
}

export class MatchCollector extends EventEmitter {
  private buffer: MatchBuffer | null = null;

  get isMatchActive(): boolean {
    return this.buffer !== null;
  }

  handle(event: RLEvent): void {
    switch (event.Event) {
      case 'MatchCreated':
      case 'MatchInitialized':
        this._startMatch();
        break;

      case 'UpdateState':
        this._handleUpdateState(event.Data as UpdateStatePayload);
        break;

      case 'StatfeedEvent':
        this._handleStatfeed(event.Data as StatfeedPayload);
        break;

      case 'GoalScored':
        this._handleGoal(event.Data as GoalScoredPayload);
        break;

      case 'MatchEnded':
      case 'PodiumStart':
        this._handleMatchEnd(event.Data as MatchEndedPayload);
        break;

      case 'CountdownBegin':
      case 'RoundStarted':
        if (this.buffer && !this.buffer.roundActive) {
          this.buffer.roundActive = true;
          this.emit('round:active');
        }
        break;

      case 'MatchDestroyed':
        this.discardIfActive();
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
    if (this.buffer) return;
    this.buffer = {
      matchId: `match-${Date.now()}`,
      startTime: Date.now(),
      localPlayerName: null,
      localPlayerTeam: 0,
      playlist: 'default',
      roundActive: false,
      finalTeamScores: [],
      stateSamples: [],
      statfeedEvents: [],
      goals: [],
      demoEvents: [],
      winnerTeamNum: null,
    };
    this.emit('match:start');
  }

  private _handleUpdateState(payload: UpdateStatePayload): void {
    if (!this.buffer) return;
    const buf = this.buffer!;

    // Track local player from camera Target on every non-replay frame.
    // We don't guard on !localPlayerName so a bad first frame can't get stuck.
    if (payload.Game.bHasTarget && payload.Game.Target && !payload.Game.bReplay) {
      buf.localPlayerName = payload.Game.Target.Name;
      buf.localPlayerTeam = payload.Game.Target.TeamNum;
    }

    // Keep authoritative team scores from game state (more reliable than counting GoalScored events)
    if (payload.Game.Teams?.length > 0) {
      buf.finalTeamScores = payload.Game.Teams.map(t => ({ teamNum: t.TeamNum, score: t.Score }));
    }

    // Detect playlist from arena name + player count.
    // Arena-based modes are locked as soon as detected.
    // Player-count modes only upgrade (duels→doubles→standard) as more players load in.
    if (payload.Players.length > 0 && !['hoops', 'dropshot', 'snowday'].includes(buf.playlist)) {
      const arenaRaw = payload.Game.Arena ?? '';
      const arena = arenaRaw.toLowerCase();

      if (arena.includes('hoops')) {
        buf.playlist = 'hoops';
        this.emit('playlist_detected', { arena: arenaRaw, playlist: buf.playlist, maxPerTeam: 0 });
      } else if (arena.includes('shattershot')) {
        buf.playlist = 'dropshot';
        this.emit('playlist_detected', { arena: arenaRaw, playlist: buf.playlist, maxPerTeam: 0 });
      } else if (arena.includes('hockey') || arena.includes('snowday') || arena.includes('farm_night')) {
        buf.playlist = 'snowday';
        this.emit('playlist_detected', { arena: arenaRaw, playlist: buf.playlist, maxPerTeam: 0 });
      } else {
        const perTeam = new Map<number, number>();
        for (const p of payload.Players) {
          perTeam.set(p.TeamNum, (perTeam.get(p.TeamNum) ?? 0) + 1);
        }
        const maxPerTeam = Math.max(...perTeam.values());
        const detected =
          maxPerTeam >= 3 ? 'ranked_standard' :
          maxPerTeam === 2 ? 'ranked_doubles' : 'ranked_duels';

        const priority: Record<string, number> = {
          default: 0, ranked_duels: 1, ranked_doubles: 2, ranked_standard: 3,
        };
        if ((priority[detected] ?? 0) > (priority[buf.playlist] ?? 0)) {
          buf.playlist = detected;
          this.emit('playlist_detected', { arena: arenaRaw, playlist: buf.playlist, maxPerTeam });
        }
      }
    }

    // Fallback: emit round:active on first UpdateState with positive game time
    if (!buf.roundActive && payload.Game.TimeSeconds > 0) {
      buf.roundActive = true;
      this.emit('round:active');
    }

    const sample: StateSample = {
      timestamp: Date.now(),
      gameTime: payload.Game.TimeSeconds,
      players: payload.Players.map(snapshotPlayer),
    };
    buf.stateSamples.push(sample);
  }

  private _handleStatfeed(payload: StatfeedPayload): void {
    if (!this.buffer) return;

    this.buffer.statfeedEvents.push({
      timestamp: Date.now(),
      eventName: payload.EventName,
      mainTarget: payload.MainTarget,
      secondaryTarget: payload.SecondaryTarget,
    });

    // Demolish: MainTarget = attacker, SecondaryTarget = victim
    if (payload.EventName === 'Demolish' && payload.SecondaryTarget) {
      this.buffer.demoEvents.push({
        timestamp: Date.now(),
        attacker: payload.MainTarget,
        victim: payload.SecondaryTarget,
      });
    }
  }

  private _handleGoal(payload: GoalScoredPayload): void {
    if (!this.buffer) return;
    this.buffer.goals.push({
      timestamp: Date.now(),
      goalTime: payload.GoalTime,
      scorer: payload.Scorer,
      assister: payload.Assister,
      teamNum: payload.Scorer.TeamNum,
    });
  }

  private _handleMatchEnd(payload: MatchEndedPayload): void {
    if (!this.buffer) return;
    if (payload?.WinnerTeamNum !== undefined) {
      this.buffer.winnerTeamNum = payload.WinnerTeamNum;
    }
    const completed = this.buffer;
    this.buffer = null;
    this.emit('match:end', completed);
  }
}
