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
  accessory: 'none' | 'lantern' | 'leaf' | 'frame' | 'signature' | 'coat';
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
    !['none', 'lantern', 'leaf', 'frame', 'signature', 'coat'].includes(
      String(value.accessory)
    )
  )
    return undefined;
  if (value.accessory === 'coat' && value.animal !== 'fox') return undefined;
  return value as CompanionProfile;
}
export function canWear(profile: CompanionProfile, rescued: number): boolean {
  const required = companions.find(({ id }) => id === profile.animal)!.rescues;
  return (
    rescued >= required &&
    (profile.accessory === 'none' ||
      rescued >=
        (profile.accessory === 'signature' || profile.accessory === 'leaf'
          ? 3
          : profile.accessory === 'coat'
            ? 5
            : 1))
  );
}

export const animalStyles = {
  fox: {
    name: 'Full tail',
    description: 'A sweeping russet tail with a cream tip.',
  },
  owl: {
    name: 'Spread wings',
    description: 'Feathered wings around your owl’s portrait.',
  },
  rabbit: {
    name: 'Flower crown',
    description: 'A crown of woodland blossoms.',
  },
  turtle: {
    name: 'Mossy shell',
    description: 'Fern leaves around your turtle’s shell.',
  },
  badger: {
    name: 'Forest cloak',
    description: 'A soft moss-green woodland cloak.',
  },
  deer: {
    name: 'Woodland antlers',
    description: 'Branching antlers with tiny leaves.',
  },
  panda: {
    name: 'Ringed tail',
    description: 'A curled tail with warm copper rings.',
  },
  otter: {
    name: 'River ripples',
    description: 'Silver-blue ripples around your otter.',
  },
} as const;
