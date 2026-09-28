// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { NoRelay } from "./NoRelay.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("tells the operator what to do and where it is looking", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(<NoRelay relay="http://127.0.0.1:7780" />));
  expect(container.textContent).toContain("No robot running");
  expect(container.textContent).toContain("Start a blueprint with a relay from Desktop");
  expect(container.textContent).toContain("http://127.0.0.1:7780");
  act(() => root.unmount());
});
