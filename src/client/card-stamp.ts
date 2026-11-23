const earnedFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

export function cardStamp(owner: unknown, earnedAt: unknown): HTMLElement {
  const stamp = document.createElement('small');
  stamp.className = 'card-stamp';
  if (typeof owner === 'string' && /^[a-z0-9_-]{1,32}$/i.test(owner)) {
    const name = document.createElement('span');
    name.textContent = `u/${owner}`;
    stamp.append(name);
  }
  if (typeof earnedAt === 'string' && Number.isFinite(Date.parse(earnedAt))) {
    const time = document.createElement('time');
    time.dateTime = earnedAt;
    time.textContent = earnedFormat.format(new Date(earnedAt));
    stamp.append(time);
  }
  return stamp;
}
