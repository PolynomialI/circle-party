// Recent player positions per tick, so hits can be checked against where the attacker saw people.
export class History {
  constructor(size) {
    this.size = size;
    this.frames = [];
  }

  record(tick, players) {
    this.frames.push({ tick, pos: new Map(players.map((p) => [p.id, { x: p.x, y: p.y }])) });
    if (this.frames.length > this.size) this.frames.shift();
  }

  at(tick) {
    const f = this.frames.find((fr) => fr.tick === tick);
    return f ? f.pos : null;
  }
}
