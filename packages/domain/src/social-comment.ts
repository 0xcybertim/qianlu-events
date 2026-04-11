import {
  facebookCommentTaskConfigSchema,
  type FacebookCommentTaskConfig,
} from "@qianlu-events/schemas";

type SocialCommentTaskInput = {
  configJson?: unknown;
  platform: string;
  type: string;
};

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeCommentText(value: string) {
  return normalizeWhitespace(value).toUpperCase();
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

export function buildFacebookCommentText(args: {
  task: SocialCommentTaskInput;
  verificationCode: string;
}) {
  const config = getFacebookCommentTaskConfig(args.task);

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

export function matchesFacebookCommentText(args: {
  actualCommentText: string;
  expectedCommentText: string;
}) {
  return (
    normalizeCommentText(args.actualCommentText) ===
    normalizeCommentText(args.expectedCommentText)
  );
}

export function extractVerificationCodeFromFacebookComment(args: {
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
