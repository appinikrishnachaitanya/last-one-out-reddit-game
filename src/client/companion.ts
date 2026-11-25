import { DailyApi } from './daily-api';
import { portrait } from './portraits';
import {
  animalStyles,
  canWear,
  companions,
  defaultCompanion,
  parseCompanion,
} from '../shared/companion';
import type { CompanionProfile } from '../shared/companion';

let current = defaultCompanion;
export function companionProfile(): CompanionProfile {
  return current;
}
export function avatarPortrait(profile: CompanionProfile): string {
  const base = portrait(profile.animal);
  const accessory =
    profile.accessory === 'lantern'
      ? '<g fill="#ffd175" stroke="#80592c" stroke-width="1.5"><path fill="none" d="M77 69v-6a5 5 0 0 1 10 0v6"/><rect x="74" y="68" width="16" height="23" rx="4"/><path d="M77 73h10v13H77z" fill="#fff2bf"/></g>'
      : profile.accessory === 'leaf'
        ? '<path d="M73 15q25-4 14 17Q72 38 73 15" fill="#dcb855" stroke="#926c23"/><path d="M74 32l11-13" stroke="#926c23"/>'
        : '';
  const signatures: Record<CompanionProfile['animal'], string> = {
    fox: '<path d="M68 88C98 95 103 69 92 52C96 72 71 59 68 88" fill="#bf652b" stroke="#713a1c" stroke-width="1.5"/><path d="M92 52q9 17 2 27l-9-9q9-5 7-18" fill="#fff0ce"/>',
    owl: '<g fill="#b17b46" stroke="#64432c" stroke-width="1.5"><path d="M22 84Q-4 73 5 34Q18 51 28 57Z"/><path d="M78 84Q104 73 95 34Q82 51 72 57Z"/><path d="M8 47l13 22M6 60l13 17M92 47L79 69M94 60L81 77" fill="none"/></g>',
    rabbit:
      '<g fill="#f8deb1" stroke="#c7955e"><path d="M28 29Q50 19 72 29" fill="none" stroke="#527348" stroke-width="4"/><circle cx="30" cy="27" r="5"/><circle cx="43" cy="24" r="5"/><circle cx="57" cy="24" r="5"/><circle cx="70" cy="27" r="5"/></g>',
    turtle:
      '<g fill="#6d964e" stroke="#385b32"><path d="M17 77q-9-20 3-18q10 5-3 18M24 87q-10-19 2-16q9 7-2 16M76 87q10-19-2-16q-9 7 2 16M83 77q9-20-3-18q-10 5 3 18"/></g>',
    badger:
      '<path d="M25 68Q50 83 75 68L86 93Q50 105 14 93Z" fill="#496a48" stroke="#294b36" stroke-width="2"/><path d="M50 79v18" stroke="#b3bd82"/><circle cx="50" cy="81" r="3" fill="#dbbb6c"/>',
    deer: '<g fill="none" stroke="#9b724a" stroke-width="3" stroke-linecap="round"><path d="M33 34L27 20L22 7M28 21L16 17M26 17L31 8M67 34L73 20L78 7M72 21L84 17M74 17L69 8"/></g>',
    panda:
      '<path d="M75 88Q103 94 94 62Q89 49 83 61Q96 83 75 77Z" fill="#bf743c" stroke="#69402a" stroke-width="2"/><path d="M80 86l12-4M85 76l11-5M85 64l8-5" stroke="#713d26" stroke-width="5"/>',
    otter:
      '<g fill="none" stroke="#88c5c7" stroke-width="2"><path d="M12 80Q4 96 50 97Q96 96 88 80M20 78Q10 89 50 90Q90 89 80 78"/><path d="M9 64q6-8 11 0M83 67q6-8 10 0"/></g>',
  };
  let styled = base;
  if (profile.accessory === 'coat' && profile.animal === 'fox') {
    styled = styled
      .replace(
        '<defs>',
        '<defs><filter id="fox-coat"><feColorMatrix type="saturate" values="0.2"/><feComponentTransfer><feFuncR type="linear" slope="0.82"/><feFuncG type="linear" slope="0.9"/><feFuncB type="linear" slope="1.08"/></feComponentTransfer></filter>'
      )
      .replace('<image ', '<image filter="url(#fox-coat)" ');
  }
  const decoration =
    profile.accessory === 'signature'
      ? signatures[profile.animal]
      : profile.accessory === 'frame'
        ? '<circle cx="50" cy="50" r="46" fill="none" stroke="#bfa368" stroke-width="5"/><circle cx="50" cy="50" r="49" fill="none" stroke="#526f40" stroke-width="2"/><g fill="#6f8b4e"><ellipse cx="12" cy="73" rx="4" ry="9" transform="rotate(-30 12 73)"/><ellipse cx="88" cy="73" rx="4" ry="9" transform="rotate(30 88 73)"/><ellipse cx="19" cy="84" rx="4" ry="8" transform="rotate(-45 19 84)"/><ellipse cx="81" cy="84" rx="4" ry="8" transform="rotate(45 81 84)"/></g>'
        : accessory;
  return styled.replace('</svg>', decoration + '</svg>');
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
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Settings';
  back.addEventListener('click', () => {
    const section = container.closest('details');
    section?.removeAttribute('open');
    section?.querySelector('summary')?.focus();
  });
  const preview = document.createElement('div');
  preview.className = 'companion-preview';
  const options = document.createElement('div');
  options.className = 'companion-options';
  options.setAttribute('role', 'group');
  options.setAttribute('aria-label', 'Favorite animal avatar');
  const accessoryLabel = document.createElement('fieldset');
  accessoryLabel.className = 'animal-decorations';
  const legend = document.createElement('legend');
  legend.textContent = 'Style your animal';
  const accessory = document.createElement('div');
  accessory.setAttribute('role', 'group');
  accessory.setAttribute('aria-label', 'Animal decorations');
  accessoryLabel.append(legend, accessory);
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'companion-save';
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
          if (draft.accessory === 'coat' && animal.id !== 'fox')
            draft.accessory = 'none';
          render();
        });
        return choice;
      })
    );
    const styles: {
      id: CompanionProfile['accessory'];
      name: string;
      rescues: number;
    }[] = [
      { id: 'none', name: 'Natural', rescues: 0 },
      { id: 'frame', name: 'Woodland frame', rescues: 1 },
      { id: 'signature', name: animalStyles[draft.animal].name, rescues: 3 },
      ...(draft.animal === 'fox'
        ? [{ id: 'coat' as const, name: 'Silver coat', rescues: 5 }]
        : []),
    ];
    accessory.replaceChildren(
      ...styles.map((style) => {
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.innerHTML = avatarPortrait({ ...draft, accessory: style.id });
        const name = document.createElement('span');
        name.textContent = style.name;
        choice.append(name);
        choice.title =
          style.id === 'signature'
            ? animalStyles[draft.animal].description
            : style.name;
        choice.disabled = pending || rescues < style.rescues;
        choice.setAttribute(
          'aria-pressed',
          String(draft.accessory === style.id)
        );
        if (rescues < style.rescues) {
          const lock = document.createElement('small');
          lock.textContent = `${style.rescues} rescues`;
          choice.append(lock);
        }
        choice.addEventListener('click', () => {
          draft.accessory = style.id;
          render();
        });
        return choice;
      })
    );
    preview.setAttribute('aria-label', `${draft.animal} avatar preview`);
  }
  save.addEventListener('click', async () => {
    if (pending || !canWear(draft, rescues)) return;
    pending = true;
    save.disabled = true;
    status.textContent = 'Saving your animal…';
    try {
      const data = await api.request('companion', { ...draft, scarf: 'none' });
      const profile = parseCompanion(data);
      if (!profile) throw new Error('Could not confirm your animal.');
      current = profile;
      window.dispatchEvent(new Event('companion-change'));
      status.textContent = 'Animal saved.';
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
      draft = { ...data.profile, scarf: 'none' };
      render();
      save.disabled = !data.signedIn;
      status.textContent = data.signedIn
        ? `${rescues} rescues · Locked friends show their unlock goal.`
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
    back,
    preview,
    options,
    accessoryLabel,
    save,
    status
  );
  void refresh();
}
