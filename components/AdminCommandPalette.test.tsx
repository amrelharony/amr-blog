// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

// Hoisted mock state so the vi.mock factories can reference it.
const h = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), pathname: "/admin" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, refresh: h.refresh }),
  usePathname: () => h.pathname,
}));
vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({ auth: { signOut: () => Promise.resolve({ error: null }) } }),
}));

import AdminCommandPalette from "@/components/AdminCommandPalette";

const ctrlK = () => fireEvent.keyDown(document, { key: "k", ctrlKey: true });

beforeEach(() => {
  h.push.mockClear();
  h.pathname = "/admin";
  localStorage.clear();
});
afterEach(cleanup);

describe("AdminCommandPalette", () => {
  it("opens on ⌘K and pushes a route when a command is run", async () => {
    render(<AdminCommandPalette />);
    expect(screen.queryByRole("dialog")).toBeNull();
    ctrlK();
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByText("Dashboard"));
    expect(h.push).toHaveBeenCalledWith("/admin");
  });

  it("filters commands by query", async () => {
    render(<AdminCommandPalette />);
    ctrlK();
    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "analytics" } });
    expect(screen.getByText("Analytics")).toBeTruthy();
    expect(screen.queryByText("Dashboard")).toBeNull();
  });

  it("closes on Escape", async () => {
    render(<AdminCommandPalette />);
    ctrlK();
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not open on the login page", () => {
    h.pathname = "/admin/login";
    render(<AdminCommandPalette />);
    ctrlK();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
