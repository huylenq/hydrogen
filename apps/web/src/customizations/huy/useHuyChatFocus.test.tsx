import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { requestModalFocus, useModalKeyboardStore } from "../../modalKeyboardStore";
import { useHuyChatFocus } from "./useHuyChatFocus";

const host = vi.hoisted(() => ({
  sidebar: {
    open: true,
    setOpen: vi.fn(),
    isMobile: false,
    openMobile: false,
    setOpenMobile: vi.fn(),
  },
  focus: vi.fn(() => true),
  show: vi.fn(),
  close: vi.fn(),
  enabled: true,
}));
vi.mock("../../components/ui/sidebar", () => ({ useSidebar: () => host.sidebar }));
vi.mock("../../hooks/useSettings", () => ({
  getClientSettings: () => ({ modalKeyboardEnabled: host.enabled }),
}));
vi.mock("../../modalKeyboardDom", () => ({ focusModalSurface: host.focus }));
vi.mock("../../rightPanelStore", () => ({
  useRightPanelStore: { getState: () => ({ show: host.show, close: host.close }) },
}));

let renderer: ReactTestRenderer | undefined;
const thread = { environmentId: EnvironmentId.make("test"), threadId: ThreadId.make("thread") };
const noop = () => {};
function Chat({
  open = false,
  present = false,
  sheet = false,
  maximized = false,
  reveal = noop,
}: {
  open?: boolean;
  present?: boolean;
  sheet?: boolean;
  maximized?: boolean;
  reveal?: () => void;
}) {
  useHuyChatFocus({
    activeThreadRef: thread,
    rightPanelOpen: open,
    rightPanelPresent: present,
    shouldUseRightPanelSheet: sheet,
    rightPanelMaximized: maximized,
    revealConversation: reveal,
  });
  return null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  host.enabled = true;
  host.sidebar.isMobile = false;
  host.sidebar.openMobile = false;
  useModalKeyboardStore.setState(useModalKeyboardStore.getInitialState(), true);
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

describe("chat focus lifecycle", () => {
  it("reveals a panel and waits for its DOM before fulfilling the focus request", async () => {
    requestModalFocus("rightPanel", true);
    await act(() => {
      renderer = create(<Chat />);
    });
    expect(host.show).toHaveBeenCalledWith(thread);
    expect(host.focus).not.toHaveBeenCalled();
    await act(() => renderer?.update(<Chat open />));
    expect(host.focus).not.toHaveBeenCalled();
    await act(() => renderer?.update(<Chat open present />));
    expect(host.focus).toHaveBeenCalledWith("rightPanel", true);
    expect(useModalKeyboardStore.getState().focusRequest).toBeNull();
  });
  it("closes a sheet before moving focus back to conversation", async () => {
    requestModalFocus("conversation");
    await act(() => {
      renderer = create(<Chat open present sheet />);
    });
    expect(host.close).toHaveBeenCalledWith(thread);
    expect(host.focus).not.toHaveBeenCalled();
    await act(() => renderer?.update(<Chat present sheet />));
    expect(host.focus).not.toHaveBeenCalled();
    await act(() => renderer?.update(<Chat sheet />));
    expect(host.focus).toHaveBeenCalledWith("conversation", false);
  });
  it("restores the conversation from a maximized panel before focusing", async () => {
    requestModalFocus("conversation");
    const reveal = vi.fn();
    await act(() => {
      renderer = create(<Chat open present maximized reveal={reveal} />);
    });
    expect(reveal).toHaveBeenCalledOnce();
    expect(host.focus).not.toHaveBeenCalled();
    await act(() => renderer?.update(<Chat open present reveal={reveal} />));
    expect(useModalKeyboardStore.getState().focusRequest).toBeNull();
  });
  it("does not change focus when Vim navigation is disabled", async () => {
    host.enabled = false;
    requestModalFocus("rightPanel");
    await act(() => {
      renderer = create(<Chat />);
    });
    expect(host.show).not.toHaveBeenCalled();
    expect(host.focus).not.toHaveBeenCalled();
  });
});
