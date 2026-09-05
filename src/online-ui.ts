import type { Room, SchoolRecord } from "./online-client";
export const raceTime = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
export class OnlineUI {
  private busy = false;
  private hasRoom = false;
  readonly element = document.createElement("section");
  constructor() {
    this.element.id = "online";
    this.element.className = "panel online-panel hidden";
    this.element.innerHTML = `<span class="eyebrow">AFTER-SCHOOL CLUB / BRING YOUR ACCOMPLICE</span><h2>School records.<br><em>Friendly trouble.</em></h2><p>Leave your mark on the school. Race a ghost, or invite friends to borrow a trolley.</p><div class="online-identity"><label for="online-name">YOUR CLUB NAME</label><input id="online-name" maxlength="20" autocomplete="nickname" placeholder="The Doodler"><span>Public on school records · no signup</span></div><div id="online-status" class="online-status" role="status" aria-live="polite"></div><div class="online-grid"><section class="online-card"><span class="tiny">01 / SCHOOL RECORDS</span><h3>Beat the bell.</h3><p>Three laps. One projector. Server-checked time trials, with the same rules for everyone.</p><div class="online-filters"><label>PLAYGROUND<select id="online-track"></select></label><label>TROLLEY<select id="online-setup"></select></label><label>RECORDS<select id="online-period"><option value="week">This week</option><option value="all">All time</option></select></label></div><button id="online-trial" class="primary">SET A SCHOOL RECORD ↗</button><button id="online-refresh" class="text-button">REFRESH RECORDS ↻</button><ol id="online-records" class="online-records"></ol><p id="online-ghost-note" class="online-ghost-note"></p></section><section class="online-card"><span class="tiny">02 / PRIVATE FRIEND ROOMS</span><h3>Borrow together.</h3><p>Up to four racers. Share a private invitation. Bots keep spare projectors warm.</p><button id="online-create" class="primary">OPEN THE CLUB ↗</button><label class="join-label" for="online-code">GOT AN INVITE?</label><div class="online-join"><input id="online-code" maxlength="64" placeholder="Paste room code or invite link" autocomplete="off"><button id="online-join" class="secondary">JOIN</button></div><div id="online-room" class="hidden"><div class="room-title"><strong>THE CLUB IS OPEN</strong><button id="online-copy" class="text-button">COPY INVITE ↗</button></div><ol id="online-players" class="online-players"></ol><p id="online-room-note"></p><button id="online-room-start" class="primary">RING THE START BELL ↗</button><button id="online-leave" class="text-button">LEAVE CLUB</button></div></section></div><button id="online-back" class="secondary">BACK TO THE PLAYGROUND</button>`;
    document.querySelector("#app")!.append(this.element);
    try {
      this.input("online-name").value =
        localStorage.getItem("overdrive-club-name") || "The Doodler";
    } catch {}
  }
  el<T extends HTMLElement = HTMLElement>(id: string) {
    return this.element.querySelector<T>("#" + id)!;
  }
  input(id: string) {
    return this.el<HTMLInputElement>(id);
  }
  status(message: string, error = false) {
    const el = this.el("online-status");
    el.textContent = message;
    el.classList.toggle("is-error", error);
  }
  setBusy(busy: boolean) {
    this.busy = busy;
    this.element
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((b) => (b.disabled = busy));
    for (const id of ["online-create", "online-join"])
      this.el<HTMLButtonElement>(id).disabled = busy || this.hasRoom;
  }
  records(records: SchoolRecord[], onGhost: (id: string) => void) {
    const list = this.el("online-records");
    list.replaceChildren();
    if (!records.length) {
      const li = document.createElement("li");
      li.textContent = "An empty noticeboard. Make the first mark.";
      list.append(li);
    }
    records.forEach((r, i) => {
      const row = document.createElement("li");
      const position = document.createElement("b");
      position.textContent = String(i + 1).padStart(2, "0");
      const name = document.createElement("span");
      name.textContent = r.name;
      const time = document.createElement("strong");
      time.textContent = raceTime(r.time);
      const race = document.createElement("button");
      race.className = "text-button";
      race.textContent = "RACE GHOST ↗";
      race.onclick = () => onGhost(r.ghostId);
      row.append(position, name, time, race);
      list.append(row);
    });
  }
  room(room: Room | null, ownId?: string) {
    this.hasRoom = !!room;
    this.setBusy(this.busy);
    this.el("online-room").classList.toggle("hidden", !room);
    if (!room) return;
    const list = this.el("online-players");
    list.replaceChildren();
    room.players.forEach((p) => {
      const row = document.createElement("li");
      const dot = document.createElement("i");
      dot.style.background = /^#[0-9a-f]{6}$/i.test(p.color)
        ? p.color
        : "#54cbb8";
      const name = document.createElement("span");
      name.textContent = p.name;
      const tag = document.createElement("small");
      tag.textContent = p.bot
        ? "SCHOOL BOT"
        : p.id === room.hostId
          ? "HOST"
          : p.id === ownId
            ? "YOU"
            : "READY";
      row.append(dot, name, tag);
      list.append(row);
    });
    this.el("online-room-note").textContent =
      room.hostId === ownId
        ? "Everyone in? Ring the bell when you’re ready."
        : "Waiting for your host to ring the bell…";
    this.el("online-room-start").classList.toggle(
      "hidden",
      room.hostId !== ownId || room.status !== "lobby",
    );
  }
}
