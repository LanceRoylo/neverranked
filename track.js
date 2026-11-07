/*
 * Ad measurement for neverranked.com and check.neverranked.com.
 *
 * Paste the two IDs below to switch the tags on. While an ID is empty, that
 * tag makes no network call and no cookie is set. Setup: content/pixel-setup.md
 *
 * What this file must never send to Meta or LinkedIn: an email address, the
 * site someone checked, a score, or a private page's URL. So it refuses to run
 * on any URL carrying a query string it does not recognise, and it turns off
 * Meta's automatic reading of page content.
 */
(function () {
  "use strict";

  var META_PIXEL_ID = "";
  var LINKEDIN_PARTNER_ID = "";
  // Conversion IDs from LinkedIn Campaign Manager. Empty means not sent.
  var LINKEDIN_CONVERSIONS = { scan_complete: "", lead: "", checkout: "" };

  var ANSWER_CHECK_LINK = "buy.stripe.com/28EeVc6dMaId5cj08Je3e01";
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  var SAFE_PARAMS = UTM_KEYS.concat(["fbclid", "li_fat_id", "gclid"]);
  var PRIVATE_PATHS = /^\/(pitch|atlas-preview|takedowns|unsubscribe)(\/|$)/;

  var params = new URLSearchParams(location.search);

  // Keep the ad's UTM tags through to the free check. No network call.
  var utm = {};
  try { utm = JSON.parse(sessionStorage.getItem("nr_utm") || "{}") || {}; } catch (e) {}
  var fresh = {};
  UTM_KEYS.forEach(function (k) { if (params.get(k)) fresh[k] = params.get(k); });
  if (Object.keys(fresh).length) {
    utm = fresh;
    try { sessionStorage.setItem("nr_utm", JSON.stringify(utm)); } catch (e) {}
  }

  // Every event goes through here. A no-op until a tag has loaded.
  var meta = false;
  var linkedin = false;
  window.nrTrack = function (name) {
    if (meta) {
      if (name === "scan_complete") window.fbq("track", "ViewContent", { content_name: "free_check_result" });
      if (name === "pricing_view") window.fbq("track", "ViewContent", { content_name: "pricing" });
      if (name === "lead") window.fbq("track", "Lead");
      if (name === "checkout") window.fbq("track", "InitiateCheckout", { content_name: "written_answer_check", value: 249, currency: "USD" });
    }
    if (linkedin && LINKEDIN_CONVERSIONS[name]) {
      window.lintrk("track", { conversion_id: Number(LINKEDIN_CONVERSIONS[name]) });
    }
  };

  document.addEventListener("click", function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
    if (!a) return;
    if (a.hostname === "check.neverranked.com" && location.hostname !== a.hostname && Object.keys(utm).length) {
      var u = new URL(a.href);
      UTM_KEYS.forEach(function (k) { if (utm[k]) u.searchParams.set(k, utm[k]); });
      a.href = u.toString();
    }
    if (a.href.indexOf(ANSWER_CHECK_LINK) !== -1) window.nrTrack("checkout");
  }, true);

  if (!META_PIXEL_ID && !LINKEDIN_PARTNER_ID) return;
  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === "1") return;
  if (PRIVATE_PATHS.test(location.pathname)) return;
  if (location.hash && !/^#[A-Za-z0-9_-]*$/.test(location.hash)) return;

  // The check page takes ?url= from links. Drop it before any tag reads the
  // address, so the site being checked never reaches Meta or LinkedIn.
  if (location.hostname === "check.neverranked.com" && params.has("url")) {
    params.delete("url");
    var rest = params.toString();
    history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
  }
  // Anything else unknown (a white-label link, a token) means no tags here.
  var unknown = false;
  params.forEach(function (_v, k) { if (SAFE_PARAMS.indexOf(k) === -1) unknown = true; });
  if (unknown) return;

  function load(src) {
    var s = document.createElement("script");
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }

  if (META_PIXEL_ID) {
    var fbq = window.fbq = function () {
      if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
      else fbq.queue.push(arguments);
    };
    if (!window._fbq) window._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    load("https://connect.facebook.net/en_US/fbevents.js");
    fbq("set", "autoConfig", false, META_PIXEL_ID);
    fbq("init", META_PIXEL_ID);
    fbq("track", "PageView");
    meta = true;
  }

  if (LINKEDIN_PARTNER_ID) {
    window._linkedin_partner_id = LINKEDIN_PARTNER_ID;
    window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
    window._linkedin_data_partner_ids.push(LINKEDIN_PARTNER_ID);
    var lintrk = window.lintrk = function (a, b) { lintrk.q.push([a, b]); };
    lintrk.q = [];
    load("https://snap.licdn.com/li.lms-analytics/insight.min.js");
    linkedin = true;
  }

  if (/^\/pricing\/?$/.test(location.pathname)) window.nrTrack("pricing_view");
})();
