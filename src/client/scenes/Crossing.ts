import * as Phaser from 'phaser';
import { bridgeOpen, isHome, samePoint, trace } from '../../shared/engine';
import type { AnimalId, Point, Session } from '../../shared/engine';
export const ANIMAL_COLORS = {
  turtle: '#a5c896',
  rabbit: '#e4d3bd',
  fox: '#dd9671',
  badger: '#adbcc1',
};
const O = 42,
  C = 48;
const pixel = (p: Point) => ({
  x: O + p.x * C + C / 2,
  y: O + p.y * C + C / 2,
});
export class Crossing extends Phaser.Scene {
  session: Session;
  onSelect: (id: AnimalId) => void;
  selected: AnimalId | undefined;
  blocked: AnimalId[] = [];
  busy = false;
  ready = false;
  folding = 1;
  recentlyFolded: string[] = [];
  art: Phaser.GameObjects.Graphics;
  labels: Phaser.GameObjects.Text[] = [];
  tokens = new Map<AnimalId, Phaser.GameObjects.Container>();
  constructor(session: Session, onSelect: (id: AnimalId) => void) {
    super('Crossing');
    this.session = session;
    this.onSelect = onSelect;
  }
  create(): void {
    this.art = this.add.graphics();
    this.ready = true;
    this.refresh();
    this.game.events.emit('board-ready');
  }
  label(x: number, y: number, text: string, size: number, color: string): void {
    this.labels.push(
      this.add
        .text(x, y, text, {
          fontFamily: 'Georgia, serif',
          fontSize: size,
          color,
        })
        .setOrigin(0.5)
        .setDepth(5)
    );
  }
  refresh(): void {
    if (!this.ready) return;
    this.drawBoard();
    for (const token of this.tokens.values()) token.destroy();
    this.tokens.clear();
    for (const animal of this.session.board.animals) {
      if (isHome(this.session.state, animal.id)) continue;
      const p = pixel(animal);
      const token = this.animal(animal.id, p.x, p.y);
      token
        .setSize(46, 46)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (!this.busy) this.onSelect(animal.id);
        });
      this.tokens.set(animal.id, token);
      const badge = this.add.graphics();
      badge.fillStyle(0x102c30);
      badge.fillCircle(17, 16, 11);
      badge.lineStyle(1, 0xefd493);
      badge.strokeCircle(17, 16, 11);
      const v = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[
        animal.direction
      ];
      const dx = v[0] ?? 0,
        dy = v[1] ?? 0;
      const tipX = 17 + dx * 6,
        tipY = 16 + dy * 6;
      badge.lineStyle(2.5, 0xffe2a5);
      badge.lineBetween(17 - dx * 5, 16 - dy * 5, tipX, tipY);
      badge.lineBetween(tipX, tipY, 17 + dx * 1 - dy * 4, 16 + dy * 1 + dx * 4);
      badge.lineBetween(tipX, tipY, 17 + dx * 1 + dy * 4, 16 + dy * 1 - dx * 4);
      token.add(badge);
    }
  }
  drawBoard(): void {
    const g = this.art;
    g.clear();
    this.labels.forEach((l) => l.destroy());
    this.labels = [];
    g.fillStyle(0x102f35);
    g.fillRoundedRect(3, 3, 414, 414, 26);
    g.lineStyle(1, 0x416359, 0.45);
    g.strokeRoundedRect(3, 3, 414, 414, 26);
    // River glints are deterministic, calm, and behind every path.
    for (let i = 0; i < 63; i++) {
      const x = 20 + ((i * 67) % 380),
        y = 28 + ((i * 113) % 367);
      g.lineStyle(1, 0x416b6d, 0.3);
      g.lineBetween(x, y, x + 7 + (i % 4) * 3, y);
    }
    // Fronds stay on the banks, never on routes.
    for (const [x, y, r] of [
      [17, 66, 0],
      [395, 80, 1],
      [22, 339, 0],
      [390, 352, 1],
      [83, 395, 0],
      [325, 22, 1],
    ]) {
      if (x === undefined || y === undefined) continue;
      for (let k = 0; k < 5; k++) {
        g.fillStyle(k % 2 ? 0x31564c : 0x27483f);
        g.fillEllipse(x + (r ? -1 : 1) * k * 3, y + k * 6, 18, 8);
      }
    }
    this.label(33, 26, '✧', 20, '#a2b78e');
    this.label(382, 387, '✧', 20, '#a2b78e');
    for (const p of this.session.board.paths) {
      if (this.session.board.bridges.some((b) => samePoint(b, p))) continue;
      const pos = pixel(p);
      g.fillStyle(0x09262d, 0.5);
      g.fillRoundedRect(pos.x - 22, pos.y - 18, 44, 44, 8);
      g.fillStyle(0x536f62);
      g.fillRoundedRect(pos.x - 22, pos.y - 22, 44, 42, 8);
      g.lineStyle(1, 0x789180, 0.4);
      g.strokeRoundedRect(pos.x - 21, pos.y - 21, 42, 40, 7);
      g.lineStyle(1, 0x294d47, 0.6);
      g.lineBetween(pos.x - 13, pos.y + 9, pos.x + 12, pos.y + 9);
    }
    for (const b of this.session.board.bridges) {
      const p = pixel(b),
        open = bridgeOpen(this.session.state, b);
      const bridgeColor =
        b.id === 'star' ? 0xacc6e8 : b.id === 'leaf' ? 0xaad8a0 : 0xf3cd86;
      const bridgeText =
        b.id === 'star' ? '#bdd5fa' : b.id === 'leaf' ? '#caefb7' : '#ffdf9b';
      const scale = open
        ? 1
        : this.recentlyFolded.includes(b.id)
          ? 1 - this.folding * 0.84
          : 0.16;
      g.fillStyle(0x091d26);
      g.fillRoundedRect(p.x - 23, p.y - 23, 46, 46, 6);
      g.fillStyle(
        open
          ? b.id === 'star'
            ? 0x829aab
            : b.id === 'leaf'
              ? 0x809b78
              : 0xb49b6b
          : 0x806b59
      );
      for (let i = 0; i < 4; i++)
        g.fillRoundedRect(
          p.x - 20,
          p.y - 20 * scale + i * 11 * scale,
          40,
          8 * scale,
          2
        );
      g.lineStyle(2, bridgeColor, open ? 0.85 : 0.25);
      g.lineBetween(p.x - 22, p.y - 22, p.x - 22, p.y + 22);
      g.lineBetween(p.x + 22, p.y - 22, p.x + 22, p.y + 22);
      this.label(p.x, p.y - 29, b.symbol, 16, open ? bridgeText : '#edaa94');
      if (!open) {
        g.lineStyle(2, 0xebaa95, 0.8);
        g.lineBetween(p.x - 8, p.y - 8, p.x + 8, p.y + 8);
        g.lineBetween(p.x + 8, p.y - 8, p.x - 8, p.y + 8);
      }
      if (this.selected === b.holder) {
        g.lineStyle(3, 0xffdf9b);
        g.strokeRoundedRect(p.x - 23, p.y - 23, 46, 46, 5);
      }
    }
    // Every edge exit has a warm lantern and a small arrow.
    for (const a of this.session.board.animals) {
      const v = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[a.direction];
      // Exit is independent of obstacles and remains visible even when a bridge folds.
      let x = a.x,
        y = a.y;
      while (
        x + (v[0] ?? 0) >= 0 &&
        x + (v[0] ?? 0) < 7 &&
        y + (v[1] ?? 0) >= 0 &&
        y + (v[1] ?? 0) < 7
      ) {
        x += v[0] ?? 0;
        y += v[1] ?? 0;
      }
      const p = pixel({ x, y }),
        ex = p.x + (v[0] ?? 0) * 31,
        ey = p.y + (v[1] ?? 0) * 31;
      g.fillStyle(0xf3c775, 0.09);
      g.fillCircle(ex, ey, 16);
      g.fillStyle(0xf3c775, 0.18);
      g.fillCircle(ex, ey, 10);
      g.fillStyle(0xffd98a);
      g.fillRoundedRect(ex - 4, ey - 5, 8, 10, 2);
      g.lineStyle(1, 0x956e46);
      g.strokeRoundedRect(ex - 5, ey - 6, 10, 12, 2);
    }
    const routes = this.selected ? [this.selected] : this.blocked;
    for (const id of routes) {
      const a = this.session.board.animals.find((a) => a.id === id);
      if (!a || isHome(this.session.state, id)) continue;
      const route = trace(this.session.board, this.session.state, id),
        start = pixel(a);
      const color = route.legal ? 0xf4d28d : 0xf4a78f;
      g.lineStyle(5, color, 0.8);
      g.beginPath();
      g.moveTo(start.x, start.y);
      for (const p of route.path) {
        const q = pixel(p);
        g.lineTo(q.x, q.y);
      }
      if (route.obstacle) {
        const q = pixel(route.obstacle.at);
        g.lineTo(q.x, q.y);
      }
      g.strokePath();
      for (const p of route.path) {
        const q = pixel(p);
        g.fillStyle(color, 0.8);
        g.fillCircle(q.x, q.y, 3);
      }
      if (route.obstacle) {
        const q = pixel(route.obstacle.at);
        g.fillStyle(0x332e2d, 0.85);
        g.fillCircle(q.x, q.y, 13);
        g.lineStyle(3, color);
        g.lineBetween(q.x - 5, q.y - 5, q.x + 5, q.y + 5);
        g.lineBetween(q.x - 5, q.y + 5, q.x + 5, q.y - 5);
      }
      g.lineStyle(2, color);
      g.strokeCircle(start.x, start.y, 25);
    }
    // Latch plaques sit beside their holder, with the matching bridge symbol.
    for (const b of this.session.board.bridges) {
      const holder = this.session.board.animals.find((a) => a.id === b.holder);
      if (!holder || isHome(this.session.state, b.holder)) continue;
      const p = pixel(holder);
      const siblings = this.session.board.bridges.filter(
        (other) => other.holder === b.holder
      );
      const badgeX =
        p.x - 17 + siblings.findIndex((other) => other.id === b.id) * 27;
      g.fillStyle(0x183c40);
      g.fillCircle(badgeX, p.y - 19, 11);
      g.lineStyle(
        2,
        b.id === 'star' ? 0xacc6e8 : b.id === 'leaf' ? 0xaad8a0 : 0xf3cd86
      );
      g.strokeCircle(badgeX, p.y - 19, 11);
      this.label(
        badgeX,
        p.y - 20,
        b.symbol,
        16,
        b.id === 'star' ? '#bdd5fa' : b.id === 'leaf' ? '#caefb7' : '#ffdf9b'
      );
    }
  }
  animal(id: AnimalId, x: number, y: number): Phaser.GameObjects.Container {
    const token = this.add.container(x, y),
      g = this.add.graphics();
    token.add(g);
    g.fillStyle(0x041c22, 0.55);
    g.fillEllipse(1, 11, 40, 25);
    if (id === 'turtle') {
      g.fillStyle(0x94b88b);
      g.fillCircle(-18, 0, 9);
      g.fillEllipse(-10, 14, 12, 7);
      g.fillEllipse(10, 14, 12, 7);
      g.fillStyle(0x547e61);
      g.fillEllipse(2, 0, 34, 30);
      g.lineStyle(2, 0xb4cb8f);
      g.strokeEllipse(2, 0, 33, 29);
      g.strokeTriangle(-7, -7, 10, -7, 2, 8);
      g.fillStyle(0x172e2c);
      g.fillCircle(-22, -3, 2);
      g.lineStyle(1, 0x456944);
      g.lineBetween(-25, 3, -21, 4);
    } else if (id === 'rabbit') {
      g.fillStyle(0xe4d3bd);
      g.fillEllipse(-9, -17, 9, 25);
      g.fillEllipse(7, -18, 9, 26);
      g.fillStyle(0xc89689);
      g.fillEllipse(-9, -19, 3, 15);
      g.fillEllipse(7, -20, 3, 15);
      g.fillStyle(0xe4d3bd);
      g.fillEllipse(0, 2, 33, 31);
      g.fillStyle(0xfff0d9);
      g.fillEllipse(0, 10, 21, 13);
    } else if (id === 'fox') {
      g.fillStyle(0xd79268);
      g.fillTriangle(-18, -22, -2, -10, -19, 1);
      g.fillTriangle(18, -22, 2, -10, 19, 1);
      g.fillStyle(0x4d4540);
      g.fillTriangle(-16, -18, -7, -10, -16, -5);
      g.fillTriangle(16, -18, 7, -10, 16, -5);
      g.fillStyle(0xd79268);
      g.fillTriangle(-21, -6, 21, -6, 0, 20);
      g.fillEllipse(0, -3, 37, 25);
      g.fillStyle(0xf0ddbc);
      g.fillTriangle(-18, 2, 0, 9, 0, 18);
      g.fillTriangle(18, 2, 0, 9, 0, 18);
    } else {
      g.fillStyle(0x526567);
      g.fillCircle(-13, -13, 7);
      g.fillCircle(13, -13, 7);
      g.fillStyle(0xd4d7c8);
      g.fillEllipse(0, 1, 37, 36);
      g.fillStyle(0x364c50);
      g.fillEllipse(-10, 0, 9, 29);
      g.fillEllipse(10, 0, 9, 29);
      g.fillStyle(0xe5dfc9);
      g.fillEllipse(0, 10, 17, 15);
    }
    if (id !== 'turtle') {
      g.fillStyle(0x152d30);
      g.fillCircle(-7, 0, 2.3);
      g.fillCircle(7, 0, 2.3);
      g.fillStyle(0xffffff, 0.7);
      g.fillCircle(-7.5, -0.6, 0.7);
      g.fillCircle(6.5, -0.6, 0.7);
      g.fillStyle(id === 'rabbit' ? 0xb67f78 : 0x213839);
      g.fillTriangle(-3, 8, 3, 8, 0, 12);
      g.lineStyle(1, 0x394542);
      g.lineBetween(0, 12, -3, 14);
      g.lineBetween(0, 12, 3, 14);
    }
    return token;
  }
  async animateHome(id: AnimalId, reduced: boolean): Promise<void> {
    const token = this.tokens.get(id),
      a = this.session.board.animals.find((a) => a.id === id);
    if (!token || !a) return;
    const route = trace(this.session.board, this.session.state, id);
    if (reduced) {
      token.setAlpha(0);
      return;
    }
    for (const p of route.path) {
      const q = pixel(p);
      await new Promise<void>((resolve) => {
        this.tweens.add({
          targets: token,
          x: q.x,
          y: q.y,
          duration: 95,
          ease: 'Sine.easeInOut',
          onComplete: () => resolve(),
        });
      });
    }
    const v = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[a.direction];
    await new Promise<void>((resolve) => {
      this.tweens.add({
        targets: token,
        x: token.x + (v[0] ?? 0) * 22,
        y: token.y + (v[1] ?? 0) * 22,
        alpha: 0,
        scale: 0.6,
        duration: 180,
        onComplete: () => resolve(),
      });
    });
  }
  async fold(ids: string[], reduced: boolean): Promise<void> {
    this.recentlyFolded = ids;
    this.folding = 0;
    if (reduced || !ids.length) {
      this.folding = 1;
      this.refresh();
      return;
    }
    await new Promise<void>((resolve) => {
      this.tweens.add({
        targets: this,
        folding: 1,
        duration: 330,
        ease: 'Sine.easeIn',
        onUpdate: () => this.drawBoard(),
        onComplete: () => resolve(),
      });
    });
    this.refresh();
  }
  celebrate(reduced: boolean): void {
    if (!reduced)
      for (let i = 0; i < 14; i++) {
        const spark = this.add.circle(
          45 + i * 25,
          360 - (i % 4) * 45,
          2,
          0xf3d28c,
          0.8
        );
        this.tweens.add({
          targets: spark,
          y: spark.y - 90,
          alpha: 0,
          duration: 1300 + i * 50,
          onComplete: () => spark.destroy(),
        });
      }
    this.label(210, 195, 'Everyone home', 28, '#ffe2a5');
    this.label(210, 228, 'The forest can rest.', 15, '#d0dbc2');
    // Reunite all four original vector tokens at the lantern bank.
    this.session.board.animals.forEach((a, i) => {
      const token = this.animal(a.id, 115 + i * 64, 281);
      this.tokens.set(a.id, token);
    });
  }
}
