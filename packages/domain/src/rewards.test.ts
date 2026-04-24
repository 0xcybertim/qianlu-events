import assert from "node:assert/strict";
import test from "node:test";

import { calculateRewardSnapshot } from "./rewards.js";

test("configured instant reward waits until every linked task is done", () => {
  const snapshot = calculateRewardSnapshot({
    tasks: [
      {
        id: "task-form",
        platform: "EMAIL",
        points: 1,
        requiresVerification: false,
        title: "Complete the form",
        type: "LEAD_FORM",
        verificationType: "NONE",
      },
      {
        id: "task-photo",
        platform: "IN_PERSON",
        points: 1,
        requiresVerification: true,
        title: "Show product photo",
        type: "PHOTO_PROOF",
        verificationType: "VISUAL_STAFF_CHECK",
      },
    ],
    attempts: [
      {
        status: "COMPLETED_BY_USER",
        taskId: "task-form",
      },
    ],
    instantRewards: [
      {
        key: "darts",
        label: "Darts throw",
        taskIds: ["task-form", "task-photo"],
        taskMatchMode: "ANY",
      },
    ],
    rewardTiers: [],
    rewardTypes: ["INSTANT_REWARD"],
  });

  assert.equal(snapshot.instantRewardEligible, false);
  assert.deepEqual(snapshot.instantRewards, [
    {
      eligible: false,
      label: "Darts throw",
      rewardKey: "darts",
      taskIds: ["task-form", "task-photo"],
      taskMatchMode: "ALL",
      verified: false,
    },
  ]);
});

test("configured ALL instant reward waits until every linked task is verified", () => {
  const pendingSnapshot = calculateRewardSnapshot({
    tasks: [
      {
        id: "task-form",
        platform: "EMAIL",
        points: 1,
        requiresVerification: false,
        title: "Complete the form",
        type: "LEAD_FORM",
        verificationType: "NONE",
      },
      {
        id: "task-photo",
        platform: "IN_PERSON",
        points: 1,
        requiresVerification: true,
        title: "Show product photo",
        type: "PHOTO_PROOF",
        verificationType: "VISUAL_STAFF_CHECK",
      },
    ],
    attempts: [
      {
        status: "COMPLETED_BY_USER",
        taskId: "task-form",
      },
      {
        status: "PENDING_STAFF_CHECK",
        taskId: "task-photo",
      },
    ],
    instantRewards: [
      {
        description: "Both steps are required.",
        key: "scratch-card",
        label: "Scratch card",
        taskIds: ["task-form", "task-photo"],
        taskMatchMode: "ALL",
      },
    ],
    rewardTiers: [],
    rewardTypes: ["INSTANT_REWARD"],
  });

  assert.equal(pendingSnapshot.instantRewardEligible, false);
  assert.deepEqual(pendingSnapshot.instantRewards, [
    {
      description: "Both steps are required.",
      eligible: true,
      label: "Scratch card",
      rewardKey: "scratch-card",
      taskIds: ["task-form", "task-photo"],
      taskMatchMode: "ALL",
      verified: false,
    },
  ]);
});

test("optimistic tasks count previously claimed attempts as verified", () => {
  const snapshot = calculateRewardSnapshot({
    tasks: [
      {
        id: "task-form",
        platform: "EMAIL",
        points: 1,
        requiresVerification: false,
        title: "Complete the form",
        type: "LEAD_FORM",
        verificationType: "NONE",
      },
    ],
    attempts: [
      {
        status: "PENDING_STAFF_CHECK",
        taskId: "task-form",
      },
    ],
    instantRewards: [
      {
        key: "darts",
        label: "Darts throw",
        taskIds: ["task-form"],
        taskMatchMode: "ANY",
      },
    ],
    rewardTiers: [
      {
        key: "starter",
        label: "Starter",
        threshold: 1,
      },
    ],
    rewardTypes: ["INSTANT_REWARD", "TIERED_REWARD", "DAILY_PRIZE_DRAW"],
  });

  assert.equal(snapshot.verifiedPoints, 1);
  assert.equal(snapshot.dailyDrawEligible, true);
  assert.equal(snapshot.highestVerifiedTier?.key, "starter");
  assert.deepEqual(snapshot.instantRewards, [
    {
      eligible: true,
      label: "Darts throw",
      rewardKey: "darts",
      taskIds: ["task-form"],
      taskMatchMode: "ALL",
      verified: true,
    },
  ]);
});

test("daily draw uses claimed points for raffle eligibility", () => {
  const snapshot = calculateRewardSnapshot({
    tasks: [
      {
        id: "task-photo",
        platform: "IN_PERSON",
        points: 5,
        requiresVerification: true,
        title: "Show product photo",
        type: "PHOTO_PROOF",
        verificationType: "VISUAL_STAFF_CHECK",
      },
    ],
    attempts: [
      {
        status: "PENDING_STAFF_CHECK",
        taskId: "task-photo",
      },
    ],
    instantRewards: [],
    rewardTiers: [],
    rewardTypes: ["DAILY_PRIZE_DRAW"],
  });

  assert.equal(snapshot.claimedPoints, 5);
  assert.equal(snapshot.verifiedPoints, 0);
  assert.equal(snapshot.dailyDrawEligible, true);
});
