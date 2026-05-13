/**
 * Client action registry.
 *
 * Each entry defines a walkthrough or review surface the client sees
 * on /actions/<slug>. The registry is the single source of truth for:
 *
 *   - What the action card title and description say
 *   - The boundary framing ("we can't sign in as you, here's why")
 *   - The step list for guided walkthroughs (bing_for_business, etc.)
 *   - How progress is derived (some actions are step-driven, FAQ
 *     review is item-driven from client_faqs status counts)
 *
 * Walkthroughs use templated field references like {business_name}
 * and {business_address} that get resolved at render time against
 * the client's injection_configs. If a field is missing, the renderer
 * shows an inline data-capture input instead.
 */

export type ActionType =
  | "faq_review"
  | "bing_for_business"
  | "apple_business_connect"
  | "nap_audit"
  | "faq_marker_install";

export type ProgressShape = "step_driven" | "item_driven";

export interface ActionStep {
  id: string;
  title: string;
  goal_line?: string;             // short context line above the bullets
  actions: string[];              // numbered bullet text (verbs first)
  external_url?: string;          // primary URL for this step
  external_url_label?: string;    // what the link button reads
  copy_fields?: Array<{
    label: string;
    value_ref: string;            // e.g. "business_name" -> injection_configs.business_name
    helper?: string;
  }>;
  copy_blob?: {
    label: string;
    value_ref: string;            // can also reference a generated field
    helper?: string;
  };
  optional?: boolean;             // step can be skipped without blocking completion
  closing_note?: string;          // prose after the action bullets
}

export interface ActionDefinition {
  type: ActionType;
  title: string;
  one_liner: string;              // single line shown on the card
  boundary_framing: string;       // the "we can't X. Here's the work we did." copy
  why_this_matters: string;       // 2-3 sentences of context for the client
  time_estimate_minutes: number;
  progress_shape: ProgressShape;
  steps: ActionStep[];            // empty for item_driven actions
  prerequisites?: string[];       // list of injection_configs fields required to start
}

// ---------------------------------------------------------------------------
// Action: Bing for Business setup
// ---------------------------------------------------------------------------

const BING_FOR_BUSINESS: ActionDefinition = {
  type: "bing_for_business",
  title: "Claim your Bing for Business profile",
  one_liner: "Bing is what ChatGPT and Microsoft Copilot search under the hood.",
  boundary_framing:
    "We can't sign in as you. Microsoft requires the business owner. Everything else is ready. Your business info, description, and category are pre-filled below. Each field has a Copy button.",
  why_this_matters:
    "ChatGPT routes most grounded queries through Bing's index. Without a claimed Bing for Business profile, Bing's local pack returns unverified info or skips your business entirely, and ChatGPT often skips you too. Setup is free, takes about 20 minutes, and meaningfully lifts Microsoft Copilot + Bing-routed ChatGPT citations within 14 days of verification.",
  time_estimate_minutes: 20,
  progress_shape: "step_driven",
  prerequisites: ["business_name", "business_url"],
  steps: [
    {
      id: "open_bing_places",
      title: "Open Bing Places for Business",
      goal_line: "Sign in to Microsoft's business profile dashboard.",
      external_url: "https://www.bingplaces.com",
      external_url_label: "bingplaces.com",
      actions: [
        "Click to open Bing Places in a new tab",
        "Sign in with a Microsoft account tied to your business",
        "If you don't have one, create a Microsoft account using your business domain email",
      ],
    },
    {
      id: "add_new_business",
      title: "Start a new business listing",
      goal_line: "Tell Bing you want to add your business.",
      actions: [
        "Click the green Add a new business button at the top right",
        "If Bing prompts you to import from Google Business Profile, choose that option to pre-fill many fields",
        "Otherwise select Manually add my business",
      ],
    },
    {
      id: "basic_info",
      title: "Fill in the business basics",
      goal_line: "Copy each value below into the matching field on Bing's form.",
      actions: [
        "In Bing Places, click Basic info in the left sidebar",
        "Copy each value below into the matching field",
        "Click Save when all fields are filled",
      ],
      copy_fields: [
        { label: "Business name", value_ref: "business_name" },
        { label: "Address line 1", value_ref: "business_address_street" },
        { label: "City", value_ref: "business_address_city" },
        { label: "State", value_ref: "business_address_state" },
        { label: "ZIP", value_ref: "business_address_zip" },
        { label: "Phone", value_ref: "business_phone" },
        { label: "Website", value_ref: "business_url" },
      ],
    },
    {
      id: "description_and_category",
      title: "Paste your description and pick a category",
      goal_line: "Bing asks for a business description and a primary category.",
      actions: [
        "Copy the description below into the Description field",
        "Pick the primary category that best matches your business from Bing's dropdown",
        "Add up to 3 secondary categories if Bing offers them",
      ],
      copy_blob: {
        label: "Business description (matches your AI-facing schema)",
        value_ref: "business_description",
        helper: "Bing rewards descriptions of 200 to 400 characters. Edit before pasting if you want to adjust.",
      },
    },
    {
      id: "photos",
      title: "Upload photos (optional)",
      goal_line: "Bing requires at least 3 photos to display the profile fully. You can skip this step now and add them later.",
      actions: [
        "Have 3 to 5 photos ready on your computer or phone",
        "Click Upload Photos in Bing Places",
        "Select your photos and upload",
      ],
      optional: true,
      closing_note:
        "Recommended photos: exterior with signage (the marquee or storefront), wide interior shot, a recent event in progress, and 1 to 2 detail shots. Avoid stock photos. Minimum resolution 1080 by 1080.",
    },
    {
      id: "submit_and_verify",
      title: "Submit and wait for the verification postcard",
      goal_line: "Bing mails a postcard to your business address with a verification code.",
      actions: [
        "Click Submit in Bing Places",
        "Confirm your mailing address on the verification screen",
        "Wait 5 to 10 business days for the postcard to arrive",
        "When it arrives, log back into Bing Places and enter the verification code",
      ],
      closing_note:
        "Once you submit, we'll mark this action as Submitted and check back with you in 7 days to see if the postcard arrived. The profile goes live the moment you enter the verification code.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Action: FAQ review (item-driven, no walkthrough steps)
// ---------------------------------------------------------------------------

const FAQ_REVIEW: ActionDefinition = {
  type: "faq_review",
  title: "Review your AI-facing FAQ schema",
  one_liner: "FAQs we propose to put on your domain, sourced from your AI citation data.",
  boundary_framing:
    "We can't decide your brand voice. Review each FAQ below: approve it, edit the wording to match how you'd say it, or reject anything off-brand. Approved FAQs deploy automatically to your domain.",
  why_this_matters:
    "We track which questions AI engines answer in your category and which they answer without naming you. For each gap, we generate a FAQ proposal in your voice that closes the gap. The proposals below each include a 'why this is here' line explaining the citation data behind it.",
  time_estimate_minutes: 5,
  progress_shape: "item_driven",
  prerequisites: ["business_description"],
  steps: [],
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const ACTION_REGISTRY: Record<ActionType, ActionDefinition> = {
  faq_review: FAQ_REVIEW,
  bing_for_business: BING_FOR_BUSINESS,
  // Apple Business Connect, NAP audit, FAQ marker install land in v2.
  apple_business_connect: BING_FOR_BUSINESS, // placeholder; v1 only ships the two above
  nap_audit: BING_FOR_BUSINESS,               // placeholder
  faq_marker_install: BING_FOR_BUSINESS,      // placeholder
};

export const V1_ACTIVE_ACTIONS: ActionType[] = ["faq_review", "bing_for_business"];
