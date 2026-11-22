import { scenery } from '../atmosphere';
import type { Scenery } from '../atmosphere';
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
  practiceTarget: AnimalId | undefined;
  blocked: AnimalId[] = [];
  busy = false;
  ready = false;
  bridgeDecks = new Map<string, Phaser.GameObjects.Graphics>();
  art: Phaser.GameObjects.Graphics;
  routeArt: Phaser.GameObjects.Graphics;
  labels: Phaser.GameObjects.Text[] = [];
  backdrop?: Phaser.GameObjects.Image;
  reunionArt: Phaser.GameObjects.Image | undefined;
  tokens = new Map<AnimalId, Phaser.GameObjects.Container>();
  constructor(session: Session, onSelect: (id: AnimalId) => void) {
    super('Crossing');
    this.session = session;
    this.onSelect = onSelect;
  }
  preload(): void {
    this.load.image('forest-art', '/art/forest-board.webp');
    this.load.image('dawn-art', '/art/dawn-river.webp');
    this.load.image('autumn-art', '/art/autumn-river.webp');
    this.load.image('reunion-art', '/art/reunion.webp');
    this.load.spritesheet('animal-art', '/art/animals.webp', {
      frameWidth: 631,
      frameHeight: 623,
    });
  }
  create(): void {
    this.cameras.main.setZoom(2).centerOn(210, 210);
    this.setScenery('moon');
    this.art = this.add.graphics();
    this.routeArt = this.add.graphics().setDepth(2);
    this.ready = true;
    this.refresh();
    this.game.events.emit('board-ready');
  }
  setScenery(id: Scenery): void {
    const key = scenery[id].texture;
    if (!this.textures.exists(key)) return;
    if (this.backdrop) this.backdrop.setTexture(key).setDisplaySize(420, 420);
    else
      this.backdrop = this.add
        .image(210, 210, key)
        .setDisplaySize(420, 420)
        .setDepth(-2);
  }
  label(x: number, y: number, text: string, size: number, color: string): void {
    this.labels.push(
      this.add
        .text(x, y, text, {
          fontFamily: 'Georgia, serif',
          fontSize: size,
          color,
        })
        .setResolution(2)
        .setOrigin(0.5)
        .setDepth(5)
    );
  }
  refresh(): void {
    if (!this.ready) return;
    this.reunionArt?.destroy();
    this.reunionArt = undefined;
    this.drawBoard();
    for (const token of this.tokens.values()) token.destroy();
    this.tokens.clear();
    for (const animal of this.session.board.animals) {
      if (isHome(this.session.state, animal.id)) continue;
      const p = pixel(animal);
      const token = this.animal(animal.id, p.x, p.y).setDepth(3);
      token
        .setSize(48, 48)
        .setInteractive({
          hitArea: new Phaser.Geom.Rectangle(0, 0, 48, 48),
          hitAreaCallback: Phaser.Geom.Rectangle.Contains,
          useHandCursor: true,
        })
        .on('pointerup', () => {
          if (!this.busy) this.onSelect(animal.id);
        });
      this.tokens.set(animal.id, token);
      const badge = this.add.graphics();
      badge.fillStyle(0xfff0ce);
      badge.fillCircle(17, 16, 11);
      badge.lineStyle(1.5, 0x8d743b);
      badge.strokeCircle(17, 16, 11);
      const v = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[
        animal.direction
      ];
      const dx = v[0] ?? 0,
        dy = v[1] ?? 0;
      const tipX = 17 + dx * 6,
        tipY = 16 + dy * 6;
      badge.lineStyle(2.7, 0x163f29);
      badge.lineBetween(17 - dx * 5, 16 - dy * 5, tipX, tipY);
      badge.lineBetween(tipX, tipY, 17 + dx * 1 - dy * 4, 16 + dy * 1 + dx * 4);
      badge.lineBetween(tipX, tipY, 17 + dx * 1 + dy * 4, 16 + dy * 1 - dx * 4);
      token.add(badge);
    }
  }
  drawBoard(): void {
    const g = this.art;
    g.clear();
    this.routeArt.clear();
    for (const deck of this.bridgeDecks.values()) deck.destroy();
    this.bridgeDecks.clear();
    this.labels.forEach((l) => l.destroy());
    this.labels = [];
    if (!this.textures.exists('forest-art')) {
      g.fillStyle(0x136773);
      g.fillRoundedRect(3, 3, 414, 414, 18);
    }
    g.lineStyle(3, 0x9e874b, 0.8);
    g.strokeRoundedRect(3, 3, 414, 414, 18);
    for (const p of this.session.board.paths) {
      if (this.session.board.bridges.some((b) => samePoint(b, p))) continue;
      const pos = pixel(p);
      g.fillStyle(0x09262d, 0.5);
      g.fillRoundedRect(pos.x - 22, pos.y - 18, 44, 44, 8);
      g.fillStyle(0xe6d1a6);
      g.fillRoundedRect(pos.x - 22, pos.y - 22, 44, 42, 8);
      g.lineStyle(1.5, 0xfff3ce, 0.9);
      g.strokeRoundedRect(pos.x - 21, pos.y - 21, 42, 40, 7);
      g.lineStyle(1, 0xb39562, 0.5);
      g.lineBetween(pos.x - 13, pos.y + 9, pos.x + 12, pos.y + 9);
      for (let n = 0; n < 13; n++) {
        const seed = p.x * 31 + p.y * 17 + n * 13;
        g.fillStyle(n % 2 ? 0x9f8657 : 0xfff8dd, 0.22);
        g.fillCircle(
          pos.x - 17 + (seed % 34),
          pos.y - 16 + ((seed * 7) % 32),
          n % 3 === 0 ? 1.3 : 0.6
        );
      }
      g.fillStyle(0x728349, 0.75);
      g.fillEllipse(pos.x - 17, pos.y + 15, 8, 4);
      g.fillEllipse(pos.x - 13, pos.y + 18, 7, 3);
    }
    for (const b of this.session.board.bridges) {
      const p = pixel(b),
        open = bridgeOpen(this.session.state, b);
      const bridgeColor =
        b.id === 'star' ? 0xacc6e8 : b.id === 'leaf' ? 0xaad8a0 : 0xf3cd86;
      const bridgeText =
        b.id === 'star' ? '#234f69' : b.id === 'leaf' ? '#38582c' : '#75501d';
      g.fillStyle(0x091d26);
      g.fillRoundedRect(p.x - 23, p.y - 23, 46, 46, 6);
      const deck = this.add.graphics().setPosition(p.x, p.y).setDepth(1);
      deck.fillStyle(
        open
          ? b.id === 'star'
            ? 0x829aab
            : b.id === 'leaf'
              ? 0x809b78
              : 0xb49b6b
          : 0x806b59
      );
      for (let i = 0; i < 4; i++)
        deck.fillRoundedRect(-20, -20 + i * 11, 40, 8, 2);
      deck.setScale(1, open ? 1 : 0.16);
      this.bridgeDecks.set(b.id, deck);
      g.lineStyle(2, bridgeColor, open ? 0.85 : 0.25);
      g.lineBetween(p.x - 22, p.y - 22, p.x - 22, p.y + 22);
      g.lineBetween(p.x + 22, p.y - 22, p.x + 22, p.y + 22);
      g.fillStyle(0xffefce);
      g.fillRoundedRect(p.x - 11, p.y - 39, 22, 21, 5);
      this.label(p.x, p.y - 29, b.symbol, 16, open ? bridgeText : '#a63724');
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
    const target = this.session.board.animals.find(
      ({ id }) => id === this.practiceTarget
    );
    if (target) {
      const { x, y } = pixel(target);
      this.routeArt.lineStyle(6, 0x173c2f);
      this.routeArt.strokeCircle(x, y, 25);
      this.routeArt.lineStyle(3, 0xffe09a);
      this.routeArt.strokeCircle(x, y, 25);
    }
    const routes = this.selected ? [this.selected] : this.blocked;
    for (const id of routes) {
      const g = this.routeArt;
      const a = this.session.board.animals.find((a) => a.id === id);
      if (!a || isHome(this.session.state, id)) continue;
      const route = trace(this.session.board, this.session.state, id),
        start = pixel(a);
      const color = route.legal ? 0xffc267 : 0xff8c70;
      g.lineStyle(7, 0x102e2d, 0.94);
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
      const end = route.obstacle?.at ?? route.path.at(-1);
      if (end) {
        const q = pixel(end);
        const distance = Math.hypot(q.x - start.x, q.y - start.y);
        g.fillStyle(color);
        for (let n = 7; n < distance; n += 8)
          g.fillCircle(
            start.x + ((q.x - start.x) * n) / distance,
            start.y + ((q.y - start.y) * n) / distance,
            2.1
          );
      }
      for (const p of route.path) {
        const q = pixel(p);
        g.fillStyle(color, 0.8);
        g.fillCircle(q.x, q.y, 3);
      }
      if (route.obstacle) {
        const q = pixel(route.obstacle.at);
        g.fillStyle(0x102e2d, 0.98);
        g.fillCircle(q.x, q.y, 13);
        g.lineStyle(3, color);
        g.lineBetween(q.x - 5, q.y - 5, q.x + 5, q.y + 5);
        g.lineBetween(q.x - 5, q.y + 5, q.x + 5, q.y - 5);
      }
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
      if (b.holder === this.selected) {
        const q = pixel(b);
        g.lineStyle(2, 0xffce75, 0.9);
        g.lineBetween(badgeX, p.y - 19, q.x, q.y - 29);
      }
      g.fillStyle(0xffefcc);
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
        b.id === 'star' ? '#234f69' : b.id === 'leaf' ? '#38582c' : '#75501d'
      );
    }
  }
  animal(id: AnimalId, x: number, y: number): Phaser.GameObjects.Container {
    const token = this.add.container(x, y),
      g = this.add.graphics();
    token.add(g);
    if (this.textures.exists('animal-art')) {
      const frames = { turtle: 0, rabbit: 1, fox: 2, badger: 3 };
      g.fillStyle(0x233f28, 0.32);
      g.fillEllipse(0, 16, 35, 13);
      token.add(
        this.add.image(0, -2, 'animal-art', frames[id]).setDisplaySize(54, 54)
      );
      return token;
    }

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
    const v = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[a.direction];
    const last = pixel(route.path.at(-1) ?? a);
    const endX = last.x + (v[0] ?? 0) * 25;
    const endY = last.y + (v[1] ?? 0) * 25;
    const origin = { x: token.x, y: token.y };
    const gait = {
      turtle: { beat: 115, lift: 1.8, squash: 0.025, pace: 81 },
      rabbit: { beat: 143, lift: 12, squash: 0.11, pace: 69 },
      fox: { beat: 92, lift: 4.5, squash: 0.06, pace: 52 },
      badger: { beat: 128, lift: 2.7, squash: 0.045, pace: 75 },
    }[id];
    const duration = 140 + route.path.length * gait.pace;
    const clock = { progress: 0 };
    const sprite = token.list[1];
    if (
      sprite instanceof Phaser.GameObjects.Image &&
      a.direction !== 'S' &&
      a.direction !== 'N'
    )
      sprite.setFlipX(
        id === 'turtle' ? a.direction === 'E' : a.direction === 'W'
      );
    await new Promise<void>((resolve) => {
      this.tweens.add({
        targets: clock,
        progress: 1,
        duration,
        ease: 'Linear',
        onUpdate: () => {
          const t = clock.progress;
          const phase = ((t * duration) / gait.beat) % 1;
          const stride = Math.sin(Math.PI * phase);
          const finish = Math.min(1, (1 - t) * 6);
          const sway =
            id === 'badger' ? Math.sin(phase * Math.PI * 2) * 0.035 : 0;
          token.setPosition(
            Phaser.Math.Linear(origin.x, endX, t),
            Phaser.Math.Linear(origin.y, endY, t) - stride * gait.lift * finish
          );
          token.setScale(
            1 + stride * gait.squash * finish,
            1 - stride * gait.squash * finish
          );
          token.setRotation(sway * finish).setAlpha(finish);
        },
        onComplete: () => resolve(),
      });
    });
  }
  async fold(ids: string[], reduced: boolean): Promise<void> {
    if (reduced || !ids.length) return;
    const decks = ids.flatMap((id) => {
      const deck = this.bridgeDecks.get(id);
      return deck ? [deck] : [];
    });
    if (!decks.length) return;
    await new Promise<void>((resolve) => {
      this.tweens.add({
        targets: decks,
        scaleY: 0.16,
        duration: 155,
        ease: 'Sine.easeIn',
        onComplete: () => resolve(),
      });
    });
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
    if (this.textures.exists('reunion-art')) {
      this.reunionArt = this.add
        .image(210, 210, 'reunion-art')
        .setDisplaySize(414, 276)
        .setDepth(2);
      this.label(210, 40, 'Everyone home', 28, '#fff0c9');
      this.label(210, 382, 'The forest can rest.', 17, '#fff0c9');
    } else {
      this.label(210, 195, 'Everyone home', 28, '#ffe2a5');
      this.label(210, 228, 'The forest can rest.', 15, '#d0dbc2');
      this.session.board.animals.forEach((a, i) => {
        const token = this.animal(a.id, 115 + i * 64, 281);
        this.tokens.set(a.id, token);
      });
    }
  }
}
