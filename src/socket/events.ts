export interface PlayerRef {
  Name: string;
  Shortcut: number;
  TeamNum: number;
}

export interface AttackerRef {
  Name: string;
  Shortcut: number;
  TeamNum: number;
}

export interface PlayerState {
  Name: string;
  PrimaryId: string;
  Shortcut: number;
  TeamNum: number;
  Score: number;
  Goals: number;
  Shots: number;
  Assists: number;
  Saves: number;
  Touches: number;
  CarTouches: number;
  Demos: number;
  // SPECTATOR: only present for self/teammates or when spectating
  bHasCar?: boolean;
  Speed?: number;
  Boost?: number;
  bBoosting?: boolean;
  bOnGround?: boolean;
  bOnWall?: boolean;
  bPowersliding?: boolean;
  bDemolished?: boolean;
  bSupersonic?: boolean;
  // CONDITIONAL: present only when demolished
  Attacker?: AttackerRef;
}

export interface TeamState {
  Name: string;
  TeamNum: number;
  Score: number;
  ColorPrimary: string;
  ColorSecondary: string;
}

export interface BallState {
  Speed: number;
  TeamNum: number;
}

export interface GameState {
  Teams: TeamState[];
  TimeSeconds: number;
  bOvertime: boolean;
  Ball: BallState;
  bReplay: boolean;
  bHasWinner: boolean;
  Winner: string;
  Arena: string;
  bHasTarget: boolean;
  Target?: PlayerRef;
  Frame?: number;
  Elapsed?: number;
}

export interface UpdateStatePayload {
  MatchGuid?: string;
  Players: PlayerState[];
  Game: GameState;
}

export interface BallLastTouch {
  Player: PlayerRef;
  Speed: number;
}

export interface GoalScoredPayload {
  MatchGuid?: string;
  GoalSpeed: number;
  GoalTime: number;
  ImpactLocation: { X: number; Y: number; Z: number };
  Scorer: PlayerRef;
  Assister?: PlayerRef;
  BallLastTouch: BallLastTouch;
}

export interface StatfeedPayload {
  MatchGuid?: string;
  EventName: string;
  Type: string;
  MainTarget: PlayerRef;
  SecondaryTarget?: PlayerRef;
}

export interface MatchEndedPayload {
  MatchGuid?: string;
  WinnerTeamNum: number;
}

export interface RLEvent {
  Event: string;
  Data: unknown;
}
