import type { Value, Workflow } from "../engine/types.ts";

/**
 * Stand-in for a case record from the case management app. Questions pre-fill
 * from it with expressions like `case.client.name`.
 */
export const SAMPLE_CASE: Value = {
  number: "2026-CV-0142",
  matter_name: "Smith v. Acme Corp",
  practice_area: "Litigation",
  responsible_attorney: "Jordan Lee",
  firm_name: "Lee & Associates, PLLC",
  opposing_party: "Acme Corp",
  client: {
    name: "Pat Smith",
    type: "individual",
    email: "pat.smith@example.com",
    address: "12 Elm Street, Springfield",
  },
};

/** Every path in the sample case record, for validation and the AI prompt. */
export function casePaths(record: Value, prefix = ""): string[] {
  if (record === null || typeof record !== "object" || Array.isArray(record)) return prefix ? [prefix] : [];
  return Object.entries(record).flatMap(([k, v]) => casePaths(v, prefix ? `${prefix}.${k}` : k));
}

export const ENGAGEMENT_LETTER: Workflow = {
  id: "engagement_letter",
  name: "Engagement Letter",
  description: "Engagement letter with fee terms, plus a conflict waiver when a related party isn't cleared.",
  pages: [
    {
      id: "client",
      title: "Client",
      questions: [
        {
          id: "client_type",
          label: "Who is the client?",
          type: "choice",
          required: true,
          prefill: "case.client.type",
          options: [
            { value: "individual", label: "An individual" },
            { value: "business", label: "A business" },
          ],
        },
        { id: "client_name", label: "Client's full name", type: "text", required: true, prefill: "case.client.name", showIf: 'client_type == "individual"' },
        { id: "entity_name", label: "Business's legal name", type: "text", required: true, showIf: 'client_type == "business"' },
        { id: "signer_name", label: "Who signs for the business?", type: "text", required: true, showIf: 'client_type == "business"' },
        { id: "signer_title", label: "Their title", type: "text", showIf: 'client_type == "business"' },
        { id: "client_address", label: "Mailing address", type: "textarea", prefill: "case.client.address" },
      ],
    },
    {
      id: "matter",
      title: "Matter",
      questions: [
        { id: "matter_description", label: "What is the firm being hired to do?", type: "textarea", required: true, prefill: '"Represent the client in " + case.matter_name' },
        { id: "opposing_party", label: "Opposing party", type: "text", prefill: "case.opposing_party" },
        { id: "start_date", label: "Engagement start date", type: "date", required: true },
      ],
    },
    {
      id: "fees",
      title: "Fees",
      questions: [
        {
          id: "fee_type",
          label: "How will the firm be paid?",
          type: "choice",
          required: true,
          options: [
            { value: "hourly", label: "Hourly" },
            { value: "flat", label: "Flat fee" },
            { value: "contingency", label: "Contingency" },
          ],
        },
        { id: "hourly_rate", label: "Hourly rate", type: "currency", required: true, showIf: 'fee_type == "hourly"' },
        { id: "estimated_hours", label: "Estimated hours (optional)", type: "number", showIf: 'fee_type == "hourly"' },
        { id: "flat_fee", label: "Flat fee amount", type: "currency", required: true, showIf: 'fee_type == "flat"' },
        { id: "contingency_pct", label: "Contingency percentage", type: "number", required: true, showIf: 'fee_type == "contingency"' },
        { id: "retainer_required", label: "Is a retainer required?", type: "yesno", showIf: 'fee_type != "contingency"' },
        { id: "retainer_amount", label: "Retainer amount", type: "currency", required: true, showIf: "retainer_required" },
      ],
    },
    {
      id: "related",
      title: "Related parties",
      questions: [
        { id: "has_related", label: "Are there related parties to run conflicts on?", type: "yesno" },
        {
          id: "related_parties",
          label: "Related parties",
          type: "list",
          showIf: "has_related",
          fields: [
            { id: "name", label: "Name", type: "text", required: true },
            {
              id: "relationship",
              label: "Relationship",
              type: "choice",
              options: [
                { value: "spouse", label: "Spouse" },
                { value: "partner", label: "Business partner" },
                { value: "other", label: "Other" },
              ],
            },
            { id: "cleared", label: "Conflict cleared?", type: "yesno" },
          ],
        },
      ],
    },
    {
      id: "waiver",
      title: "Conflict waiver",
      showIf: "needs_waiver",
      questions: [
        { id: "conflict_description", label: "Describe the potential conflict", type: "textarea", required: true },
        { id: "waiver_explained", label: "Has the conflict been explained to the client?", type: "yesno", required: true },
      ],
    },
  ],
  computed: [
    { id: "client_display", label: "Name used in documents", expr: 'if(client_type == "business", entity_name, client_name)' },
    { id: "estimated_fee", label: "Estimated hourly fee", expr: "hourly_rate * estimated_hours" },
    { id: "needs_waiver", label: "A related party isn't cleared", expr: "related_parties.cleared contains false" },
  ],
  documents: [
    {
      id: "letter",
      name: "Engagement Letter",
      body: `-> **{{ upper(case.firm_name) }}** <-

{{ date_long(start_date) }}

{{ client_display }}
{{ client_address }}

Re: {{ case.matter_name }} (Case No. {{ case.number }})

{% if client_type == "business" %}
Dear {{ signer_name }}:
{% else %}
Dear {{ client_name }}:
{% endif %}

Thank you for choosing {{ case.firm_name }}. This letter confirms the terms on which we will represent {{ client_display }}.

## Scope of engagement

{{ matter_description }}{% if opposing_party %}, adverse to {{ opposing_party }}{% endif %}.

## Fees

{% if fee_type == "hourly" %}
We will bill for our time at {{ money(hourly_rate) }} per hour.{% if estimated_fee %} Based on an estimate of {{ estimated_hours }} hours, we expect fees of about {{ money(estimated_fee) }}, though this is an estimate and not a cap.{% endif %}
{% elif fee_type == "flat" %}
We will charge a flat fee of {{ money(flat_fee) }} for the work described above.
{% elif fee_type == "contingency" %}
Our fee is {{ contingency_pct }}% ({{ number_words(contingency_pct) }} percent) of any amount recovered. If nothing is recovered, no fee is owed.
{% endif %}
{% if retainer_required %}

A retainer of {{ money(retainer_amount) }} is due before work begins and will be held in our trust account.
{% endif %}
{% if has_related and count(related_parties) > 0 %}

## Related parties

We have run conflict checks on the following related parties:

{% for p in related_parties %}
- {{ p.name }}{% if p.relationship %} ({{ p.relationship }}){% endif %}{% if p.cleared == false %}: **conflict waiver required**{% endif %}
{% endfor %}
{% endif %}

Please sign below to confirm these terms.

Sincerely,

{{ case.responsible_attorney }}
{{ case.firm_name }}

AGREED:

______________________________
{% if client_type == "business" %}
{{ entity_name }}, by {{ signer_name }}{% if signer_title %}, {{ signer_title }}{% endif %}
{% else %}
{{ client_name }}
{% endif %}`,
    },
    {
      id: "waiver",
      name: "Conflict Waiver",
      showIf: "needs_waiver",
      body: `# Waiver of Conflict of Interest

{{ client_display }} ("Client") has asked {{ case.firm_name }} to act in {{ case.matter_name }}.

The firm has identified the following potential conflict:

{{ conflict_description }}

The parties concerned are:

{% for p in related_parties %}
{% if p.cleared == false %}
- {{ p.name }}
{% endif %}
{% endfor %}

{% if waiver_explained %}
The firm has explained the conflict, its risks, and the alternatives to Client, and Client has had the opportunity to seek independent advice.
{% endif %}

Client consents to the representation despite this conflict.

______________________________
{{ client_display }}`,
    },
  ],
};
