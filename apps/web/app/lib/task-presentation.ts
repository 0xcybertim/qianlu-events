import type {
  FormQuestion,
  FormQuestionGroup,
  TaskConfig,
  TaskLike,
  TaskType,
} from "@qianlu-events/schemas";

type TaskActionLink = {
  href: string;
  label: string;
  tone: "primary" | "secondary";
};

function getTaskConfig(task: TaskLike): TaskConfig | null {
  return task.configJson ?? null;
}

function getDefaultTaskFormQuestions(taskType: TaskType): FormQuestion[] {
  switch (taskType) {
    case "LEAD_FORM":
      return [
        {
          id: "name",
          label: "Name",
          type: "TEXT",
          required: true,
          fieldKey: "NAME",
        },
        {
          id: "email",
          label: "Email",
          type: "EMAIL",
          required: true,
          fieldKey: "EMAIL",
        },
        {
          id: "opt-in",
          label: "Keep me informed about future events and offers.",
          type: "BOOLEAN",
          fieldKey: "OPT_IN",
        },
      ];
    case "QUIZ":
      return [
        { id: "question-1", label: "Question 1", type: "TEXT", required: true },
        { id: "question-2", label: "Question 2", type: "TEXT", required: true },
        { id: "question-3", label: "Question 3", type: "TEXT", required: true },
      ];
    case "NEWSLETTER_OPT_IN":
      return [
        {
          id: "opt-in",
          label: "I want to receive campaign and event updates.",
          type: "BOOLEAN",
          required: true,
          fieldKey: "OPT_IN",
        },
      ];
    case "WHATSAPP_OPT_IN":
      return [
        {
          id: "phone",
          label: "Phone number",
          type: "PHONE",
          required: true,
          fieldKey: "PHONE",
        },
      ];
    default:
      return [];
  }
}

export function getTaskFormQuestions(task: TaskLike): FormQuestion[] {
  const configuredQuestions = getTaskConfig(task)?.formQuestions;

  if (configuredQuestions && configuredQuestions.length > 0) {
    return configuredQuestions;
  }

  return getDefaultTaskFormQuestions(task.type);
}

export function getTaskFormGroups(task: TaskLike): FormQuestionGroup[] {
  return getTaskConfig(task)?.formGroups ?? [];
}

export function getTaskFormGroupIntroLabel(task: TaskLike) {
  return (
    getTaskConfig(task)?.formGroupIntroLabel ??
    "Could this be interesting for you?"
  );
}

export function getTaskCategoryLabel(task: TaskLike) {
  switch (task.type) {
    case "SOCIAL_FOLLOW":
      return `${task.platform.toLowerCase()} follow`;
    case "SOCIAL_LIKE":
      return `${task.platform.toLowerCase()} like`;
    case "SOCIAL_SHARE":
      return `${task.platform.toLowerCase()} share`;
    case "SOCIAL_COMMENT":
      return `${task.platform.toLowerCase()} comment`;
    case "SOCIAL_COMMENT_SELF_CLAIM":
      return `${task.platform.toLowerCase()} natural comment`;
    case "LEAD_FORM":
      return "lead capture";
    case "QUIZ":
      return "brand quiz";
    case "NEWSLETTER_OPT_IN":
      return "newsletter opt-in";
    case "WHATSAPP_OPT_IN":
      return "WhatsApp opt-in";
    case "REFERRAL":
      return "booth referral";
    case "PHOTO_PROOF":
      return "photo proof";
    case "STAMP_SCAN":
      return "stamp scan";
    default:
      return "event activity";
  }
}

export function getTaskInstructions(task: TaskLike) {
  switch (task.type) {
    case "SOCIAL_FOLLOW":
      return task.requiresVerification
        ? [
            `Open ${task.platform.toLowerCase()} and follow the brand account.`,
            "Return to this page and confirm the action.",
            "Show the follow state to staff if verification is required.",
          ]
        : [
            `Open ${task.platform.toLowerCase()} and follow the brand account.`,
            "Return to this page and confirm the action.",
            "Your points update as soon as you claim the follow here.",
          ];
    case "LEAD_FORM":
      return [
        "Fill in the configured form questions carefully.",
        "Submit the form to attach your answers to this session.",
        "Staff can use the summary screen to confirm your progress.",
      ];
    case "SOCIAL_COMMENT":
      return [
        `Open the ${task.platform.toLowerCase()} post in the app.`,
        "Paste the exact comment text shown below.",
        "Tap the confirmation button here so the activity can wait for automatic verification.",
      ];
    case "SOCIAL_COMMENT_SELF_CLAIM":
      return [
        `Open the ${task.platform.toLowerCase()} post.`,
        "Leave a real comment that fits the post prompt.",
        "Return here and confirm that you commented.",
      ];
    case "QUIZ":
      return [
        "Answer the configured quiz questions.",
        "Submit the quiz once you are done.",
        "Your points update immediately after submission.",
      ];
    case "WHATSAPP_OPT_IN":
      return [
        "Join the WhatsApp updates flow for this event.",
        "Submit the configured form answers so the opt-in can be linked to your session.",
        "Staff may still ask to confirm the join state on your phone.",
      ];
    case "NEWSLETTER_OPT_IN":
      return [
        "Answer the configured follow-up question.",
        "Submit the opt-in to save it against your session.",
        "This activity can be used for future campaign follow-up.",
      ];
    case "REFERRAL":
      return [
        "Bring a friend to the booth or complete the referral action.",
        "Mark the activity as ready for staff review.",
        "Staff will confirm the referral before it counts.",
      ];
    case "PHOTO_PROOF":
      return [
        "Take the requested event photo.",
        "Return here and mark the activity ready for review.",
        "Show the photo to staff on your phone.",
      ];
    case "STAMP_SCAN":
      return [
        "Find this stamp point at the event.",
        "Scan the QR code shown there.",
        "Your stamp is counted automatically after a valid scan.",
      ];
    default:
      return [
        "Complete the action in the relevant app or at the booth.",
        "Return here and submit your claim.",
        "Show proof to staff if the activity requires verification.",
      ];
  }
}

function getDefaultPrimaryLinkLabel(task: TaskLike) {
  switch (task.type) {
    case "SOCIAL_FOLLOW":
      return `Open ${formatPlatformLabel(task.platform)} profile`;
    case "SOCIAL_LIKE":
      return `Open ${task.platform.toLowerCase()} post`;
    case "SOCIAL_SHARE":
      return `Open ${task.platform.toLowerCase()} share flow`;
    case "SOCIAL_COMMENT":
    case "SOCIAL_COMMENT_SELF_CLAIM":
      return `Open ${task.platform.toLowerCase()} post`;
    case "WHATSAPP_OPT_IN":
      return "Open WhatsApp";
    default:
      return "Open activity";
  }
}

function formatPlatformLabel(platform: string) {
  return platform
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getDefaultSecondaryLinkLabel(task: TaskLike) {
  switch (task.type) {
    case "SOCIAL_FOLLOW":
    case "SOCIAL_LIKE":
    case "SOCIAL_SHARE":
    case "SOCIAL_COMMENT":
    case "SOCIAL_COMMENT_SELF_CLAIM":
      return "Open proof link";
    default:
      return "Open supporting link";
  }
}

export function getTaskActionLinks(task: TaskLike): TaskActionLink[] {
  const config = getTaskConfig(task);
  const links: TaskActionLink[] = [];

  if (config?.primaryUrl) {
    links.push({
      href: config.primaryUrl,
      label: config.primaryLabel ?? getDefaultPrimaryLinkLabel(task),
      tone: "primary",
    });
  }

  if (config?.secondaryUrl) {
    links.push({
      href: config.secondaryUrl,
      label: config.secondaryLabel ?? getDefaultSecondaryLinkLabel(task),
      tone: "secondary",
    });
  }

  return links;
}

export function getTaskProofHint(task: TaskLike) {
  return getTaskConfig(task)?.proofHint ?? null;
}

export function getTaskPrimaryActionLabel(task: TaskLike) {
  switch (task.type) {
    case "SOCIAL_FOLLOW":
      return `I've followed on ${task.platform.toLowerCase()}`;
    case "SOCIAL_COMMENT":
      return "I've commented";
    case "SOCIAL_COMMENT_SELF_CLAIM":
      return "I've commented";
    case "REFERRAL":
      return "Referral completed";
    case "PHOTO_PROOF":
      return "Photo ready";
    case "STAMP_SCAN":
      return "Scan QR code";
    default:
      return "Mark as completed";
  }
}

export function getTaskSecondaryActionLabel(task: TaskLike) {
  switch (task.type) {
    case "SOCIAL_FOLLOW":
      return "Needs staff check";
    case "SOCIAL_COMMENT":
      return "Waiting for auto-check";
    case "SOCIAL_COMMENT_SELF_CLAIM":
      return "Needs review";
    case "REFERRAL":
      return "Refer to staff";
    case "PHOTO_PROOF":
      return "Show to staff";
    case "STAMP_SCAN":
      return "Ask staff for help";
    default:
      return "Needs staff check";
  }
}
