import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import App from "./App";

describe("disconnected dashboard", () => {
  it("shows local environment and explicit empty session state", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("LOCAL ENVIRONMENT");
    expect(html).toContain("No payments observed yet");
    expect(html).toContain("Connect a synthetic merchant");
    expect(html).toContain("not account-wide history");
    expect(html).not.toContain("¥1,200");
  });
});
