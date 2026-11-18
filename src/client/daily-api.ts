import { parseEdition, parseInit, parseSave, isObject } from '../shared/daily';
import type { Edition } from '../shared/daily';
export class DailyApi {
  previewId: string | undefined;
  async request(
    path: string,
    body?: unknown,
    journeyId?: string
  ): Promise<unknown> {
    const query = this.previewId
      ? `?edition=${encodeURIComponent(this.previewId)}`
      : '';
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`/api/${path}${query}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'content-type': 'application/json',
          ...(journeyId ? { 'x-devvit-journey-id': journeyId } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      const data: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          isObject(data) && typeof data.error === 'string'
            ? data.error
            : 'Could not reach the daily. Please retry.'
        );
      return data;
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error(
          'The forest is taking longer to respond. Please retry.',
          { cause: error }
        );
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  async init() {
    return parseInit(await this.request('init'));
  }
  async save(edition: Edition, body: unknown, journeyId?: string) {
    return parseSave(await this.request('complete', body, journeyId), edition);
  }
  async previews(): Promise<Edition[]> {
    const data = await this.request('previews');
    if (!isObject(data) || !Array.isArray(data.editions))
      throw new Error('No previews available');
    return data.editions.map(parseEdition);
  }
}
