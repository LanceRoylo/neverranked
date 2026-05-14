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

export type ProgressShape = "step_driven" | "item_driven" | "checklist_driven";

export interface ChecklistItem {
  id: string;                  // stable identifier; used as map key in metadata
  label: string;               // human-readable directory name
  url_template: string;        // URL with {business_name_url}, {city_url}, {phone_url} placeholders
  helper?: string;             // one-line why-this-matters
  category?: "directory" | "review" | "social" | "industry";
}

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
  steps: ActionStep[];            // empty for item_driven and checklist_driven actions
  checklist_items?: ChecklistItem[]; // populated for checklist_driven actions
  prerequisites?: string[];       // list of injection_configs fields required to start
}

// ---------------------------------------------------------------------------
// Action: Bing for Business setup
// ---------------------------------------------------------------------------

const BING_FOR_BUSINESS: ActionDefinition = {
  type: "bing_for_business",
  title: "Claim your Bing for Business profile",
  one_liner: "Get named in ChatGPT and Microsoft Copilot answers about businesses like yours.",
  boundary_framing:
    "We can't sign in as you. Microsoft requires the business owner. Everything else is ready. Your business info, description, and category are pre-filled below. Each field has a Copy button.",
  why_this_matters:
    "ChatGPT routes most grounded queries through Bing's index. Without a claimed Bing profile, Bing's local pack returns unverified info or skips your business entirely. ChatGPT skips you with it. Free, 20 minutes, measurable lift in citations within 14 days of verification.",
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
        { label: "Email", value_ref: "business_email" },
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
      title: "Submit and wait for verification + publish",
      goal_line: "Bing's process has two slow steps: a verification postcard, then a publish review.",
      actions: [
        "Click Submit in Bing Places",
        "Confirm your mailing address on the verification screen",
        "Wait 5 to 10 business days for the postcard to arrive",
        "When it arrives, log back into Bing Places and enter the verification code",
      ],
      closing_note:
        "Setting expectations honestly: even after you enter the verification code, Bing takes another 7 to 12 days to publish your listing. The pending publish state is normal. Total time from submit to live is roughly 3 weeks. We'll mark this action as Submitted now and check back with you when the publish window closes.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Action: Apple Business Connect setup
// ---------------------------------------------------------------------------

const APPLE_BUSINESS_CONNECT: ActionDefinition = {
  type: "apple_business_connect",
  title: "Claim your Apple Business Connect profile",
  one_liner: "Get named in Apple Intelligence, Siri, Spotlight, and Maps answers about your business.",
  boundary_framing:
    "We can't sign in as you. Apple requires the business owner's Apple ID. Everything else is ready below, with your business info pre-filled and every step explained.",
  why_this_matters:
    "Apple Business Connect is the source of truth Apple Intelligence, Siri, Spotlight, and Maps use to surface your business. Without a claimed profile, Apple devices either show stale info scraped from elsewhere or skip your business entirely. Free, 15 minutes, and Apple's index refreshes within 7 days of verification, faster than most other engines.",
  time_estimate_minutes: 15,
  progress_shape: "step_driven",
  prerequisites: ["business_name", "business_url"],
  steps: [
    {
      id: "open_apple_business_connect",
      title: "Open Apple Business Connect",
      goal_line: "Sign in with the Apple ID associated with your business.",
      external_url: "https://businessconnect.apple.com",
      external_url_label: "businessconnect.apple.com",
      actions: [
        "Click to open Apple Business Connect in a new tab",
        "Sign in with the Apple ID you want to use for your business profile",
        "If you don't have a dedicated business Apple ID, create one using your business domain email",
      ],
    },
    {
      id: "add_location",
      title: "Add your business location",
      goal_line: "Tell Apple where your business is so it can attach the profile to Maps.",
      actions: [
        "Click Add Location on the dashboard",
        "Search for your business by name and address",
        "If Apple shows an existing unclaimed listing for your business, choose Claim This Place",
        "Otherwise choose Create a New Place",
      ],
    },
    {
      id: "verify_ownership",
      title: "Verify business ownership",
      goal_line: "Apple needs to confirm you own this business before letting you edit the profile.",
      actions: [
        "Choose a verification method when prompted (typically phone call or document upload)",
        "Phone verification: Apple calls the business phone number and reads a 6-digit code",
        "Document verification: upload a recent utility bill, business license, or lease",
        "Complete the verification step and wait for confirmation (usually within 24 hours)",
      ],
      closing_note:
        "If you're verifying by phone, make sure someone can answer the business line during business hours on the day you submit. If you're verifying by document, scan or photograph it clearly with all four corners visible.",
    },
    {
      id: "fill_basics",
      title: "Fill in the business basics",
      goal_line: "Copy each value below into the matching field on Apple's form.",
      actions: [
        "Click Edit Profile on your verified location",
        "Copy each value below into the matching field",
        "Click Save once all fields are filled",
      ],
      copy_fields: [
        { label: "Business name", value_ref: "business_name" },
        { label: "Address line 1", value_ref: "business_address_street" },
        { label: "City", value_ref: "business_address_city" },
        { label: "State", value_ref: "business_address_state" },
        { label: "ZIP", value_ref: "business_address_zip" },
        { label: "Phone", value_ref: "business_phone" },
        { label: "Website", value_ref: "business_url" },
        { label: "Email", value_ref: "business_email" },
      ],
    },
    {
      id: "description_and_category",
      title: "Paste your description and pick a category",
      goal_line: "Apple uses these to match your business to relevant user queries.",
      actions: [
        "Copy the description below into the Description field",
        "Pick the primary category that best matches your business",
        "Add up to 5 secondary categories so Apple shows your business for more search intents",
      ],
      copy_blob: {
        label: "Business description",
        value_ref: "business_description",
        helper: "Apple supports up to 750 characters. Edit before pasting if you want to expand or adjust.",
      },
    },
    {
      id: "showcases_optional",
      title: "Add Showcases (optional)",
      goal_line: "Showcases are Apple's content cards that appear in Maps and Spotlight when users find your business. You can skip this step at first and add Showcases later.",
      actions: [
        "Click Showcases in the left navigation",
        "Add up to 3 cards with photos, headlines, and links to relevant pages on your website",
        "Recommended Showcases: a hero card with your most popular service, an Events card for upcoming events, an About card with your story",
      ],
      optional: true,
      closing_note:
        "Showcases significantly improve how your business surfaces in Maps and Spotlight, but they're not required for the profile to go live. Skip if you don't have content ready and come back after verification.",
    },
    {
      id: "submit_and_wait",
      title: "Submit for review",
      goal_line: "Apple reviews submitted profiles within a few business days.",
      actions: [
        "Click Submit for Review in Apple Business Connect",
        "Wait for Apple's email confirmation (usually 1 to 3 business days)",
        "Once confirmed, your profile is live across Apple Intelligence, Maps, Spotlight, and Siri",
      ],
      closing_note:
        "After submission we'll mark this action as Submitted and check back with you in 5 days to see if Apple confirmed your profile. The profile starts surfacing on Apple devices the moment Apple flips it live.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Action: FAQ marker install (single-step, copy-paste one line of HTML)
// ---------------------------------------------------------------------------

const FAQ_MARKER_INSTALL: ActionDefinition = {
  type: "faq_marker_install",
  title: "Show your FAQs to visitors and to non-JSON-LD crawlers",
  one_liner: "Add one line of HTML to a page on your site to render the FAQ schema as a visible Q&A section.",
  boundary_framing:
    "We can't edit your website's source code. You decide where the marker goes. Everything else is prepared below, including the exact line to paste and per-CMS guidance for the most common platforms.",
  why_this_matters:
    "Your FAQ schema today is invisible structured data that AI engines read but visitors and non-JavaScript crawlers cannot. Adding the marker div renders the same FAQ content as a visible accordion on the page you choose. Visitors see it. Crawlers that don't run JavaScript see it. AI engines see it twice (in JSON-LD and in semantic HTML with Schema.org microdata).",
  time_estimate_minutes: 5,
  progress_shape: "step_driven",
  prerequisites: [],
  steps: [
    {
      id: "pick_a_page",
      title: "Pick the page where the FAQ section should appear",
      goal_line: "Most clients put the FAQ accordion on their About page or a dedicated FAQ page.",
      actions: [
        "Choose a page on your site that's a natural home for an FAQ section",
        "Good options: About, FAQ, Help, Contact, Visit, Tickets",
        "Avoid: the homepage hero, checkout flows, or any page where the FAQ would interrupt a specific user task",
      ],
    },
    {
      id: "paste_marker",
      title: "Paste this one line of HTML into that page",
      goal_line: "The line is a marker. Our snippet detects it and renders the FAQ content into that spot when a visitor loads the page.",
      actions: [
        "Open the page editor for the page you picked",
        "Switch to HTML or Code view (most editors have this toggle)",
        "Paste the line below where you want the FAQ section to appear",
        "Save and publish",
      ],
      copy_blob: {
        label: "The marker line",
        value_ref: "faq_marker_html",
        helper: "Paste exactly as written. No additional attributes or classes needed. The accordion styling uses your site's existing CSS.",
      },
    },
    {
      id: "verify_render",
      title: "Verify the FAQ section appears on the page",
      goal_line: "Reload the page where you pasted the marker. The FAQ accordion should render in that spot.",
      actions: [
        "Open the page in a fresh browser tab (no cache)",
        "Scroll to where you pasted the marker",
        "Confirm a list of expandable question rows is visible (your approved FAQs)",
        "If nothing appears, check that the NeverRanked snippet is still installed on that page",
      ],
      closing_note:
        "Per-CMS notes: in WordPress, use the Custom HTML block or paste into Code Editor view. In Webflow, use an Embed component. In Shopify, edit the page Content and switch to <> source view. In Squarespace, use a Code block.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Action: NAP audit across the top 10 business directories
// ---------------------------------------------------------------------------

const NAP_AUDIT: ActionDefinition = {
  type: "nap_audit",
  title: "Audit your name, address, and phone across business directories",
  one_liner: "AI engines cross-reference directory listings to confirm you're who you say you are. Inconsistencies make engines trust you less.",
  boundary_framing:
    "We can't update directory listings as you. Each platform requires the business owner to sign in. Below is your verified name, address, and phone, plus a pre-built search link to each directory. Confirm what you see matches, or flag a mismatch and we'll track it.",
  why_this_matters:
    "AI engines (and Google's own ranking signals) cross-reference your business name, address, and phone across multiple directories to confirm you're a legitimate, established business. A phone number that doesn't match between Yelp and your website, or an old address still listed on Yellow Pages, makes engines downgrade their confidence in citing you. The fix is one quick visual check per directory; mismatches get a short fix list you can work through over a week.",
  time_estimate_minutes: 25,
  progress_shape: "checklist_driven",
  prerequisites: ["business_name"],
  steps: [],
  checklist_items: [
    {
      id: "yelp",
      label: "Yelp",
      url_template: "https://www.yelp.com/search?find_desc={business_name_url}&find_loc={city_url}",
      helper: "AI engines treat Yelp as a primary review and citation source for local businesses.",
      category: "review",
    },
    {
      id: "yellow_pages",
      label: "Yellow Pages",
      url_template: "https://www.yellowpages.com/search?search_terms={business_name_url}&geo_location_terms={city_url}",
      helper: "Legacy directory still indexed by Bing and used by older citation aggregators.",
      category: "directory",
    },
    {
      id: "bbb",
      label: "Better Business Bureau",
      url_template: "https://www.bbb.org/search?find_country=USA&find_text={business_name_url}&find_loc={city_url}",
      helper: "Trust signal for AI engines on financial, legal, and service-business queries.",
      category: "review",
    },
    {
      id: "foursquare",
      label: "Foursquare",
      url_template: "https://foursquare.com/explore?q={business_name_url}&near={city_url}",
      helper: "Powers location data for Apple Maps, Uber, Square, and many travel apps.",
      category: "directory",
    },
    {
      id: "tripadvisor",
      label: "TripAdvisor",
      url_template: "https://www.tripadvisor.com/Search?q={business_name_url}",
      helper: "Critical for hospitality, dining, and attractions. AI engines weight TripAdvisor heavily on tourism queries.",
      category: "review",
    },
    {
      id: "trustpilot",
      label: "Trustpilot",
      url_template: "https://www.trustpilot.com/search?query={business_name_url}",
      helper: "AI engines cite Trustpilot reviews on ecommerce and software queries.",
      category: "review",
    },
    {
      id: "linkedin",
      label: "LinkedIn Company Page",
      url_template: "https://www.linkedin.com/search/results/companies/?keywords={business_name_url}",
      helper: "Confirms business is a real organization for B2B queries.",
      category: "social",
    },
    {
      id: "facebook",
      label: "Facebook Business Page",
      url_template: "https://www.facebook.com/search/pages/?q={business_name_url}",
      helper: "Indexed by both Google and Bing as a verified business signal.",
      category: "social",
    },
    {
      id: "glassdoor",
      label: "Glassdoor",
      url_template: "https://www.glassdoor.com/Search/results.htm?keyword={business_name_url}",
      helper: "Employer-side signal that confirms business is operating and hiring.",
      category: "directory",
    },
    {
      id: "industry",
      label: "Your industry-specific directory",
      url_template: "https://www.google.com/search?q={business_name_url}+best+of+{city_url}+directory",
      helper: "Healthgrades for medical. Avvo for legal. ZocDoc for healthcare. Find your category's top directory and check NAP there too.",
      category: "industry",
    },
  ],
};

// ---------------------------------------------------------------------------
// Action: FAQ review (item-driven, no walkthrough steps)
// ---------------------------------------------------------------------------

const FAQ_REVIEW: ActionDefinition = {
  type: "faq_review",
  title: "Review your AI-facing FAQ schema",
  one_liner: "Approve FAQs that close the gaps where AI engines answer about your category without naming you.",
  boundary_framing:
    "We can't decide your brand voice. Review each FAQ below: approve the ones that fit, edit anything that needs your voice, reject anything off-brand. Approved FAQs deploy automatically to your domain.",
  why_this_matters:
    "AI engines answer questions in your category every day. For each query where they answered without naming you, we generated a FAQ in your voice. Approve it and it deploys to your domain. Next time the engine answers the same question, your schema is the citation source.",
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
  apple_business_connect: APPLE_BUSINESS_CONNECT,
  faq_marker_install: FAQ_MARKER_INSTALL,
  nap_audit: NAP_AUDIT,
};

export const V1_ACTIVE_ACTIONS: ActionType[] = [
  "faq_review",
  "bing_for_business",
  "apple_business_connect",
  "faq_marker_install",
  "nap_audit",
];
