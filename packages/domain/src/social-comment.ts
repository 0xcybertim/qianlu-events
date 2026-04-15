import {
  facebookCommentTaskConfigSchema,
  instagramCommentTaskConfigSchema,
  type FacebookCommentTaskConfig,
  type InstagramCommentTaskConfig,
} from "@qianlu-events/schemas";

type SocialCommentTaskInput = {
  configJson?: unknown;
  platform: string;
  type: string;
};

export type SocialCommentTaskConfig =
  | FacebookCommentTaskConfig
  | InstagramCommentTaskConfig;

export type SupportedSocialCommentPlatform = "FACEBOOK" | "INSTAGRAM";

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeCommentText(value: string) {
  return normalizeWhitespace(value).toUpperCase();
}

export function isSupportedSocialCommentPlatform(
  platform: string,
): platform is SupportedSocialCommentPlatform {
  return platform === "FACEBOOK" || platform === "INSTAGRAM";
}

export function getFacebookCommentTaskConfig(
  task: SocialCommentTaskInput,
): FacebookCommentTaskConfig | null {
  if (task.type !== "SOCIAL_COMMENT" || task.platform !== "FACEBOOK") {
    return null;
  }

  const parsed = facebookCommentTaskConfigSchema.safeParse(task.configJson);

  return parsed.success ? parsed.data : null;
}

export function getInstagramCommentTaskConfig(
  task: SocialCommentTaskInput,
): InstagramCommentTaskConfig | null {
  if (task.type !== "SOCIAL_COMMENT" || task.platform !== "INSTAGRAM") {
    return null;
  }

  const parsed = instagramCommentTaskConfigSchema.safeParse(task.configJson);

  return parsed.success ? parsed.data : null;
}

export function getSocialCommentTaskConfig(
  task: SocialCommentTaskInput,
): SocialCommentTaskConfig | null {
  if (task.type !== "SOCIAL_COMMENT" || !isSupportedSocialCommentPlatform(task.platform)) {
    return null;
  }

  if (task.platform === "FACEBOOK") {
    return getFacebookCommentTaskConfig(task);
  }

  return getInstagramCommentTaskConfig(task);
}

export function getSocialCommentTargetId(config: SocialCommentTaskConfig) {
  if ("facebookPostId" in config) {
    return config.facebookPostId;
  }

  return config.instagramMediaId;
}

export function buildSocialCommentText(args: {
  task: SocialCommentTaskInput;
  verificationCode: string;
}) {
  const config = getSocialCommentTaskConfig(args.task);

  if (!config) {
    return null;
  }

  if (!config.requireVerificationCode) {
    return normalizeWhitespace(config.requiredPrefix);
  }

  return normalizeWhitespace(
    `${config.requiredPrefix} ${args.verificationCode.toUpperCase()}`,
  );
}

export function matchesSocialCommentText(args: {
  actualCommentText: string;
  expectedCommentText: string;
}) {
  return (
    normalizeCommentText(args.actualCommentText) ===
    normalizeCommentText(args.expectedCommentText)
  );
}

export function extractVerificationCodeFromSocialComment(args: {
  commentText: string;
  requiredPrefix: string;
}) {
  const normalizedComment = normalizeCommentText(args.commentText);
  const normalizedPrefix = normalizeCommentText(args.requiredPrefix);

  if (!normalizedComment.startsWith(`${normalizedPrefix} `)) {
    return null;
  }

  const verificationCode = normalizedComment
    .slice(normalizedPrefix.length + 1)
    .trim();

  if (!verificationCode || verificationCode.includes(" ")) {
    return null;
  }

  return verificationCode;
}

export function isAutoVerifiableSocialCommentTask(task: SocialCommentTaskInput) {
  return Boolean(getSocialCommentTaskConfig(task)?.autoVerify);
}

export function buildFacebookCommentText(args: {
  task: SocialCommentTaskInput;
  verificationCode: string;
}) {
  return buildSocialCommentText(args);
}

export function matchesFacebookCommentText(args: {
  actualCommentText: string;
  expectedCommentText: string;
}) {
  return matchesSocialCommentText(args);
}

export function extractVerificationCodeFromFacebookComment(args: {
  commentText: string;
  requiredPrefix: string;
}) {
  return extractVerificationCodeFromSocialComment(args);
}
