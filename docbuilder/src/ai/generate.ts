// AI drafting and revising of workflows.
//
// Claude answers in a fixed JSON shape (structured outputs), and the result
// goes through the same normalize + validate step as any hand-built workflow.
// If validation finds errors, they are sent back once for Claude to fix.
//
// In this standalone prototype the browser calls the API directly with a key
// the user pastes in. Inside the case management app this call belongs on the
// server, with the key kept there; `requestWorkflow` is the only function that
// would move.

import Anthropic from "@anthropic-ai/sdk";
import { loadDocx } from "../engine/docx.ts";
import { FUNCTION_DOCS } from "../engine/expr.ts";
import { normalizeWorkflow, validateWorkflow, QUESTION_TYPES, type Issue } from "../engine/validate.ts";
import type { Workflow } from "../engine/types.ts";

const MODEL = "claude-opus-5-5";

const str = { type: "string" };
const bool = { type: "boolean" };
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/** Structured-output schema. Optional text fields use "" for "none". */
export const WORKFLOW_SCHEMA = {
  ...obj({
    summary: str,
    workflow: { $ref: "#/$defs/workflow" },
  }),
  $defs: {
    option: obj({ value: str, label: str }),
    field: obj({
      id: str,
      label: str,
      type: { type: "string", enum: QUESTION_TYPES.filter((t) => t !== "list") },
      options: { type: "array", items: { $ref: "#/$defs/option" } },
      required: bool,
    }),
    question: obj({
      id: str,
      label: str,
      type: { type: "string", enum: QUESTION_TYPES },
      help: str,
      required: bool,
      options: { type: "array", items: { $ref: "#/$defs/option" } },
      showIf: str,
      prefill: str,
      fields: { type: "array", items: { $ref: "#/$defs/field" } },
    }),
    page: obj({ id: str, title: str, showIf: str, questions: { type: "array", items: { $ref: "#/$defs/question" } } }),
    computed: obj({ id: str, label: str, expr: str }),
    document: obj({ id: str, name: str, showIf: str, body: str }),
    workflow: obj({
      id: str,
      name: str,
      description: str,
      pages: { type: "array", items: { $ref: "#/$defs/page" } },
      computed: { type: "array", items: { $ref: "#/$defs/computed" } },
      documents: { type: "array", items: { $ref: "#/$defs/document" } },
    }),
  },
};

export function systemPrompt(caseFields: string[]): string {
  const functions = Object.values(FUNCTION_DOCS).map((d) => `- ${d}`).join("\n");
  const fields = caseFields.length ? caseFields.map((f) => `- case.${f}`).join("\n") : "(none provided)";
  return `You design document-automation workflows for a law firm's case management app. A workflow is an interview (pages of questions with show-if rules) plus document templates that are filled in from the answers. Lawyers will review and edit what you produce in a visual builder, so keep it clear and conventional.

# Workflow structure
- pages: each has an id, a title, an optional showIf, and questions.
- questions: id is the variable name (snake_case, unique across the workflow). Types: ${QUESTION_TYPES.join(", ")}.
  - choice / multichoice need options (value is a snake_case code, label is what the user sees). multichoice answers are lists.
  - yesno answers are true/false. currency and number answers are numbers. date answers are "YYYY-MM-DD".
  - list asks for repeating items (children, assets, parties); its fields are asked for each item. Fields cannot be lists.
  - required: true for answers the documents can't do without.
  - showIf: an expression; the question is asked only when it is true. Hidden questions read as null.
  - prefill: an expression that reads only the case record (case.*) to supply a starting answer. Use it whenever the case already knows the answer.
  - help: short guidance under the question, or "".
- computed: named values derived from answers with an expression (e.g. totals, a display name). They can be used anywhere a question can.
- documents: name, optional showIf (generate the document only when true), and body (the template).
- Use "" for any optional text you are not using.

# Expression language (showIf, prefill, computed, and inside templates)
- Names: question ids, computed ids, and case.* fields. Use dots for fields: case.client.name, children.name (on a list, gives that field from every item).
- Literals: "text", 12.5, true, false, null, ["a", "b"].
- Operators: and, or, not, ==, !=, <, <=, >, >=, + - * /, x in ["a","b"], list contains value, text contains "word".
- Unanswered values are null: comparisons with null are false, math with null is null.
- Functions (no others exist):
${functions}

# Case record fields available for prefill and templates
${fields}

# Template syntax (document body)
- {{ expression }} inserts a value, e.g. {{ client_name }}, {{ money(fee) }}, {{ date_long(start_date) }}.
- {% if expr %} ... {% elif expr %} ... {% else %} ... {% endif %}
- {% for item in list_question %} ... {{ item.field }} ... {% endfor %}, with loop.index, loop.first, loop.last, loop.count.
- Put block tags on their own line when they wrap whole lines; a line with only a tag is removed from the output.
- Formatting: # / ## / ### headings, blank line between paragraphs, "- " bullets, "1. " numbered items, **bold**, *italic*, "-> text <-" for a centered line, ---pagebreak--- for a new page.

# Guidelines
- Ask each fact once; don't ask what the case record already holds unless it may need correcting (then prefill it).
- Use showIf so users only see questions that apply. A rule may only read questions asked before it.
- Every question should be used in a rule, a computed value, or a document.
- Write documents in plain, professional legal English. Use bracketed placeholders only where no question fits.
- When revising an existing workflow, keep the ids and content the user didn't ask to change.
- A document whose body starts with "${WORD_MARKER}" is an uploaded Word file that you can't edit. Return it with the same id and the body exactly as given. Its text shows the tags it uses: make sure every variable they read exists as a question or computed value with exactly that name.
- summary: two or three sentences on what you built or changed and any assumptions the lawyer should check.`;
}

export interface GenerateResult {
  workflow: Workflow;
  summary: string;
  issues: Issue[];
}

export async function generateWorkflow(opts: {
  apiKey: string;
  request: string;
  current?: Workflow;
  caseFields: string[];
  onStatus?: (status: string) => void;
}): Promise<GenerateResult> {
  const client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true });
  const system = systemPrompt(opts.caseFields);
  const first = opts.current
    ? `Here is the current workflow:\n\n${JSON.stringify(forAi(opts.current))}\n\nRevise it as follows:\n${opts.request}`
    : `Build a new workflow:\n${opts.request}`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: first }];

  opts.onStatus?.("Drafting…");
  let response = await requestWorkflow(client, system, messages);
  let result = readResult(response, opts.caseFields, opts.current);

  const errors = result.issues.filter((i) => i.level === "error");
  if (errors.length) {
    opts.onStatus?.(`Fixing ${errors.length} problem${errors.length === 1 ? "" : "s"}…`);
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: `The workflow has these errors. Return the full corrected workflow.\n${errors.map((e) => `- ${e.where}: ${e.message}`).join("\n")}`,
    });
    response = await requestWorkflow(client, system, messages);
    result = readResult(response, opts.caseFields, opts.current);
  }
  return result;
}

async function requestWorkflow(client: Anthropic, system: string, messages: Anthropic.Beta.BetaMessageParam[]): Promise<Anthropic.Beta.BetaMessage> {
  return client.beta.messages
    .stream({
      model: MODEL,
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema", schema: WORKFLOW_SCHEMA } },
      system,
      messages,
    })
    .finalMessage();
}

const WORD_MARKER = "[Word template";

/** The workflow as Claude sees it: Word files become their text and tags instead of file data. */
export function forAi(wf: Workflow): Workflow {
  return {
    ...wf,
    documents: wf.documents.map(({ docx, ...doc }) => {
      if (!docx) return doc;
      let text: string;
      try {
        text = loadDocx(docx.data).text;
      } catch (e) {
        text = `(The file can't be read: ${(e as Error).message})`;
      }
      return { ...doc, body: `${WORD_MARKER} "${docx.fileName}". Read-only.]\n${text}` };
    }),
  };
}

function readResult(response: Anthropic.Beta.BetaMessage, caseFields: string[], current?: Workflow): GenerateResult {
  if (response.stop_reason === "refusal") throw new Error("Claude declined this request. Try rewording it.");
  if (response.stop_reason === "max_tokens") throw new Error("The workflow was too long to finish. Try asking for a smaller piece at a time.");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let raw: { summary?: unknown; workflow?: unknown };
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Claude's reply wasn't valid JSON. Please try again.");
  }
  const workflow = normalizeWorkflow(raw.workflow);
  // Put uploaded Word files back on the documents Claude kept.
  for (const doc of workflow.documents) {
    const original = current?.documents.find((d) => d.id === doc.id && d.docx);
    if (original) Object.assign(doc, { body: original.body, docx: original.docx });
  }
  return { workflow, summary: typeof raw.summary === "string" ? raw.summary : "", issues: validateWorkflow(workflow, { caseFields }) };
}

/** A message for the person using the builder. */
export function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "The API key was rejected. Check it and try again.";
  if (e instanceof Anthropic.PermissionDeniedError) return "This API key doesn't have access to the model.";
  if (e instanceof Anthropic.RateLimitError) return "Rate limited by the API. Wait a moment and try again.";
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach the API. Check your connection.";
  if (e instanceof Anthropic.APIError) return `The API returned an error (${e.status}): ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
