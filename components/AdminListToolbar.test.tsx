// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import AdminListToolbar from "@/components/AdminListToolbar";

afterEach(cleanup);

describe("AdminListToolbar", () => {
  it("calls onQuery when typing in search", () => {
    const onQuery = vi.fn();
    render(<AdminListToolbar query="" onQuery={onQuery} />);
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "agile" } });
    expect(onQuery).toHaveBeenCalledWith("agile");
  });

  it("renders status options and fires onStatus", () => {
    const onStatus = vi.fn();
    render(
      <AdminListToolbar
        query=""
        onQuery={() => {}}
        status="all"
        onStatus={onStatus}
        statusOptions={[
          { value: "all", label: "All" },
          { value: "live", label: "Live" },
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "live" } });
    expect(onStatus).toHaveBeenCalledWith("live");
  });

  it("shows the bulk bar with the count and fires bulk actions", () => {
    const onBulkDelete = vi.fn();
    const onClear = vi.fn();
    render(
      <AdminListToolbar
        query=""
        onQuery={() => {}}
        selectable
        selectedCount={2}
        onBulkDelete={onBulkDelete}
        onClearSelection={onClear}
      />,
    );
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByText("Delete"));
    expect(onBulkDelete).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Clear"));
    expect(onClear).toHaveBeenCalled();
  });

  it("hides the bulk bar when nothing is selected", () => {
    render(
      <AdminListToolbar query="" onQuery={() => {}} selectable selectedCount={0} onBulkDelete={() => {}} />,
    );
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it("toggles select-all", () => {
    const onToggleAll = vi.fn();
    render(
      <AdminListToolbar query="" onQuery={() => {}} selectable allSelected={false} onToggleAll={onToggleAll} />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggleAll).toHaveBeenCalled();
  });
});
