import { expect, it, onTestFinished } from "vitest";
import { CdpBrowserProvider } from "../../../src/browser/CdpBrowserProvider.js";
import { inspectWebPageInputSchema } from "../../../src/domain/browserObservation.js";
import { startFakeCdpBrowser } from "../../fixtures/fakeCdpBrowser.js";

const inspect = async (emptyValue: unknown = -1) => {
  const browser = await startFakeCdpBrowser({
    commandResult: (command, origin) =>
      command.method === "DOMSnapshot.captureSnapshot"
        ? {
            strings: [
              origin + "/app?probe=1",
              "#document",
              "HTML",
              "FORM",
              "action",
              "svg",
              "a",
              "href",
              "xlink:href",
              "/fallback",
            ],
            documents: [
              {
                documentURL: 0,
                baseURL: -1,
                nodes: {
                  nodeType: [9, 1, 1, 1, 1],
                  nodeName: [1, 2, 3, 5, 6],
                  nodeValue: [-1, -1, emptyValue, -1, -1],
                  parentIndex: [-1, 0, 1, 1, 3],
                  attributes: [[], [], [4, emptyValue], [], [7, -1, 8, 9]],
                },
              },
            ],
          }
        : undefined,
  });
  onTestFinished(() => browser.close());
  const result = await new CdpBrowserProvider().inspectPage(
    inspectWebPageInputSchema.parse({
      cdp_endpoint: browser.endpoint,
      target_id: "allowed-page",
      allowed_origins: [browser.allowedOrigin],
      observation_ms: 0,
    }),
  );
  if (!result.ok) throw result.error;
  return { result: result.value, origin: browser.allowedOrigin };
};

it("retains Chromium empty-string sentinels across nodes, base URLs and attributes", async () => {
  const { result, origin } = await inspect();
  expect(result.dom.nodes.map((n) => n.node_name)).toEqual([
    "#document",
    "HTML",
    "FORM",
    "svg",
    "a",
  ]);
  expect(result.dom.nodes.every((n) => n.node_value_length === 0)).toBe(true);
  expect(result.metadata.dom_urls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        node_index: 2,
        attribute: "action",
        url: origin + "/app?probe=1",
      }),
      expect.objectContaining({
        node_index: 4,
        attribute: "href",
        url: origin + "/app?probe=1",
      }),
    ]),
  );
  expect(
    result.metadata.dom_urls.some((u) => u.url?.endsWith("/fallback")),
  ).toBe(false);
  expect(result.completeness.excluded.some((e) => e.section === "dom")).toBe(
    false,
  );
});

it.each([-2, 0.5, 999, null, "-1"])(
  "keeps malformed snapshot string index %s excluded",
  async (index) => {
    const { result } = await inspect(index);
    expect(result.dom.nodes.some((n) => n.node_name === "FORM")).toBe(false);
    expect(result.dom.nodes.some((n) => n.node_name === "HTML")).toBe(true);
    expect(result.completeness.excluded).toContainEqual(
      expect.objectContaining({
        section: "dom",
        reason: "invalid_protocol_value",
      }),
    );
  },
);
