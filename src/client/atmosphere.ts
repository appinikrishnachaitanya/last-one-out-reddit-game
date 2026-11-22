export const scenery = {
  moon: { texture: 'forest-art', audio: 'moon' },
  dawn: { texture: 'dawn-art', audio: 'dawn' },
  autumn: { texture: 'autumn-art', audio: 'autumn' },
} as const;
export type Scenery = keyof typeof scenery;

function preference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The current session still works without storage.
  }
}

export function setupAtmosphere(onScenery: (id: Scenery) => void): void {
  const select = document.querySelector<HTMLSelectElement>('#scenery');
  const sound = document.querySelector<HTMLButtonElement>('#forest-sound');
  const status = document.querySelector<HTMLElement>('#sound-status');
  const soundtrack = document.querySelector<HTMLSelectElement>('#soundtrack');
  if (!select || !sound || !status || !soundtrack) return;
  const audio = new Audio();
  audio.loop = true;
  audio.volume = 0.36;
  audio.preload = 'none';
  const saved = preference('loo-scenery');
  select.value = saved && Object.hasOwn(scenery, saved) ? saved : 'moon';
  soundtrack.value =
    preference('loo-soundtrack') === 'music' ? 'music' : 'nature';
  let enabled = preference('loo-forest-sound') === 'on';
  let attempt = 0;
  function updateButton(): void {
    sound!.setAttribute('aria-pressed', String(enabled));
    const label = soundtrack!.value === 'music' ? 'Music' : 'Forest sound';
    sound!.textContent = `${label} ${enabled ? 'on' : 'off'}`;
  }
  function play(): void {
    if (!enabled || document.hidden || !audio.paused) return;
    const request = ++attempt;
    void audio
      .play()
      .then(() => {
        if (request === attempt) status!.textContent = '';
      })
      .catch(() => {
        if (request !== attempt || !enabled) return;
        status!.textContent = audio.error
          ? 'Sound is unavailable.'
          : 'Tap the board to resume sound.';
      });
  }
  function changeScenery(): void {
    const id = select!.value as Scenery;
    onScenery(id);
    document.documentElement.dataset.scenery = id;
    remember('loo-scenery', id);
    refreshAudio();
  }
  function refreshAudio(): void {
    const id = select!.value as Scenery;
    const track =
      soundtrack!.value === 'music' ? 'woodland-music' : scenery[id].audio;
    updateButton();
    if (audio.getAttribute('src') === `/audio/${track}.mp3`) return;
    pause();
    status!.textContent = '';
    audio.src = `/audio/${track}.mp3`;
    play();
  }
  function pause(): void {
    attempt++;
    audio.pause();
  }
  sound.addEventListener('click', () => {
    enabled = !enabled;
    remember('loo-forest-sound', enabled ? 'on' : 'off');
    updateButton();
    if (enabled) play();
    else {
      pause();
      status.textContent = '';
    }
  });
  select.addEventListener('change', changeScenery);
  soundtrack.addEventListener('change', () => {
    remember('loo-soundtrack', soundtrack.value);
    refreshAudio();
  });
  document
    .querySelector('#game-container')
    ?.addEventListener('pointerup', play);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else play();
  });
  window.addEventListener('pagehide', pause);
  window.addEventListener('pageshow', play);
  changeScenery();
}
