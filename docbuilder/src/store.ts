// Browser persistence for the standalone prototype. In the case management
// app, workflows and answers would live in its database instead (answers per
// case, workflows per firm).

import { normalizeWorkflow } from "./engine/validate.ts";
import type { Answers, Value, Workflow } from "./engine/types.ts";
import { ENGAGEMENT_LETTER, SAMPLE_CASE } from "./data/samples.ts";

const KEY = "docbuilder.v1";

export interface Saved {
  workflows: Workflow[];
  currentId: string;
  answers: Record<string, Answers>;
  caseData: Value;
}

function fresh(): Saved {
  return { workflows: [structuredClone(ENGAGEMENT_LETTER)], currentId: ENGAGEMENT_LETTER.id, answers: {}, caseData: structuredClone(SAMPLE_CASE) };
}

export function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const data = JSON.parse(raw) as Partial<Saved>;
    const workflows = Array.isArray(data.workflows) ? data.workflows.map(normalizeWorkflow) : [];
    if (workflows.length === 0) return fresh();
    return {
      workflows,
      currentId: workflows.some((w) => w.id === data.currentId) ? data.currentId! : workflows[0].id,
      answers: data.answers && typeof data.answers === "object" ? data.answers : {},
      caseData: data.caseData ?? structuredClone(SAMPLE_CASE),
    };
  } catch {
    return fresh();
  }
}

/** False when the browser refused (storage full or blocked); the app keeps working in memory. */
export function save(data: Saved): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function resetAll(): Saved {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // See save().
  }
  return fresh();
}
