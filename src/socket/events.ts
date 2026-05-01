export interface PlayerLocation {
  x: number;
  y: number;
  z: number;
  pitch: number;
  roll: number;
  yaw: number;
}

export interface PlayerState {
  assists: number;
  boost: number;
  demos: number;
  goals: number;
  hasCar: boolean;
  id: string;
  isDead: boolean;
  location: PlayerLocation;
  me: boolean;
  name: string;
  saves: number;
  score: number;
  shots: number;
  speed: number;
  team: number;
  touches: number;
}

export interface BallState {
  location: PlayerLocation;
  speed: number;
  team: number;
}

export interface GameState {
  ball: BallState;
  hasTarget: boolean;
  hasWinner: boolean;
  isOT: boolean;
  isReplay: boolean;
  isSeries: boolean;
  target: string;
  time: number;
  winner: string;
  playlist?: string;
}

export interface UpdateStatePayload {
  game: GameState;
  players: Record<string, PlayerState>;
  hasGame: boolean;
}

export interface PlayerRef {
  id: string;
  name: string;
  team_num: number;
}

export interface StatfeedPayload {
  event_name: string;
  main_target: PlayerRef;
  secondary_target: PlayerRef | null;
  type: number;
}

export interface GoalScoredPayload {
  assister: PlayerRef | null;
  ball_left_player: boolean;
  goalspeed: number;
  goaltime: number;
  scorer: PlayerRef;
  team_num: number;
}

export interface MatchEndedPayload {
  winner_team_num: number;
}

export interface RLEvent {
  event: string;
  data: unknown;
}
