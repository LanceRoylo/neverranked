import { test } from "node:test";
import assert from "node:assert";
import { renderAtlasChat } from "../src/routes/atlas-chat.ts";

// Regression: chat history is embedded inside an inline <script> block. A stored
// message containing "</script>" (or a lone "<") must NOT break out of the tag,
// or an attacker-controlled message executes JS in the viewer's session
// (including an admin opening a customer's chat). See the pre-go-live audit.

test("a </script> in a stored message cannot break out of the inline <script>", () => {
  const evil = `</script><img src=x onerror=alert(document.cookie)>`;
  const html = renderAtlasChat("acme", "Acme Co", "Widgets", [
    { role: "user", content: evil },
  ] as any);

  // The raw closing-tag sequence must never appear verbatim in the output.
  assert.ok(
    !html.includes("</script><img"),
    "raw </script> breakout sequence leaked into the page",
  );
  // The payload must be present only in escaped unicode form.
  assert.ok(
    html.includes("\\u003c/script\\u003e") || html.includes("\\u003cimg"),
    "expected the message to be embedded as escaped \\u003c sequences",
  );
});

test("angle brackets and ampersands in the slug are escaped in the SCRIPT embed", () => {
  const html = renderAtlasChat(`a"</script><b>`, "Acme", null, [] as any);
  assert.ok(!html.includes("</script><b>"), "slug broke out of the script tag");
});
