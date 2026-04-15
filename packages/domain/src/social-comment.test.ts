import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSocialCommentText,
  extractVerificationCodeFromSocialComment,
  getFacebookCommentTaskConfig,
  getInstagramCommentTaskConfig,
  getSocialCommentTargetId,
  isAutoVerifiableSocialCommentTask,
  matchesSocialCommentText,
} from "./social-comment.js";

test("facebook social comment config stays compatible", () => {
  const task = {
    configJson: {
      autoVerify: true,
      facebookPostId: "123_456",
      primaryUrl: "https://facebook.com/example/posts/123",
      requireVerificationCode: true,
      requiredPrefix: "QIANLU",
    },
    platform: "FACEBOOK",
    type: "SOCIAL_COMMENT",
  } as const;

  const config = getFacebookCommentTaskConfig(task);

  assert.ok(config);
  assert.equal(getSocialCommentTargetId(config), "123_456");
  assert.equal(
    buildSocialCommentText({
      task,
      verificationCode: "ab12cd",
    }),
    "QIANLU AB12CD",
  );
  assert.equal(isAutoVerifiableSocialCommentTask(task), true);
});

test("instagram social comment config uses the shared helpers", () => {
  const task = {
    configJson: {
      autoVerify: true,
      instagramMediaId: "17890000000000000",
      primaryUrl: "https://www.instagram.com/p/ABC123/",
      requireVerificationCode: true,
      requiredPrefix: "JOIN QL",
    },
    platform: "INSTAGRAM",
    type: "SOCIAL_COMMENT",
  } as const;

  const config = getInstagramCommentTaskConfig(task);

  assert.ok(config);
  assert.equal(getSocialCommentTargetId(config), "17890000000000000");
  assert.equal(
    buildSocialCommentText({
      task,
      verificationCode: "xy98zt",
    }),
    "JOIN QL XY98ZT",
  );
  assert.equal(isAutoVerifiableSocialCommentTask(task), true);
});

test("shared comment matching normalizes whitespace and case", () => {
  assert.equal(
    matchesSocialCommentText({
      actualCommentText: "  qianlu   ab12cd ",
      expectedCommentText: "QIANLU AB12CD",
    }),
    true,
  );
});

test("shared verification code extraction keeps the exact-token rule", () => {
  assert.equal(
    extractVerificationCodeFromSocialComment({
      commentText: "QIANLU ab12cd",
      requiredPrefix: "qianlu",
    }),
    "AB12CD",
  );

  assert.equal(
    extractVerificationCodeFromSocialComment({
      commentText: "QIANLU AB12 CD",
      requiredPrefix: "QIANLU",
    }),
    null,
  );
});
