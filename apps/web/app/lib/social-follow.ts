type SocialFollowTaskShape = {
  configJson?: {
    socialFollowGroupKey?: string;
  } | null;
  description: string;
  points: number;
  requiresVerification: boolean;
  type: string;
  verificationType: string;
};

type SocialFollowTaskItem<TTask extends SocialFollowTaskShape = SocialFollowTaskShape> = {
  task: TTask;
};

export function getSocialFollowGroupKey(task: SocialFollowTaskShape) {
  if (task.type !== "SOCIAL_FOLLOW") {
    return null;
  }

  const configuredGroupKey = task.configJson?.socialFollowGroupKey?.trim();

  if (configuredGroupKey) {
    return `group:${configuredGroupKey}`;
  }

  // Legacy rows predate socialFollowGroupKey. Fall back to the shared
  // non-platform fields that historically defined one follow bundle.
  return `legacy:${JSON.stringify([
    task.description.trim(),
    task.points,
    task.requiresVerification,
    task.verificationType,
  ])}`;
}

export function groupSocialFollowItems<TItem extends SocialFollowTaskItem>(
  items: TItem[],
) {
  const groups: Array<{ groupKey: string; items: TItem[] }> = [];
  const itemsByGroupKey = new Map<string, TItem[]>();

  for (const item of items) {
    const groupKey = getSocialFollowGroupKey(item.task);

    if (!groupKey) {
      continue;
    }

    const existingItems = itemsByGroupKey.get(groupKey);

    if (existingItems) {
      existingItems.push(item);
      continue;
    }

    const nextItems = [item];

    itemsByGroupKey.set(groupKey, nextItems);
    groups.push({
      groupKey,
      items: nextItems,
    });
  }

  return groups;
}
