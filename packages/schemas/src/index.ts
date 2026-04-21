import { z } from "zod";

export const eventStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export const taskTypeSchema = z.enum([
  "SOCIAL_FOLLOW",
  "SOCIAL_LIKE",
  "SOCIAL_SHARE",
  "SOCIAL_COMMENT",
  "SOCIAL_COMMENT_SELF_CLAIM",
  "LEAD_FORM",
  "QUIZ",
  "NEWSLETTER_OPT_IN",
  "WHATSAPP_OPT_IN",
  "REFERRAL",
  "PHOTO_PROOF",
  "STAMP_SCAN",
]);
export const socialPlatformSchema = z.enum([
  "INSTAGRAM",
  "FACEBOOK",
  "TIKTOK",
  "WHATSAPP",
  "EMAIL",
  "IN_PERSON",
  "NONE",
]);
export const verificationTypeSchema = z.enum([
  "NONE",
  "AUTOMATIC",
  "VISUAL_STAFF_CHECK",
  "STAFF_PIN_CONFIRM",
]);
export const taskAttemptStatusSchema = z.enum([
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED_BY_USER",
  "PENDING_STAFF_CHECK",
  "PENDING_AUTO_VERIFICATION",
  "VERIFIED",
  "REJECTED",
]);
export const rewardTypeSchema = z.enum([
  "INSTANT_REWARD",
  "TIERED_REWARD",
  "DAILY_PRIZE_DRAW",
]);
export const qrScanStatusSchema = z.enum([
  "ACCEPTED",
  "DUPLICATE",
  "EXPIRED",
  "INACTIVE",
  "WRONG_EVENT",
]);
export const adminRoleSchema = z.enum(["OWNER", "EDITOR", "VIEWER"]);

export const verificationCodeParamSchema = z
  .string()
  .trim()
  .min(4)
  .max(24)
  .transform((code) => code.replace(/[\s-]/g, "").toUpperCase());

export const rewardTierSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string().trim().min(1).optional(),
  threshold: z.number().int().nonnegative(),
});

export const participantMessagingSchema = z.object({
  saveProgressMessage: z.string().trim().min(1).optional(),
  prizeDrawLabel: z.string().trim().min(1).optional(),
  laterPrizeLabel: z.string().trim().min(1).optional(),
});

export const eventMarketingSchema = z
  .object({
    primaryPixelId: z.string().trim().min(1).optional(),
    secondaryPixelId: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.primaryPixelId &&
      value.secondaryPixelId &&
      value.primaryPixelId === value.secondaryPixelId
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Use two different pixel IDs or leave the second one blank.",
        path: ["secondaryPixelId"],
      });
    }
  });

export const eventBrandingSchema = z.object({
  primary: z.string(),
  primaryContrast: z.string(),
  secondary: z.string(),
  surface: z.string(),
  surfaceStrong: z.string(),
  text: z.string(),
  border: z.string(),
});

export const eventSettingsSchema = z.object({
  rewardTypes: z.array(rewardTypeSchema),
  rewardTiers: z.array(rewardTierSchema),
  participantMessaging: participantMessagingSchema.optional(),
  marketing: eventMarketingSchema.optional(),
});

export const formQuestionTypeSchema = z.enum([
  "TEXT",
  "EMAIL",
  "PHONE",
  "TEXTAREA",
  "SINGLE_SELECT",
  "MULTI_SELECT",
  "BOOLEAN",
]);

export const formQuestionFieldKeySchema = z.enum([
  "NONE",
  "NAME",
  "EMAIL",
  "PHONE",
  "OPT_IN",
  "CONTACT_METHOD",
]);

export const formQuestionShowWhenSchema = z.object({
  questionId: z.string().trim().min(1),
  answers: z.array(z.string().trim().min(1)).min(1),
});

export const formQuestionGroupSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  questions: z.array(
    z.object({
      id: z.string().trim().min(1),
      label: z.string().trim().min(1),
      type: formQuestionTypeSchema,
      required: z.boolean().optional(),
      helperText: z.string().trim().min(1).optional(),
      options: z.array(z.string().trim().min(1)).optional(),
      allowOther: z.boolean().optional(),
      fieldKey: formQuestionFieldKeySchema.optional(),
    }).superRefine((value, ctx) => {
      const expectsOptions =
        value.type === "SINGLE_SELECT" || value.type === "MULTI_SELECT";

      if (expectsOptions && (!value.options || value.options.length === 0)) {
        ctx.addIssue({
          code: "custom",
          message: "Question options are required for select questions.",
          path: ["options"],
        });
      }

      if (!expectsOptions && value.options && value.options.length > 0) {
        ctx.addIssue({
          code: "custom",
          message: "Only select questions can define options.",
          path: ["options"],
        });
      }
    }),
  ),
});

export const formQuestionSchema = z
  .object({
    id: z.string().trim().min(1),
    label: z.string().trim().min(1),
    type: formQuestionTypeSchema,
    required: z.boolean().optional(),
    helperText: z.string().trim().min(1).optional(),
    options: z.array(z.string().trim().min(1)).optional(),
    allowOther: z.boolean().optional(),
    fieldKey: formQuestionFieldKeySchema.optional(),
    showWhen: formQuestionShowWhenSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const expectsOptions =
      value.type === "SINGLE_SELECT" || value.type === "MULTI_SELECT";

    if (expectsOptions && (!value.options || value.options.length === 0)) {
      ctx.addIssue({
        code: "custom",
        message: "Question options are required for select questions.",
        path: ["options"],
      });
    }

    if (!expectsOptions && value.options && value.options.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "Only select questions can define options.",
        path: ["options"],
      });
    }
  });

export const taskConfigSchema = z.object({
  primaryUrl: z.string().url().optional(),
  secondaryUrl: z.string().url().optional(),
  primaryLabel: z.string().trim().min(1).optional(),
  secondaryLabel: z.string().trim().min(1).optional(),
  proofHint: z.string().trim().min(1).optional(),
  requiredPrefix: z.string().trim().min(1).optional(),
  requireVerificationCode: z.boolean().optional(),
  commentInstructions: z.string().trim().min(1).optional(),
  autoVerify: z.boolean().optional(),
  facebookPostId: z.string().trim().min(1).optional(),
  instagramMediaId: z.string().trim().min(1).optional(),
  stampRunKey: z.string().trim().min(1).optional(),
  stampRunLabel: z.string().trim().min(1).optional(),
  formQuestions: z.array(formQuestionSchema).optional(),
  formGroupIntroLabel: z.string().trim().min(1).optional(),
  formGroups: z.array(formQuestionGroupSchema).optional(),
});

export const facebookCommentTaskConfigSchema = taskConfigSchema.extend({
  primaryUrl: z.string().url(),
  requiredPrefix: z.string().trim().min(1),
  requireVerificationCode: z.boolean().default(true),
  commentInstructions: z.string().trim().min(1).optional(),
  autoVerify: z.boolean().default(true),
  facebookPostId: z.string().trim().min(1),
});

export const instagramCommentTaskConfigSchema = taskConfigSchema.extend({
  primaryUrl: z.string().url(),
  requiredPrefix: z.string().trim().min(1),
  requireVerificationCode: z.boolean().default(true),
  commentInstructions: z.string().trim().min(1).optional(),
  autoVerify: z.boolean().default(true),
  instagramMediaId: z.string().trim().min(1),
});

export const eventSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: eventStatusSchema,
  brandingJson: eventBrandingSchema.nullable().optional(),
  settingsJson: eventSettingsSchema.nullable().optional(),
});

export const taskSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  type: taskTypeSchema,
  platform: socialPlatformSchema,
  title: z.string(),
  description: z.string(),
  points: z.number().int().nonnegative(),
  requiresVerification: z.boolean(),
  verificationType: verificationTypeSchema,
  configJson: taskConfigSchema.nullable().optional(),
});

export const taskAttemptSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  status: taskAttemptStatusSchema,
  verificationRequired: z.boolean().optional(),
  proofJson: z.unknown().nullable().optional(),
});

export const rewardEligibilitySchema = z.object({
  id: z.string(),
  rewardType: rewardTypeSchema,
  rewardKey: z.string(),
  eligible: z.boolean(),
  verified: z.boolean(),
  reason: z.string().nullable().optional(),
});

export const participantSessionSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  participantAccountUuid: z.string().nullable().optional(),
  verificationCode: z.string(),
  email: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  claimedPoints: z.number().int(),
  verifiedPoints: z.number().int(),
  rewardTier: z.string().nullable().optional(),
  instantRewardEligible: z.boolean(),
  dailyDrawEligible: z.boolean(),
  taskAttempts: z.array(taskAttemptSchema),
  rewardEligibility: z.array(rewardEligibilitySchema),
});

export const qrScanBodySchema = z.object({
  token: z.string().trim().min(16),
});

export const qrScanResultSchema = z.object({
  status: qrScanStatusSchema,
  message: z.string(),
  pointsAwarded: z.number().int().nonnegative(),
  session: participantSessionSchema,
});

export const eventWithTasksSchema = eventSchema.extend({
  tasks: z.array(taskSchema),
});

export const experienceResponseSchema = z.object({
  event: eventWithTasksSchema,
  session: participantSessionSchema.nullable(),
});

export const createSessionBodySchema = z.object({
  eventSlug: z.string().min(1),
});

export const participantLoginLinkRequestBodySchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  eventSlug: z.string().trim().min(1),
});

export const participantClerkLinkBodySchema = z.object({
  eventSlug: z.string().trim().min(1),
});

export const participantLoginLinkConsumeBodySchema = z.object({
  token: z.string().trim().min(24),
});

export const participantLoginLinkRequestResponseSchema = z.object({
  ok: z.boolean(),
  devLoginUrl: z.string().url().nullable().optional(),
  email: z.string(),
  expiresAt: z.string(),
});

export const participantLoginLinkConsumeResponseSchema = z.object({
  ok: z.boolean(),
  eventSlug: z.string(),
  session: participantSessionSchema,
});

export const taskClaimBodySchema = z.object({
  eventSlug: z.string().min(1),
  status: z.enum(["COMPLETED_BY_USER", "PENDING_STAFF_CHECK"]),
});

export const taskResetBodySchema = z.object({
  eventSlug: z.string().min(1),
});

export const taskAwaitAutoVerificationBodySchema = z.object({
  eventSlug: z.string().min(1),
});

export const taskFormSubmissionBodySchema = z.object({
  eventSlug: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  email: z.email().optional(),
  answer1: z.string().trim().min(1).optional(),
  answer2: z.string().trim().min(1).optional(),
  answer3: z.string().trim().min(1).optional(),
  optIn: z.boolean().optional(),
  phone: z.string().trim().min(1).optional(),
  responses: z
    .record(
      z.string(),
      z.union([
        z.string().trim().min(1),
        z.array(z.string().trim().min(1)).min(1),
        z.boolean(),
      ]),
    )
    .optional(),
  otherResponses: z.record(z.string(), z.string().trim().min(1)).optional(),
  groupSelections: z.record(z.string(), z.boolean()).optional(),
});

export const verificationPinBodySchema = z.object({
  pin: z.string().trim().min(4),
});

export const verificationTaskDecisionBodySchema = z.object({
  eventSlug: z.string().min(1),
  pin: z.string().trim().min(4),
});

export const staffSessionParamsSchema = z.object({
  eventSlug: z.string().min(1),
  verificationCode: verificationCodeParamSchema,
});

export const staffTaskDecisionBodySchema = z.object({
  pin: z.string().trim().min(4),
});

export const adminAuthLoginBodySchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});

export const adminAccountSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
});

export const adminSessionResponseSchema = z.object({
  ok: z.boolean(),
  account: adminAccountSchema.nullable().optional(),
});

export const adminEventCreateBodySchema = z.object({
  name: z.string().trim().min(1),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
      message: "Use lowercase letters, numbers, and single dashes.",
    }),
  status: eventStatusSchema.default("DRAFT"),
  brandingJson: eventBrandingSchema.optional(),
  settingsJson: eventSettingsSchema.optional(),
});

export const adminEventUpdateBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    status: eventStatusSchema.optional(),
    brandingJson: eventBrandingSchema.optional(),
    settingsJson: eventSettingsSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one event field is required.",
  });

export const adminTaskConfigSchema = taskConfigSchema.partial();

const adminTaskWriteFields = {
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  type: taskTypeSchema,
  platform: socialPlatformSchema,
  points: z.number().int().nonnegative(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  requiresVerification: z.boolean(),
  verificationType: verificationTypeSchema,
  configJson: adminTaskConfigSchema.nullable().optional(),
};

export const adminTaskCreateBodySchema = z.object(adminTaskWriteFields);
export const adminTaskCreateBodyWithFacebookSourceSchema =
  adminTaskCreateBodySchema.extend({
    facebookSourcePageId: z.string().trim().min(1).optional(),
    instagramSourceAccountId: z.string().trim().min(1).optional(),
  });

export const adminTaskUpdateBodySchema = z
  .object({
    title: adminTaskWriteFields.title.optional(),
    description: adminTaskWriteFields.description.optional(),
    type: adminTaskWriteFields.type.optional(),
    platform: adminTaskWriteFields.platform.optional(),
    points: adminTaskWriteFields.points.optional(),
    sortOrder: adminTaskWriteFields.sortOrder.optional(),
    isActive: adminTaskWriteFields.isActive.optional(),
    requiresVerification: adminTaskWriteFields.requiresVerification.optional(),
    verificationType: adminTaskWriteFields.verificationType.optional(),
    configJson: adminTaskWriteFields.configJson,
    facebookSourcePageId: z.string().trim().min(1).optional(),
    instagramSourceAccountId: z.string().trim().min(1).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one task field is required.",
  });

export const adminEventSummarySchema = eventSchema.extend({
  taskCount: z.number().int().nonnegative(),
  participantCount: z.number().int().nonnegative(),
  leadCount: z.number().int().nonnegative(),
  adminRole: adminRoleSchema,
});

export const adminTaskSchema = taskSchema.extend({
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});

export const adminFacebookConnectionSchema = z.object({
  pageId: z.string(),
  pageName: z.string().nullable(),
  hasAccessToken: z.boolean(),
  tokenHint: z.string().nullable(),
  updatedAt: z.string(),
});

export const adminEventDetailSchema = eventSchema.extend({
  tasks: z.array(adminTaskSchema),
  participantCount: z.number().int().nonnegative(),
  leadCount: z.number().int().nonnegative(),
  facebookConnection: adminFacebookConnectionSchema.nullable().optional(),
  instagramConnection: z
    .object({
      pageId: z.string(),
      pageName: z.string().nullable(),
      instagramAccountId: z.string(),
      instagramUsername: z.string().nullable(),
      hasAccessToken: z.boolean(),
      tokenHint: z.string().nullable(),
      tokenExpiresAt: z.string().nullable().optional(),
      updatedAt: z.string(),
    })
    .nullable()
    .optional(),
});

export const adminFacebookConnectionUpsertBodySchema = z.object({
  pageId: z.string().trim().min(1),
  pageName: z.string().trim().min(1).optional(),
  pageAccessToken: z.string().trim().min(1).optional(),
});

export const adminFacebookPageOptionSchema = z.object({
  pageId: z.string(),
  pageName: z.string(),
});

export const adminFacebookPendingConnectionSchema = z.object({
  pages: z.array(adminFacebookPageOptionSchema),
  expiresAt: z.string(),
});

export const adminFacebookPostOptionSchema = z.object({
  createdAt: z.string().nullable(),
  messagePreview: z.string(),
  permalinkUrl: z.string().url().nullable(),
  postId: z.string(),
});

export const adminFacebookSourcePageSchema = z.object({
  pageId: z.string(),
  pageName: z.string(),
  posts: z.array(adminFacebookPostOptionSchema),
});

export const adminFacebookPostOptionsResponseSchema = z.object({
  error: z.string().nullable(),
  selectedPageId: z.string().nullable(),
  pages: z.array(adminFacebookSourcePageSchema),
});

export const adminFacebookConnectionSelectBodySchema = z.object({
  pageId: z.string().trim().min(1),
});

export const adminInstagramConnectionUpsertBodySchema = z.object({
  pageId: z.string().trim().min(1),
  pageName: z.string().trim().min(1).optional(),
  instagramAccountId: z.string().trim().min(1),
  instagramUsername: z.string().trim().min(1).optional(),
  accessToken: z.string().trim().min(1).optional(),
  tokenExpiresAt: z.string().trim().min(1).optional(),
});

export const adminInstagramAccountOptionSchema = z.object({
  pageId: z.string(),
  pageName: z.string(),
  instagramAccountId: z.string(),
  instagramUsername: z.string().nullable(),
});

export const adminInstagramPendingConnectionSchema = z.object({
  accounts: z.array(adminInstagramAccountOptionSchema),
  expiresAt: z.string(),
});

export const adminInstagramMediaOptionSchema = z.object({
  captionPreview: z.string(),
  mediaId: z.string(),
  mediaType: z.string().nullable(),
  permalink: z.string().url().nullable(),
  timestamp: z.string().nullable(),
});

export const adminInstagramMediaOptionsResponseSchema = z.object({
  account: z
    .object({
      instagramAccountId: z.string(),
      instagramUsername: z.string().nullable(),
      pageId: z.string(),
      pageName: z.string().nullable(),
    })
    .nullable(),
  error: z.string().nullable(),
  media: z.array(adminInstagramMediaOptionSchema),
});

export const adminInstagramConnectionSelectBodySchema = z.object({
  instagramAccountId: z.string().trim().min(1),
});

export const adminInstagramConnectionDebugSchema = z.object({
  createdAt: z.string(),
  consumedAt: z.string().nullable(),
  expiresAt: z.string(),
  state: z.string(),
  accounts: z.array(
    z.object({
      pageId: z.string(),
      pageName: z.string(),
      instagramAccountId: z.string(),
      instagramUsername: z.string().nullable(),
    }),
  ),
  rawPages: z.array(
    z.object({
      pageId: z.string().nullable(),
      pageName: z.string().nullable(),
      instagramAccountId: z.string().nullable(),
      instagramUsername: z.string().nullable(),
      hasInstagramAccount: z.boolean(),
      hasPageAccessToken: z.boolean(),
      tokenHint: z.string().nullable(),
      error: z.string().nullable(),
    }),
  ),
  warnings: z.array(z.string()),
});

export const adminFacebookConnectionDebugSchema = z.object({
  createdAt: z.string(),
  consumedAt: z.string().nullable(),
  expiresAt: z.string(),
  discoveryLogs: z.array(
    z.object({
      businessId: z.string().nullable(),
      businessName: z.string().nullable(),
      count: z.number().int().nonnegative().nullable(),
      endpoint: z.enum([
        "/me/accounts",
        "/me/businesses",
        "/{business-id}/owned_pages",
        "/{business-id}/client_pages",
        "/{page-id}",
      ]),
      error: z.string().nullable(),
      pageId: z.string().nullable(),
      pageName: z.string().nullable(),
    }),
  ),
  discoveryWarnings: z.array(
    z.object({
      businessId: z.string().nullable(),
      businessName: z.string().nullable(),
      message: z.string(),
      stage: z.enum([
        "business_client_pages",
        "business_owned_pages",
        "user_businesses",
      ]),
    }),
  ),
  pages: z.array(adminFacebookPageOptionSchema),
  rawPages: z.array(
    z.object({
      accessTokenReturned: z.boolean(),
      businesses: z.array(
        z.object({
          businessId: z.string().nullable(),
          businessName: z.string().nullable(),
          permittedRoles: z.array(z.string()),
        }),
      ),
      pageId: z.string().nullable(),
      pageName: z.string().nullable(),
      permittedTasks: z.array(z.string()),
      sources: z.array(
        z.enum([
          "user_accounts",
          "business_owned_pages",
          "business_client_pages",
        ]),
      ),
      tasks: z.array(z.string()),
      tokenLookupAttempted: z.boolean(),
      tokenLookupError: z.string().nullable(),
    }),
  ),
  droppedPages: z.array(
    z.object({
      pageId: z.string().nullable(),
      pageName: z.string().nullable(),
      reason: z.enum([
        "missing_access_token",
        "missing_id",
        "missing_name",
        "token_lookup_failed",
      ]),
    }),
  ),
  state: z.string(),
});

export const adminFacebookCommentTaskDebugSchema = z.object({
  taskId: z.string(),
  taskTitle: z.string(),
  connectedPageId: z.string().nullable(),
  connectedPageMatchesPostIdPrefix: z.boolean().nullable(),
  connectedPageName: z.string().nullable(),
  facebookPostId: z.string(),
  primaryUrl: z.string().nullable(),
  requiredPrefix: z.string(),
  autoVerify: z.boolean(),
  requireVerificationCode: z.boolean(),
  pendingAttemptCount: z.number().int().nonnegative(),
  verifiedAttemptCount: z.number().int().nonnegative(),
  unmatchedCommentCount: z.number().int().nonnegative(),
  liveCommentCount: z.number().int().nonnegative(),
  liveLookupError: z.string().nullable(),
  recentAttempts: z.array(
    z.object({
      awaitingAutoVerificationAt: z.string().nullable(),
      expectedCommentText: z.string().nullable(),
      matchedCommentId: z.string().nullable(),
      matchedCommentText: z.string().nullable(),
      participantEmail: z.string().nullable(),
      participantName: z.string().nullable(),
      participantSessionId: z.string(),
      source: z.string().nullable(),
      status: taskAttemptStatusSchema,
      taskAttemptId: z.string(),
      updatedAt: z.string(),
      verificationCode: z.string(),
      verifiedAutomaticallyAt: z.string().nullable(),
    }),
  ),
  recentComments: z.array(
    z.object({
      commentText: z.string().nullable(),
      createdAt: z.string(),
      externalCommentId: z.string(),
      externalPostId: z.string().nullable(),
      matched: z.boolean(),
      participantSessionId: z.string().nullable(),
      participantVerificationCode: z.string().nullable(),
      processedAt: z.string().nullable(),
      taskAttemptId: z.string().nullable(),
    }),
  ),
  liveComments: z.array(
    z.object({
      commentId: z.string(),
      createdAt: z.string().nullable(),
      matchingAttemptIds: z.array(z.string()),
      matchingExpectedCommentTexts: z.array(z.string()),
      matchingVerificationCodes: z.array(z.string()),
      message: z.string().nullable(),
      normalizedMessage: z.string().nullable(),
      parentId: z.string().nullable(),
    }),
  ),
});

export const adminFacebookCommentDebugResponseSchema = z.object({
  tasks: z.array(adminFacebookCommentTaskDebugSchema),
});

export const adminInstagramCommentTaskDebugSchema = z.object({
  taskId: z.string(),
  taskTitle: z.string(),
  connectedInstagramAccountId: z.string().nullable(),
  connectedInstagramUsername: z.string().nullable(),
  connectedPageId: z.string().nullable(),
  connectedPageName: z.string().nullable(),
  instagramMediaId: z.string(),
  primaryUrl: z.string().nullable(),
  requiredPrefix: z.string(),
  autoVerify: z.boolean(),
  requireVerificationCode: z.boolean(),
  pendingAttemptCount: z.number().int().nonnegative(),
  verifiedAttemptCount: z.number().int().nonnegative(),
  unmatchedCommentCount: z.number().int().nonnegative(),
  liveCommentCount: z.number().int().nonnegative(),
  liveLookupError: z.string().nullable(),
  recentAttempts: z.array(
    z.object({
      awaitingAutoVerificationAt: z.string().nullable(),
      expectedCommentText: z.string().nullable(),
      matchedCommentId: z.string().nullable(),
      matchedCommentText: z.string().nullable(),
      participantEmail: z.string().nullable(),
      participantName: z.string().nullable(),
      participantSessionId: z.string(),
      source: z.string().nullable(),
      status: taskAttemptStatusSchema,
      taskAttemptId: z.string(),
      updatedAt: z.string(),
      verificationCode: z.string(),
      verifiedAutomaticallyAt: z.string().nullable(),
    }),
  ),
  recentComments: z.array(
    z.object({
      commentText: z.string().nullable(),
      createdAt: z.string(),
      externalCommentId: z.string(),
      externalPostId: z.string().nullable(),
      matched: z.boolean(),
      participantSessionId: z.string().nullable(),
      participantVerificationCode: z.string().nullable(),
      processedAt: z.string().nullable(),
      taskAttemptId: z.string().nullable(),
    }),
  ),
  liveComments: z.array(
    z.object({
      commentId: z.string(),
      createdAt: z.string().nullable(),
      matchingAttemptIds: z.array(z.string()),
      matchingExpectedCommentTexts: z.array(z.string()),
      matchingVerificationCodes: z.array(z.string()),
      message: z.string().nullable(),
      normalizedMessage: z.string().nullable(),
      parentId: z.string().nullable(),
      username: z.string().nullable(),
    }),
  ),
});

export const adminInstagramCommentDebugResponseSchema = z.object({
  tasks: z.array(adminInstagramCommentTaskDebugSchema),
});

export const adminParticipantStatusCountsSchema = z.record(
  taskAttemptStatusSchema,
  z.number().int().nonnegative(),
);

export const adminParticipantSchema = z.object({
  id: z.string(),
  verificationCode: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  claimedPoints: z.number().int(),
  verifiedPoints: z.number().int(),
  rewardTier: z.string().nullable(),
  instantRewardEligible: z.boolean(),
  dailyDrawEligible: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  statusCounts: adminParticipantStatusCountsSchema,
});

export const adminLeadSchema = z.object({
  id: z.string(),
  verificationCode: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  optIn: z.boolean().nullable(),
  submittedTask: z.string(),
  submittedTaskId: z.string(),
  status: taskAttemptStatusSchema,
  submittedAt: z.string().nullable(),
  selectedInterests: z.array(z.string()),
  answers: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      groupTitle: z.string().nullable(),
      value: z.union([
        z.string(),
        z.array(z.string()),
        z.boolean(),
      ]).nullable(),
      otherValue: z.string().nullable(),
    }),
  ),
  proofJson: z.unknown().nullable(),
});

export const adminRewardTierCountSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string().nullable().optional(),
  threshold: z.number().int().nonnegative(),
  claimedCount: z.number().int().nonnegative(),
  verifiedCount: z.number().int().nonnegative(),
});

export const adminRewardsReportSchema = z.object({
  instantRewardEligibleCount: z.number().int().nonnegative(),
  dailyDrawEligibleCount: z.number().int().nonnegative(),
  tierCounts: z.array(adminRewardTierCountSchema),
  eligibleParticipants: z.object({
    instantReward: z.array(adminParticipantSchema),
    dailyDraw: z.array(adminParticipantSchema),
  }),
});

export const adminEventsResponseSchema = z.object({
  events: z.array(adminEventSummarySchema),
});

export const adminParticipantsResponseSchema = z.object({
  participants: z.array(adminParticipantSchema),
});

export const adminLeadsResponseSchema = z.object({
  leads: z.array(adminLeadSchema),
});

export const adminQrCodeCreateBodySchema = z.object({
  taskId: z.string().trim().min(1),
  label: z.string().trim().min(1).optional(),
  validFrom: z.string().trim().min(1).optional(),
  validUntil: z.string().trim().min(1).optional(),
  scanLimitPerSession: z.number().int().positive().default(1),
  cooldownSeconds: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().default(true),
});

export const adminQrCodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  taskId: z.string(),
  taskTitle: z.string(),
  taskType: taskTypeSchema,
  scanUrl: z.string().nullable(),
  isActive: z.boolean(),
  isRunning: z.boolean(),
  validFrom: z.string().nullable(),
  validUntil: z.string().nullable(),
  scanLimitPerSession: z.number().int().positive(),
  cooldownSeconds: z.number().int().positive().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  scanCounts: z.object({
    accepted: z.number().int().nonnegative(),
    duplicate: z.number().int().nonnegative(),
    expired: z.number().int().nonnegative(),
    inactive: z.number().int().nonnegative(),
    wrongEvent: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

export const adminQrCodesResponseSchema = z.object({
  qrCodes: z.array(adminQrCodeSchema),
});

export const staffSessionLookupResponseSchema = z.object({
  event: eventWithTasksSchema,
  session: participantSessionSchema,
});

export type EventStatus = z.infer<typeof eventStatusSchema>;
export type TaskType = z.infer<typeof taskTypeSchema>;
export type SocialPlatform = z.infer<typeof socialPlatformSchema>;
export type VerificationType = z.infer<typeof verificationTypeSchema>;
export type TaskAttemptStatus = z.infer<typeof taskAttemptStatusSchema>;
export type RewardType = z.infer<typeof rewardTypeSchema>;
export type QrScanStatus = z.infer<typeof qrScanStatusSchema>;
export type AdminRole = z.infer<typeof adminRoleSchema>;
export type RewardTier = z.infer<typeof rewardTierSchema>;
export type ParticipantMessaging = z.infer<typeof participantMessagingSchema>;
export type EventSettings = z.infer<typeof eventSettingsSchema>;
export type EventMarketing = z.infer<typeof eventMarketingSchema>;
export type TaskConfig = z.infer<typeof taskConfigSchema>;
export type FacebookCommentTaskConfig = z.infer<
  typeof facebookCommentTaskConfigSchema
>;
export type InstagramCommentTaskConfig = z.infer<
  typeof instagramCommentTaskConfigSchema
>;
export type FormQuestionType = z.infer<typeof formQuestionTypeSchema>;
export type FormQuestionFieldKey = z.infer<typeof formQuestionFieldKeySchema>;
export type FormQuestionShowWhen = z.infer<typeof formQuestionShowWhenSchema>;
export type FormQuestionGroup = z.infer<typeof formQuestionGroupSchema>;
export type FormQuestion = z.infer<typeof formQuestionSchema>;
export type TaskLike = z.infer<typeof taskSchema>;
export type TaskAttemptLike = z.infer<typeof taskAttemptSchema>;
export type ExperienceResponse = z.infer<typeof experienceResponseSchema>;
export type ParticipantLoginLinkRequestResponse = z.infer<
  typeof participantLoginLinkRequestResponseSchema
>;
export type ParticipantLoginLinkConsumeResponse = z.infer<
  typeof participantLoginLinkConsumeResponseSchema
>;
export type QrScanBody = z.infer<typeof qrScanBodySchema>;
export type QrScanResult = z.infer<typeof qrScanResultSchema>;
export type StaffSessionLookupResponse = z.infer<
  typeof staffSessionLookupResponseSchema
>;
export type AdminEventSummary = z.infer<typeof adminEventSummarySchema>;
export type AdminEventDetail = z.infer<typeof adminEventDetailSchema>;
export type AdminTask = z.infer<typeof adminTaskSchema>;
export type AdminFacebookConnection = z.infer<
  typeof adminFacebookConnectionSchema
>;
export type AdminFacebookPostOptionsResponse = z.infer<
  typeof adminFacebookPostOptionsResponseSchema
>;
export type AdminFacebookCommentDebugResponse = z.infer<
  typeof adminFacebookCommentDebugResponseSchema
>;
export type AdminInstagramMediaOptionsResponse = z.infer<
  typeof adminInstagramMediaOptionsResponseSchema
>;
export type AdminInstagramCommentDebugResponse = z.infer<
  typeof adminInstagramCommentDebugResponseSchema
>;
export type AdminParticipant = z.infer<typeof adminParticipantSchema>;
export type AdminLead = z.infer<typeof adminLeadSchema>;
export type AdminRewardsReport = z.infer<typeof adminRewardsReportSchema>;
export type AdminQrCode = z.infer<typeof adminQrCodeSchema>;
