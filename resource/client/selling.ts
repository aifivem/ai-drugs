import {
  cache,
  callAction,
  every,
  hidePrompt,
  notify,
  onPromptPressed,
  player,
  radial,
  requestAnimDict,
  showPrompt,
} from "@aicore-fivem/lib/client";
import { readFinite } from "@aicore-fivem/lib/shared";
import { Locale } from "common";
import { EVENTS } from "common/drugs";

const PROMPT = "drugsale";

const distanceTo = (entity: number) => {
  const [x = 0, y = 0, z = 0] = GetEntityCoords(entity, false);
  const [px = 0, py = 0, pz = 0] = GetEntityCoords(cache.ped, false);
  return Math.hypot(x - px, y - py, z - pz);
};

/**
 * Street selling, switched on from the radial menu: once a second it brings a stranger from nearby to the player and
 * shows the sell prompt when they arrive; the server decides the sale.
 */
class Selling {
  private readonly job = every(1000, () => this.step(), {
    active: false,
    name: "selling",
  });
  private buyer = 0;
  private prompt = false;
  private readonly asked = new Set<number>();

  toggle(): void {
    if (this.job.running) {
      this.job.set(false);
      this.release();
      this.asked.clear();
      return notify(Locale("DRUGS_SELLING_OFF"), "info", 2000);
    }
    this.job.set(true);
    notify(Locale("DRUGS_SELLING_ON"), "info", 3000);
  }

  private step(): void {
    if (cache.vehicle !== false) return this.release();
    if (
      this.buyer &&
      (!DoesEntityExist(this.buyer) ||
        IsPedDeadOrDying(this.buyer, true) ||
        distanceTo(this.buyer) > 30)
    )
      this.release();
    if (!this.buyer) return this.findBuyer();
    const close = distanceTo(this.buyer) <= 2.2;
    if (close !== this.prompt) {
      this.prompt = close;
      if (close) showPrompt(PROMPT, Locale("DRUGS_PROMPT_SELL"));
      else hidePrompt(PROMPT);
    }
  }

  private findBuyer(): void {
    const peds = (GetGamePool("CPed") as number[]).filter(
      (ped) =>
        ped !== cache.ped &&
        !IsPedAPlayer(ped) &&
        IsPedHuman(ped) &&
        !IsPedInAnyVehicle(ped, false) &&
        !IsPedDeadOrDying(ped, true) &&
        NetworkGetEntityIsNetworked(ped) &&
        !this.asked.has(ped) &&
        distanceTo(ped) <= 25,
    );
    const ped = peds[Math.floor(Math.random() * peds.length)];
    if (ped === undefined) return;
    this.buyer = ped;
    this.asked.add(ped);
    ClearPedTasks(ped);
    SetBlockingOfNonTemporaryEvents(ped, true);
    TaskGoToEntity(ped, cache.ped, -1, 1.5, 1.0, 1073741824, 0);
  }

  private release(): void {
    if (this.prompt) hidePrompt(PROMPT);
    this.prompt = false;
    if (this.buyer && DoesEntityExist(this.buyer)) {
      SetBlockingOfNonTemporaryEvents(this.buyer, false);
      TaskWanderStandard(this.buyer, 10, 10);
    }
    this.buyer = 0;
  }

  async sell(): Promise<void> {
    const buyer = this.buyer;
    if (!buyer) return;
    const result = await callAction(
      EVENTS.sell,
      [NetworkGetNetworkIdFromEntity(buyer)],
      { fallback: "DRUGS_ERR_REFUSED" },
    );
    const count = readFinite(result?.count);
    const price = readFinite(result?.price);
    if (count !== null && price !== null) {
      const dict = await requestAnimDict("mp_common");
      TaskTurnPedToFaceEntity(buyer, cache.ped, 800);
      void player.playAnim("mp_common", "givetake1_a", {
        duration: 2000,
        flag: 0,
      });
      // The buyer is a world ped, not the local player: its animation stays a plain task.
      TaskPlayAnim(
        buyer,
        dict,
        "givetake1_b",
        8.0,
        -8.0,
        2000,
        0,
        0,
        false,
        false,
        false,
      );
      notify(Locale("DRUGS_SOLD", count, price), "success");
    }
    setTimeout(() => this.release(), 2000);
  }
}

const selling = new Selling();
onPromptPressed((id) => id === PROMPT && void selling.sell());

radial.add({
  id: "drugs_sell",
  label: Locale("DRUGS_RADIAL"),
  icon: "money-bill-wave",
  onPressed: () => selling.toggle(),
});
