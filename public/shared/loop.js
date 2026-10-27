// Timing shared by the server loop and the client.

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const SNAP_EVERY = 2; // ticks between snapshots (30 Hz)
export const SEND_EVERY = 2; // client sends its input commands in pairs (30 Hz)
export const MAX_REWIND = 12; // lag compensation looks back at most this many ticks (200 ms)
