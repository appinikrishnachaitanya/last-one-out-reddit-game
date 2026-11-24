import { isObject } from './daily.ts';

export const companions = [
  { id: 'fox', name: 'Fox', rescues: 0 },
  { id: 'turtle', name: 'Turtle', rescues: 0 },
  { id: 'rabbit', name: 'Rabbit', rescues: 0 },
  { id: 'badger', name: 'Badger', rescues: 0 },
  { id: 'owl', name: 'Owl', rescues: 2 },
  { id: 'deer', name: 'Deer', rescues: 5 },
  { id: 'panda', name: 'Red panda', rescues: 10 },
  { id: 'otter', name: 'Otter', rescues: 20 },
] as const;
export type CompanionId = (typeof companions)[number]['id'];
export const scarfColors = {
  none: '',
  moss: '#486d44',
  berry: '#96344d',
  gold: '#bd7518',
} as const;
export type CompanionProfile = {
  animal: CompanionId;
  scarf: keyof typeof scarfColors;
  accessory: 'none' | 'lantern' | 'leaf';
};
export const defaultCompanion: CompanionProfile = {
  animal: 'fox',
  scarf: 'none',
  accessory: 'none',
};
export function parseCompanion(value: unknown): CompanionProfile | undefined {
  if (
    !isObject(value) ||
    !companions.some(({ id }) => id === value.animal) ||
    typeof value.scarf !== 'string' ||
    !Object.hasOwn(scarfColors, value.scarf) ||
    !['none', 'lantern', 'leaf'].includes(String(value.accessory))
  )
    return undefined;
  return value as CompanionProfile;
}
export function canWear(profile: CompanionProfile, rescued: number): boolean {
  const required = companions.find(({ id }) => id === profile.animal)!.rescues;
  return (
    rescued >= required &&
    (profile.accessory === 'none' ||
      rescued >= (profile.accessory === 'leaf' ? 3 : 1))
  );
}
