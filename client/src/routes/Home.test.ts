/** The front page: a code typed the way it was shouted, the public lobbies, and the rooms created here. */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../lib/api";
import { pastGames, savePastGame } from "../lib/history";
import { rememberCreated, setSession } from "../lib/session";
import { headsDrawn } from "../test-heads";
import Home from "./Home.svelte";

vi.mock("../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/api")>();
  return { ...real, deleteRoom: vi.fn(), getPublicRooms: vi.fn(), getRoom: vi.fn() };
});

const navigate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(api.deleteRoom).mockResolvedValue(undefined);
  vi.mocked(api.getPublicRooms).mockResolvedValue([]);
  vi.mocked(api.getRoom).mockResolvedValue({ status: "lobby", players: 1 });
});

const LOBBY: api.PublicRoom = {
  code: "DRAGON",
  host: {
    id: "7da6f39a-535d-46db-9c02-801eff2c2eb1",
    display_name: "Zezima",
    avatar: 3,
  },
  players: 3,
  max_players: 50,
  rounds: 2,
  modes: ["more_less", "price_is_right"],
};

async function typeCode(typed: string): Promise<void> {
  await fireEvent.input(screen.getByLabelText("Room code"), {
    target: { value: typed },
  });
  await fireEvent.click(screen.getByRole("button", { name: "Join" }));
}

describe("Home", () => {
  it("challenges the visitor in the site's name, and one tap goes to Create", async () => {
    render(Home, { navigate });
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe(
      "Think you know Gielinor? Prove it at The Jolly Boar Inn.",
    );
    expect(heading.closest(".scroll")?.textContent).toContain(
      "Every question is OSRS and every second counts.",
    );
    await fireEvent.click(
      screen.getByRole("button", { name: "Create a room" }),
    );
    expect(navigate).toHaveBeenCalledWith("/create");
  });

  it("joins a code typed as two words", async () => {
    render(Home, { navigate });
    await typeCode("Ahrim's Staff");
    expect(navigate).toHaveBeenCalledWith("/r/AHRIMSSTAFF");
  });

  it("says so when what was typed is not a code, and stays put", async () => {
    render(Home, { navigate });
    await typeCode("- -");
    expect(screen.getByText("That is not a room code.")).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
    await fireEvent.input(screen.getByLabelText("Room code"), {
      target: { value: "dragon" },
    });
    expect(screen.queryByText("That is not a room code.")).toBeNull();
  });

  it("links to the admin view only for a browser that holds the admin token", async () => {
    render(Home, { navigate });
    expect(screen.queryByRole("button", { name: "Admin" })).toBeNull();
    cleanup();

    localStorage.setItem("jbi:admin", "0123456789abcdef0123456789abcdef");
    render(Home, { navigate });
    const admin = screen.getByRole("button", { name: "Admin" });
    expect(admin.closest(".panel")?.querySelector("h2")?.textContent).toBe(
      "Open source",
    );
    await fireEvent.click(admin);
    expect(navigate).toHaveBeenCalledWith("/admin");
  });

  it("lists only the rooms created here that have not expired", () => {
    localStorage.setItem(
      "jbi:created",
      JSON.stringify([
        { code: "RUNE", expires_at: "2099-01-01T00:00:00Z" },
        { code: "BRONZE", expires_at: "2000-01-01T00:00:00Z" },
      ]),
    );
    render(Home, { navigate });
    expect(screen.getByText("RUNE")).toBeTruthy();
    expect(screen.queryByText("BRONZE")).toBeNull();
  });

  it("tells each created room roughly how long it has left", () => {
    const left = (hours: number): string =>
      new Date(Date.now() + hours * 3_600_000 + 60_000).toISOString();
    rememberCreated("RUNE", left(31));
    rememberCreated("DRAGON", left(0.5));
    render(Home, { navigate });
    expect(
      screen.getByText("RUNE").closest("li")!.textContent,
    ).toContain("Expires in 31 hours");
    expect(
      screen.getByText("DRAGON").closest("li")!.textContent,
    ).toContain("Expires in under an hour");
  });

  it("tells each created room roughly how long it has left", () => {
    const left = (hours: number): string =>
      new Date(Date.now() + hours * 3_600_000 + 60_000).toISOString();
    rememberCreated("RUNE", left(31));
    rememberCreated("DRAGON", left(0.5));
    render(Home, { navigate });
    expect(
      screen.getByText("RUNE").closest("li")!.textContent,
    ).toContain("Expires in 31 hours");
    expect(
      screen.getByText("DRAGON").closest("li")!.textContent,
    ).toContain("Expires in under an hour");
  });

  describe("Public rooms", () => {
    it("lists each public lobby with its host, head and rounds, and joins it", async () => {
      vi.mocked(api.getPublicRooms).mockResolvedValue([LOBBY]);
      render(Home, { navigate });
      const row = (await screen.findByText("DRAGON")).closest("li")!;
      expect(
        screen.getByRole("heading", { name: "Public rooms" }),
      ).toBeTruthy();
      expect(within(row).getByText("Zezima")).toBeTruthy();
      expect(
        within(row).getByText(
          "3/50 players · 2 rounds: More or Less, The Price is Right",
        ),
      ).toBeTruthy();
      expect(headsDrawn(row)).toEqual([{ head: 3, size: 32 }]);
      await fireEvent.click(
        within(row).getByRole("button", { name: "Join DRAGON" }),
      );
      expect(navigate).toHaveBeenCalledWith("/r/DRAGON");
    });

    it("names no rounds for a room that keeps them a surprise", async () => {
      const { modes: _, ...hidden } = LOBBY;
      vi.mocked(api.getPublicRooms).mockResolvedValue([
        { ...hidden, rounds: 1 },
      ]);
      render(Home, { navigate });
      expect(await screen.findByText("3/50 players · 1 round")).toBeTruthy();
    });

    it("says there are none when the list is empty or unreachable", async () => {
      render(Home, { navigate });
      await waitFor(() => expect(api.getPublicRooms).toHaveBeenCalledOnce());
      expect(
        screen.getByRole("heading", { name: "Public rooms" }),
      ).toBeTruthy();
      expect(
        screen.getByText("There are no public rooms right now."),
      ).toBeTruthy();
      cleanup();

      vi.mocked(api.getPublicRooms).mockRejectedValue(
        new api.ApiFailure(0, "unreachable", "down"),
      );
      render(Home, { navigate });
      await waitFor(() => expect(api.getPublicRooms).toHaveBeenCalledTimes(2));
      expect(
        screen.getByRole("heading", { name: "Public rooms" }),
      ).toBeTruthy();
      expect(
        screen.getByText("There are no public rooms right now."),
      ).toBeTruthy();
    });
  });

  describe("Remove", () => {
    beforeEach(() => {
      rememberCreated("RUNE", "2099-01-01T00:00:00Z");
      setSession("RUNE", "host-session");
    });

    it("removes the room only once the host confirms", async () => {
      render(Home, { navigate });
      await fireEvent.click(screen.getByRole("button", { name: "Remove" }));
      expect(api.deleteRoom).not.toHaveBeenCalled();
      const dialog = screen.getByRole("dialog");
      expect(dialog.textContent).toContain(
        "Remove room RUNE? Anybody still in it is dropped, and this cannot be undone.",
      );
      await fireEvent.click(
        within(dialog).getByRole("button", { name: "Remove" }),
      );
      expect(api.deleteRoom).toHaveBeenCalledWith("RUNE", "host-session");
      await waitFor(() => expect(screen.queryByText("RUNE")).toBeNull());
    });

    it("removes nothing when cancelled", async () => {
      render(Home, { navigate });
      await fireEvent.click(screen.getByRole("button", { name: "Remove" }));
      await fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Cancel",
        }),
      );
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(api.deleteRoom).not.toHaveBeenCalled();
      expect(screen.getByText("RUNE")).toBeTruthy();
    });
  });
});

describe("Room limit", () => {
  const HOSTED = ["RUNE", "DRAGON", "BARROWS", "ZULRAH", "VORKATH"];

  function host(codes: string[]): void {
    for (const code of codes) {
      rememberCreated(code, "2099-01-01T00:00:00Z");
      setSession(code, `s-${code}`);
    }
  }

  const create = (): HTMLButtonElement =>
    screen.getByRole("button", { name: "Create a room" });

  it("disables Create with a reason once five rooms are hosted here", async () => {
    host(HOSTED);
    render(Home, { navigate });
    const banner = await screen.findByText(/You already have five rooms/);
    expect(create().disabled).toBe(true);
    expect(create().getAttribute("aria-describedby")).toBe(banner.id);
  });

  it("leaves Create alone under five rooms, and asks the server nothing", async () => {
    host(HOSTED.slice(1));
    render(Home, { navigate });
    await waitFor(() => expect(api.getPublicRooms).toHaveBeenCalled());
    expect(create().disabled).toBe(false);
    expect(screen.queryByText(/You already have five rooms/)).toBeNull();
    expect(api.getRoom).not.toHaveBeenCalled();
  });

  it("does not count a room the server has already dropped", async () => {
    host(HOSTED);
    vi.mocked(api.getRoom).mockImplementation(async (code) => {
      if (code === "ZULRAH") throw new api.ApiFailure(410, "gone", "gone");
      return { status: "lobby", players: 1 };
    });
    render(Home, { navigate });
    await waitFor(() => expect(api.getRoom).toHaveBeenCalledTimes(5));
    await waitFor(() => expect(create().disabled).toBe(false));
  });

  it("frees Create the moment a room is removed", async () => {
    host(HOSTED);
    render(Home, { navigate });
    await screen.findByText(/You already have five rooms/);
    const rune = screen.getByText("RUNE").closest("li")!;
    await fireEvent.click(within(rune).getByRole("button", { name: "Remove" }));
    await fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }),
    );
    await waitFor(() => expect(create().disabled).toBe(false));
    expect(screen.queryByText(/You already have five rooms/)).toBeNull();
  });
});

describe("Desktop layout", () => {
  /** The column a panel sits in, or null when it spans the page. */
  function columnOf(heading: string): number | null {
    const column = screen
      .getByRole("heading", { name: heading })
      .closest(".column");
    if (column === null) return null;
    return [...document.querySelectorAll(".columns > .column")].indexOf(column);
  }

  it("puts Join and Host in one column, the room lists in the other, and Open source across both", async () => {
    rememberCreated("MINE", "2099-01-01T00:00:00Z");
    savePastGame({
      code: "ABYSSAL",
      finishedAt: "2026-10-01T20:05:00Z",
      standings: [
        { player_id: "a", display_name: "Zezima", points: 900, rank: 1 },
      ],
      youId: "a",
    });
    render(Home, { navigate });
    expect(columnOf("Join a room")).toBe(0);
    expect(columnOf("Host a room")).toBe(0);
    expect(columnOf("Public rooms")).toBe(1);
    expect(columnOf("Rooms you created here")).toBe(1);
    expect(columnOf("Past games")).toBe(1);
    expect(columnOf("Think you know Gielinor? Prove it at The Jolly Boar Inn.")).toBeNull();
    expect(columnOf("Open source")).toBeNull();
  });

  it("reads Join, Host, then the lists, which is the phone order too", () => {
    render(Home, { navigate });
    const order = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(order).toEqual([
      "Join a room",
      "Host a room",
      "Public rooms",
      "Open source",
    ]);
  });
});

describe("Past games", () => {
  it("lists each game with its room, when it finished and our place, and opens it", async () => {
    savePastGame({
      code: "ABYSSAL",
      finishedAt: "2026-10-01T20:05:00Z",
      standings: [
        { player_id: "a", display_name: "Zezima", points: 900, rank: 1 },
        { player_id: "b", display_name: "Woox", points: 400, rank: 2 },
      ],
      youId: "b",
    });
    render(Home, { navigate });
    const section = screen
      .getByRole("heading", { name: "Past games" })
      .closest("section")!;
    const row = within(section).getByText("ABYSSAL").closest("li")!;
    expect(row.textContent).toContain("2nd of 2");
    expect(row.textContent).toContain("2026");
    await fireEvent.click(
      within(row).getByRole("button", { name: "Hi-scores for ABYSSAL" }),
    );
    expect(navigate).toHaveBeenCalledWith("/history/ABYSSAL/2610012005");
  });

  describe("removing one", () => {
    const standings = [
      { player_id: "a", display_name: "Zezima", points: 900, rank: 1 },
    ];

    beforeEach(() => {
      savePastGame({ code: "ABYSSAL", finishedAt: "2026-10-01T20:05:00Z", standings, youId: "a" });
      savePastGame({ code: "RUNE", finishedAt: "2026-10-02T20:05:00Z", standings, youId: "a" });
    });

    const section = (): HTMLElement =>
      screen.getByRole("heading", { name: "Past games" }).closest("section")!;

    async function askToRemove(code: string): Promise<void> {
      await fireEvent.click(
        within(section()).getByRole("button", { name: `Remove ${code} from past games` }),
      );
    }

    it("asks first, and keeps the game when the answer is cancel", async () => {
      render(Home, { navigate });
      await askToRemove("ABYSSAL");
      const dialog = screen.getByRole("dialog");
      expect(dialog.textContent).toContain("ABYSSAL");
      await fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(within(section()).getByText("ABYSSAL")).toBeTruthy();
      expect(pastGames()).toHaveLength(2);
    });

    it("drops only that game from the list and from storage on yes", async () => {
      render(Home, { navigate });
      await askToRemove("ABYSSAL");
      await fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }),
      );
      expect(within(section()).queryByText("ABYSSAL")).toBeNull();
      expect(within(section()).getByText("RUNE")).toBeTruthy();
      expect(pastGames().map((game) => game.code)).toEqual(["RUNE"]);
    });

    it("takes the section away with the last game", async () => {
      render(Home, { navigate });
      for (const code of ["ABYSSAL", "RUNE"]) {
        await askToRemove(code);
        await fireEvent.click(
          within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }),
        );
      }
      expect(screen.queryByRole("heading", { name: "Past games" })).toBeNull();
    });
  });

  it("is not there before a game has finished here", () => {
    render(Home, { navigate });
    expect(screen.queryByRole("heading", { name: "Past games" })).toBeNull();
  });
});

describe("Suggest a question", () => {
  it("is offered once a game has finished here, and goes to the form", async () => {
    savePastGame({
      code: "ABYSSAL",
      finishedAt: "2026-10-01T20:05:00Z",
      standings: [{ player_id: "a", display_name: "Zezima", points: 900, rank: 1 }],
      youId: "a",
    });
    render(Home, { navigate });
    const section = screen
      .getByRole("heading", { name: "Suggest a question" })
      .closest("section")!;
    await fireEvent.click(
      within(section).getByRole("button", { name: "Suggest something" }),
    );
    expect(navigate).toHaveBeenCalledWith("/suggest");
  });

  it("is not there before a game has finished here", () => {
    render(Home, { navigate });
    expect(
      screen.queryByRole("heading", { name: "Suggest a question" }),
    ).toBeNull();
  });
});
