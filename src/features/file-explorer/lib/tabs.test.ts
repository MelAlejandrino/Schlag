import { describe, expect, it } from "vitest";
import { createTab, nextActiveTabId, reorderTabs, tabLabel, type Tab } from "./tabs";
import { THIS_PC } from "../file-explorer.types";

function tab(id: string): Tab {
  return { ...createTab("C:\\x"), id };
}

describe("createTab", () => {
  it("starts with empty history (navigate seeds the first entry) and no selection", () => {
    const t = createTab("C:\\Users\\carlo\\Documents");
    expect(t.currentPath).toBe("C:\\Users\\carlo\\Documents");
    expect(t.addressInput).toBe("C:\\Users\\carlo\\Documents");
    // Empty, not [path] — seeding here would make navigate() append a
    // duplicate and wrongly enable Back on a fresh tab.
    expect(t.history).toEqual([]);
    expect(t.historyIndex).toBe(-1);
    expect(t.entries).toEqual([]);
    expect(t.selectedPaths).toEqual([]);
    expect(t.selectionAnchor).toBeNull();
  });

  it("uses the This PC label for the sentinel path's addressInput", () => {
    expect(createTab(THIS_PC).addressInput).toBe("This PC");
  });

  it("gives every tab a distinct id", () => {
    expect(createTab("C:\\a").id).not.toBe(createTab("C:\\a").id);
  });
});

describe("nextActiveTabId", () => {
  it("leaves the active tab unchanged when closing a background tab", () => {
    const tabs = [tab("a"), tab("b"), tab("c")];
    expect(nextActiveTabId(tabs, "b", "c")).toBe("b");
  });

  it("prefers the tab to the right when closing the active tab", () => {
    const tabs = [tab("a"), tab("b"), tab("c")];
    expect(nextActiveTabId(tabs, "b", "b")).toBe("c");
  });

  it("falls back to the tab on the left when closing the rightmost active tab", () => {
    const tabs = [tab("a"), tab("b"), tab("c")];
    expect(nextActiveTabId(tabs, "c", "c")).toBe("b");
  });

  it("returns null when closing the only remaining tab", () => {
    const tabs = [tab("a")];
    expect(nextActiveTabId(tabs, "a", "a")).toBeNull();
  });
});

describe("reorderTabs", () => {
  it("moves a tab to sit just before the target when insertAfter is false", () => {
    const tabs = [tab("a"), tab("b"), tab("c"), tab("d")];
    expect(reorderTabs(tabs, "a", "c", false).map((t) => t.id)).toEqual(["b", "a", "c", "d"]);
  });

  it("moves a tab to sit just after the target when insertAfter is true", () => {
    const tabs = [tab("a"), tab("b"), tab("c"), tab("d")];
    expect(reorderTabs(tabs, "a", "c", true).map((t) => t.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("can move a tab all the way to the end (insertAfter the last tab)", () => {
    const tabs = [tab("a"), tab("b"), tab("c"), tab("d")];
    expect(reorderTabs(tabs, "a", "d", true).map((t) => t.id)).toEqual(["b", "c", "d", "a"]);
  });

  it("works the same dragging right-to-left", () => {
    const tabs = [tab("a"), tab("b"), tab("c"), tab("d")];
    expect(reorderTabs(tabs, "d", "b", false).map((t) => t.id)).toEqual(["a", "d", "b", "c"]);
  });

  it("is a no-op when dragged onto itself", () => {
    const tabs = [tab("a"), tab("b")];
    expect(reorderTabs(tabs, "a", "a", false)).toEqual(tabs);
  });

  it("is a no-op when either id is unknown", () => {
    const tabs = [tab("a"), tab("b")];
    expect(reorderTabs(tabs, "missing", "b", false)).toEqual(tabs);
    expect(reorderTabs(tabs, "a", "missing", false)).toEqual(tabs);
  });
});

describe("tabLabel", () => {
  it("shows 'This PC' for the sentinel path", () => {
    expect(tabLabel(THIS_PC)).toBe("This PC");
  });

  it("shows the basename for a normal path", () => {
    expect(tabLabel("C:\\Users\\carlo\\Documents")).toBe("Documents");
  });

  it("shows the drive letter itself for a bare drive root", () => {
    expect(tabLabel("C:\\")).toBe("C:");
  });
});
