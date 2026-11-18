// Instrumentation is injected so failures and ordering can be tested without a Reddit runtime.
export type JourneyClient = {
  appReady: () => Promise<unknown>;
  startJourney: () => Promise<unknown>;
  progress: (input: { progress: number; action: string }) => Promise<unknown>;
  endJourney: (input: { complete: boolean }) => Promise<unknown>;
  getActiveJourneyId: () => string | undefined;
  clearJourneyId: () => void;
};
export class JourneyFlow {
  client: JourneyClient;
  enabled: boolean;
  queue: Promise<void> = Promise.resolve();
  started = false;
  highest = 0;
  closed = false;
  constructor(client: JourneyClient, enabled: boolean) {
    this.client = client;
    this.enabled = enabled;
  }
  private enqueue(action: () => Promise<unknown>): void {
    if (!this.enabled) return;
    this.queue = this.queue.then(async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          action(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('telemetry unavailable')),
              1200
            );
          }),
        ]);
      } catch {
        /* Telemetry cannot interrupt gameplay or saving. */
      } finally {
        if (timer) clearTimeout(timer);
      }
    });
  }
  ready(): void {
    this.enqueue(() => this.client.appReady());
  }
  commit(): void {
    if (this.started || this.closed) return;
    this.started = true;
    this.enqueue(() => this.client.startJourney());
  }
  rescue(count: number): void {
    if (!this.started || this.closed || count <= this.highest || count >= 4)
      return;
    this.highest = count;
    this.enqueue(() =>
      this.client.progress({ progress: count / 4, action: 'animal_home' })
    );
  }
  async correlation(): Promise<string | undefined> {
    if (!this.enabled || !this.started) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      this.queue,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 300);
      }),
    ]);
    if (timer) clearTimeout(timer);
    return this.client.getActiveJourneyId();
  }
  validated(): void {
    this.closed = true;
    this.client.clearJourneyId();
  }
  abandon(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.started)
      this.enqueue(() => this.client.endJourney({ complete: false }));
  }
}
