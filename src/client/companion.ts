import { DailyApi } from './daily-api';
import { portrait } from './portraits';
import {
  canWear,
  companions,
  defaultCompanion,
  parseCompanion,
  scarfColors,
} from '../shared/companion';
import type { CompanionProfile } from '../shared/companion';

let current = defaultCompanion;
export function companionProfile(): CompanionProfile {
  return current;
}
export function avatarPortrait(profile: CompanionProfile): string {
  const base = portrait(profile.animal, scarfColors[profile.scarf]);
  const accessory =
    profile.accessory === 'lantern'
      ? '<g fill="#ffd175" stroke="#80592c" stroke-width="1.5"><path fill="none" d="M77 69v-6a5 5 0 0 1 10 0v6"/><rect x="74" y="68" width="16" height="23" rx="4"/><path d="M77 73h10v13H77z" fill="#fff2bf"/></g>'
      : profile.accessory === 'leaf'
        ? '<path d="M73 15q25-4 14 17Q72 38 73 15" fill="#dcb855" stroke="#926c23"/><path d="M74 32l11-13" stroke="#926c23"/>'
        : '';
  return base.replace('</svg>', accessory + '</svg>');
}
export async function loadCompanion(
  api: DailyApi
): Promise<{ profile: CompanionProfile; rescues: number; signedIn: boolean }> {
  const data = (await api.request('companion')) as {
    profile: CompanionProfile;
    rescues: number;
    signedIn: boolean;
  };
  current = parseCompanion(data.profile) ?? defaultCompanion;
  window.dispatchEvent(new Event('companion-change'));
  return { ...data, profile: current };
}
export function setupCompanionEditor(
  api: DailyApi,
  container: HTMLElement
): void {
  const preview = document.createElement('div');
  preview.className = 'companion-preview';
  const options = document.createElement('div');
  options.className = 'companion-options';
  options.setAttribute('role', 'group');
  options.setAttribute('aria-label', 'Favorite animal avatar');
  const scarfLabel = document.createElement('label');
  scarfLabel.textContent = 'Scarf ';
  const scarf = document.createElement('select');
  scarf.setAttribute('aria-label', 'Avatar scarf');
  for (const color of Object.keys(scarfColors))
    scarf.add(new Option(color[0]!.toUpperCase() + color.slice(1), color));
  scarfLabel.append(scarf);
  const accessoryLabel = document.createElement('label');
  accessoryLabel.textContent = 'Accessory ';
  const accessory = document.createElement('select');
  accessory.setAttribute('aria-label', 'Avatar accessory');
  accessoryLabel.append(accessory);
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const save = document.createElement('button');
  save.type = 'button';
  save.textContent = 'Save my animal';
  let rescues = 0;
  let draft = { ...current };
  let pending = false;
  function render(): void {
    preview.innerHTML = avatarPortrait(draft);
    options.replaceChildren(
      ...companions.map((animal) => {
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.innerHTML = portrait(animal.id);
        const name = document.createElement('span');
        name.textContent = animal.name;
        choice.append(name);
        if (rescues < animal.rescues) {
          choice.disabled = true;
          const lock = document.createElement('small');
          lock.textContent = `${animal.rescues} rescues`;
          choice.append(lock);
        }
        choice.setAttribute('aria-pressed', String(draft.animal === animal.id));
        choice.addEventListener('click', () => {
          draft.animal = animal.id;
          render();
        });
        return choice;
      })
    );
    scarf.value = draft.scarf;
    accessory.replaceChildren(
      ...[
        ['none', 'None', 0],
        ['lantern', 'Lantern', 1],
        ['leaf', 'Golden leaf', 3],
      ].map(([value, title, required]) => {
        const option = new Option(
          `${title}${rescues < Number(required) ? ` · ${required} rescues` : ''}`,
          String(value)
        );
        option.disabled = rescues < Number(required);
        return option;
      })
    );
    accessory.value = draft.accessory;
  }
  scarf.addEventListener('change', () => {
    draft.scarf = scarf.value as CompanionProfile['scarf'];
    render();
  });
  accessory.addEventListener('change', () => {
    draft.accessory = accessory.value as CompanionProfile['accessory'];
    render();
  });
  save.addEventListener('click', async () => {
    if (pending || !canWear(draft, rescues)) return;
    pending = true;
    save.disabled = true;
    status.textContent = 'Saving your animal…';
    try {
      const data = await api.request('companion', draft);
      const profile = parseCompanion(data);
      if (!profile) throw new Error('Could not confirm your animal.');
      current = profile;
      window.dispatchEvent(new Event('companion-change'));
      status.textContent =
        'Your animal is saved for your next rescue and share card.';
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : 'Could not save. Try again.';
    } finally {
      pending = false;
      save.disabled = false;
    }
  });
  const refresh = async () => {
    status.textContent = 'Loading your animal and rewards…';
    save.disabled = true;
    try {
      const data = await loadCompanion(api);
      rescues = data.rescues;
      draft = { ...data.profile };
      render();
      save.disabled = !data.signedIn;
      status.textContent = data.signedIn
        ? `${rescues} rescues · New friends unlock at 2, 5, 10, and 20 rescues.`
        : 'Sign in to Reddit to save your avatar.';
    } catch {
      status.textContent = 'Your animal could not load.';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'Try again';
      retry.addEventListener('click', () => void refresh());
      status.append(retry);
    }
  };
  container.replaceChildren(
    preview,
    options,
    scarfLabel,
    accessoryLabel,
    save,
    status
  );
  void refresh();
}
