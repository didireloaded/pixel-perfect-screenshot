import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ManagerFrame } from "../components/app/ManagerFrame";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("contains mobile navigation focus and restores the page after Escape", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  render(
    <ManagerFrame active="Tasks" onSelect={() => {}}>
      <p>Work records</p>
    </ManagerFrame>,
  );
  const toggle = screen.getByRole("button", { name: "Toggle navigation" });
  toggle.focus();
  fireEvent.click(toggle);
  expect(document.querySelector("main")?.inert).toBe(true);
  expect(document.body.style.overflow).toBe("hidden");
  const sidebar = screen.getByLabelText("Manager navigation");
  expect(sidebar.contains(document.activeElement)).toBe(true);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(document.querySelector("main")?.inert).toBe(false);
  expect(document.body.style.overflow).toBe("");
  expect(document.activeElement).toBe(toggle);
});
