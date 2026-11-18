// Local demo/test adapter only. Production always injects Devvit Redis.
export class MemoryStore {
  hashes = new Map<string, Map<string, string>>();
  changed: () => void = () => {};
  async hGet(key: string, field: string): Promise<string | undefined> {
    return this.hashes.get(key)?.get(field);
  }
  async hGetAll(key: string): Promise<Record<string, string>> {
    return Object.fromEntries(this.hashes.get(key) ?? []);
  }
  async hSetNX(key: string, field: string, value: string): Promise<number> {
    const hash = this.hashes.get(key) ?? new Map<string, string>();
    this.hashes.set(key, hash);
    if (hash.has(field)) return 0;
    hash.set(field, value);
    this.changed();
    return 1;
  }
  async hSet(key: string, values: Record<string, string>): Promise<number> {
    const hash = this.hashes.get(key) ?? new Map<string, string>();
    this.hashes.set(key, hash);
    let added = 0;
    for (const [field, value] of Object.entries(values)) {
      if (!hash.has(field)) added++;
      hash.set(field, value);
    }
    this.changed();
    return added;
  }
}
