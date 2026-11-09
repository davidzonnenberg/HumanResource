// Chooses the right Panel for the current selection / slot pick / finance view, refreshing at the
// throttled sim version (design: simBridge, <= 5 Hz).
import { type DefinitionRegistry, type SimState } from '@hr/sim';
import { bridge } from '../../store/simBridge';
import { useSimVersion, useUi } from '../../store/stores';
import { PubPanel } from './PubPanel';
import { SlotPicker } from './SlotPicker';
import { CompetitorPanel, CustomerPanel, FinancePanel, HumanPanel, PlotPanel, SupplierPanel, VehiclePanel } from './InfoPanels';

export function PanelHost() {
  useSimVersion((s) => s.v); // refresh panels at <= 5 Hz
  const selection = useUi((u) => u.selection);
  const pickingSlot = useUi((u) => u.pickingSlot);
  const financeOpen = useUi((u) => u.financeOpen);
  const reg = bridge.reg;
  const state = bridge.loop?.sim.state;
  if (!reg || !state) return null;
  const close = () => useUi.getState().set({ selection: null });

  if (pickingSlot) return <SlotPicker reg={reg} state={state} picking={pickingSlot} onClose={() => useUi.getState().set({ pickingSlot: null })} />;
  if (financeOpen) return <FinancePanel reg={reg} state={state} onClose={() => useUi.getState().set({ financeOpen: false })} />;
  if (!selection) return null;

  switch (selection.kind) {
    case 'business': {
      const b = state.businesses[selection.id];
      if (!b) return null;
      if (reg.businesses[b.defId]?.supplier) return <SupplierPanel reg={reg} state={state} b={b} onClose={close} />;
      if (b.owner !== 'player' && reg.businesses[b.defId]?.pub) return <CompetitorPanel reg={reg} state={state} b={b} onClose={close} />;
      if (reg.businesses[b.defId]?.pub) return <PubPanel reg={reg} state={state} b={b} onClose={close} />;
      return <SupplierPanel reg={reg} state={state} b={b} onClose={close} />;
    }
    case 'vehicle': {
      const v = state.vehicles[selection.id];
      return v ? <VehiclePanel reg={reg} state={state} v={v} onClose={close} /> : null;
    }
    case 'human': {
      const h = state.humans[selection.id];
      return h ? <HumanPanel reg={reg as DefinitionRegistry} state={state as SimState} human={h} onClose={close} /> : null;
    }
    case 'plot':
      return <PlotPanel reg={reg} state={state} plotId={selection.id} onClose={close} />;
    case 'customer':
      return <CustomerPanel reg={reg} state={state} customerId={selection.id} onClose={close} />;
  }
}
